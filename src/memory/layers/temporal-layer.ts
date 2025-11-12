/* global NodeJS */
/**
 * Temporal Layer: Time-based memory retrieval and historical context
 * - Optimized for time-based queries
 * - Maintains chronological relationships
 * - Provides historical context and trends
 */

import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join, dirname } from 'path';
import { BaseMemoryLayer } from '../base-layer.js';
import type { MemoryItem, MemoryLayerConfig, MemoryQuery, MemorySearchResult } from '../types.js';

export interface TemporalQuery extends MemoryQuery {
  timeRange?: {
    start: Date;
    end: Date;
  };
  chronological?: boolean; // Sort by time instead of relevance
  contextWindow?: number; // Include items before/after for context
}

export interface TemporalPattern {
  pattern: 'daily' | 'weekly' | 'monthly' | 'seasonal';
  strength: number; // 0-1
  description: string;
  examples: string[];
}

export class TemporalLayer extends BaseMemoryLayer {
  private readonly dataDir: string;
  private timeIndex = new Map<string, Set<string>>(); // time bucket -> item IDs
  private chronoIndex: Array<{ id: string; timestamp: number }> = []; // Sorted by time
  private persistenceInterval?: NodeJS.Timeout;
  private isDirty = false;
  private loadingPromise: Promise<void>;

  constructor(
    config: MemoryLayerConfig = { ttl: undefined },
    dataDir = './data/temporal'
  ) {
    // Default configuration for temporal layer
    const defaultConfig: MemoryLayerConfig = {
      maxItems: config.maxItems ?? 50000, // Very large capacity for historical data
      maxSizeBytes: config.maxSizeBytes ?? 500 * 1024 * 1024, // 500MB max
      compressionEnabled: config.compressionEnabled ?? true,
      indexingEnabled: config.indexingEnabled ?? true,
      ttl: config.ttl ?? undefined, // No expiration - keep historical data
    };

    super('temporal', defaultConfig);

    this.dataDir = dataDir;

    // Auto-save every 15 minutes if dirty
    this.setupAutoPersistence();

    this.logger.info('Temporal layer initialized', {
      dataDir,
      config: defaultConfig,
    });

    // Load existing data asynchronously
    this.loadingPromise = this.loadFromDisk().catch(error => {
      this.logger.error('Failed to load temporal data', { error: error instanceof Error ? error.message : error });
      // Don't throw here - let the system continue with empty state
    });
  }

  /**
   * Wait for the temporal layer to finish loading from disk
   */
  async waitForLoading(): Promise<void> {
    await this.loadingPromise;
  }

  override async store(item: Parameters<BaseMemoryLayer['store']>[0]): Promise<MemoryItem> {
    const result = await super.store(item);

    // Add to temporal indexes
    this.addToTimeIndex(result.id, result.createdAt);
    this.addToChronoIndex(result.id, result.createdAt);

    this.markDirty();
    return result;
  }

  override async search(query: MemoryQuery): Promise<MemorySearchResult[]> {
    const temporalQuery = query as TemporalQuery;

    // Handle time-based queries
    if (temporalQuery.timeRange || temporalQuery.chronological) {
      return this.temporalSearch(temporalQuery);
    }

    // Regular search with temporal scoring
    const results = await super.search(query);

    // Apply temporal scoring boost
    return results.map(result => ({
      ...result,
      score: this.applyTemporalScoring(result.score, result.memory),
      explanation: result.explanation + this.getTemporalExplanation(result.memory),
    }));
  }

  override async delete(id: string): Promise<boolean> {
    const item = this.items.get(id);
    const result = await super.delete(id);

    if (result && item) {
      this.removeFromTimeIndex(id, item.createdAt);
      this.removeFromChronoIndex(id);
      this.markDirty();
    }

    return result;
  }

  override async optimize(): Promise<void> {
    // Clean up first
    await this.cleanup();

    // Rebuild all temporal indexes
    this.timeIndex.clear();
    this.chronoIndex = [];

    for (const [id, item] of this.items) {
      this.addToTimeIndex(id, item.createdAt);
      this.addToChronoIndex(id, item.createdAt);
      this.updateIndex(id, item);
    }

    // Sort chronological index
    this.chronoIndex.sort((a, b) => a.timestamp - b.timestamp);

    // Compress historical data
    if (this.config.compressionEnabled) {
      await this.compressHistoricalData();
    }

    // Persist optimized data
    await this.saveToDisk();

    this.logger.info('Temporal layer optimized', {
      itemCount: this.items.size,
      timeIndexSize: this.timeIndex.size,
      chronoIndexSize: this.chronoIndex.length,
    });
  }

  override async backup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `temporal-${timestamp}`;
    const backupPath = join(this.dataDir, 'backups', `${backupId}.json`);

    await this.ensureDirectoryExists(dirname(backupPath));

    const backupData = {
      timestamp: new Date().toISOString(),
      items: await this.export(),
      timeIndex: Object.fromEntries(
        Array.from(this.timeIndex.entries()).map(([key, set]) => [key, Array.from(set)])
      ),
      chronoIndex: this.chronoIndex,
      metadata: {
        version: '1.0',
        layerType: 'temporal',
        totalItems: this.items.size,
      },
    };

    await writeFile(backupPath, JSON.stringify(backupData, null, 2));

    this.logger.info('Temporal layer backup created', {
      backupId,
      backupPath,
      itemCount: backupData.items.length,
    });

    return backupId;
  }

  override async restore(backupId: string): Promise<boolean> {
    try {
      const backupPath = join(this.dataDir, 'backups', `${backupId}.json`);
      const backupData = JSON.parse(await readFile(backupPath, 'utf-8'));

      // Clear current data
      this.items.clear();
      this.index.clear();
      this.timeIndex.clear();
      this.chronoIndex = [];

      // Import backup data
      const importedCount = await this.import(backupData.items);

      // Restore temporal indexes
      if (backupData.timeIndex) {
        for (const [bucket, ids] of Object.entries(backupData.timeIndex)) {
          this.timeIndex.set(bucket, new Set(ids as string[]));
        }
      }

      if (backupData.chronoIndex) {
        this.chronoIndex = backupData.chronoIndex;
      }

      // Save restored data
      await this.saveToDisk();

      this.logger.info('Temporal layer restored from backup', {
        backupId,
        importedCount,
        timeIndexSize: this.timeIndex.size,
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to restore from backup', {
        backupId,
        error: error instanceof Error ? error.message : error,
      });
      return false;
    }
  }

  /**
   * Get memories from a specific time range
   */
  async getMemoriesInRange(start: Date, end: Date, limit = 100): Promise<MemoryItem[]> {
    const results: MemoryItem[] = [];
    const startTime = start.getTime();
    const endTime = end.getTime();

    // Use chronological index for efficient range queries
    for (const entry of this.chronoIndex) {
      if (entry.timestamp < startTime) continue;
      if (entry.timestamp > endTime) break;

      const item = this.items.get(entry.id);
      if (item) {
        results.push(item);
        if (results.length >= limit) break;
      }
    }

    return results;
  }

  /**
   * Analyze temporal patterns in the data
   */
  async analyzeTemporalPatterns(): Promise<TemporalPattern[]> {
    const patterns: TemporalPattern[] = [];
    const items = Array.from(this.items.values());

    if (items.length < 10) {
      return patterns; // Need more data for pattern analysis
    }

    // Daily patterns
    const dailyPattern = this.analyzeDailyPattern(items);
    if (dailyPattern.strength > 0.3) {
      patterns.push(dailyPattern);
    }

    // Weekly patterns
    const weeklyPattern = this.analyzeWeeklyPattern(items);
    if (weeklyPattern.strength > 0.3) {
      patterns.push(weeklyPattern);
    }

    // Monthly patterns
    const monthlyPattern = this.analyzeMonthlyPattern(items);
    if (monthlyPattern.strength > 0.3) {
      patterns.push(monthlyPattern);
    }

    return patterns.sort((a, b) => b.strength - a.strength);
  }

  /**
   * Get contextual memories around a specific time
   */
  async getTemporalContext(
    targetTime: Date,
    windowMinutes = 60,
    limit = 10
  ): Promise<{
    before: MemoryItem[];
    after: MemoryItem[];
    exact: MemoryItem[];
  }> {
    const targetTimestamp = targetTime.getTime();
    const windowMs = windowMinutes * 60 * 1000;

    const before: MemoryItem[] = [];
    const after: MemoryItem[] = [];
    const exact: MemoryItem[] = [];

    for (const entry of this.chronoIndex) {
      const timeDiff = entry.timestamp - targetTimestamp;

      if (Math.abs(timeDiff) <= 5 * 60 * 1000) { // Within 5 minutes = exact
        const item = this.items.get(entry.id);
        if (item) exact.push(item);
      } else if (timeDiff < 0 && Math.abs(timeDiff) <= windowMs) { // Before
        const item = this.items.get(entry.id);
        if (item) before.push(item);
      } else if (timeDiff > 0 && timeDiff <= windowMs) { // After
        const item = this.items.get(entry.id);
        if (item) after.push(item);
      }

      // Stop if we have enough context
      if (before.length + after.length + exact.length >= limit * 3) {
        break;
      }
    }

    return {
      before: before.slice(-limit), // Most recent before
      after: after.slice(0, limit), // Earliest after
      exact: exact.slice(0, limit),
    };
  }

  /**
   * Get memories that are temporally similar to a given item
   */
  async getTemporalSimilarities(itemId: string, limit = 5): Promise<MemorySearchResult[]> {
    const item = this.items.get(itemId);
    if (!item) return [];

    const itemTime = item.createdAt.getTime();
    const similarities: Array<{ id: string; score: number; timeDiff: number }> = [];

    // Find items with similar temporal characteristics
    for (const [id, otherItem] of this.items) {
      if (id === itemId) continue;

      const timeDiff = Math.abs(otherItem.createdAt.getTime() - itemTime);
      const hourOfDay = otherItem.createdAt.getHours();
      const dayOfWeek = otherItem.createdAt.getDay();
      const month = otherItem.createdAt.getMonth();

      const itemHour = item.createdAt.getHours();
      const itemDay = item.createdAt.getDay();
      const itemMonth = item.createdAt.getMonth();

      let score = 0;

      // Same hour of day
      if (Math.abs(hourOfDay - itemHour) <= 1) score += 0.3;

      // Same day of week
      if (dayOfWeek === itemDay) score += 0.3;

      // Same month
      if (month === itemMonth) score += 0.2;

      // Similar time difference patterns
      if (timeDiff < 24 * 60 * 60 * 1000) score += 0.2; // Same day

      if (score > 0.3) {
        similarities.push({ id, score, timeDiff });
      }
    }

    // Sort by score and return top results
    similarities.sort((a, b) => b.score - a.score);
    const topSimilar = similarities.slice(0, limit);

    const results: MemorySearchResult[] = [];
    for (const { id, score, timeDiff } of topSimilar) {
      const similarItem = this.items.get(id);
      if (similarItem) {
        results.push({
          memory: similarItem,
          score,
          source: this.layer,
          explanation: `temporal similarity (${this.formatTimeDiff(timeDiff)})`,
        });
      }
    }

    return results;
  }

  /**
   * Close the temporal layer and perform final persistence
   */
  async close(): Promise<void> {
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
    }

    if (this.isDirty) {
      await this.saveToDisk();
    }


    this.logger.info('Temporal layer closed');
  }

  private async temporalSearch(query: TemporalQuery): Promise<MemorySearchResult[]> {
    let candidates: MemoryItem[] = [];

    // Filter by time range if specified
    if (query.timeRange) {
      candidates = await this.getMemoriesInRange(query.timeRange.start, query.timeRange.end, 1000);
    } else {
      candidates = Array.from(this.items.values());
    }

    // Apply text filtering
    const filteredCandidates = candidates.filter(item => {
      // Apply regular filters
      if (!this.matchesFilters(item, query.filters)) {
        return false;
      }

      // Apply text matching if query provided
      if (query.query && query.query.trim()) {
        const searchTerms = this.tokenize(query.query.toLowerCase());
        const score = this.calculateSimilarity(item, searchTerms, query);
        return score > (query.similarity?.threshold ?? 0.1);
      }

      return true;
    });

    // Create results
    const results: MemorySearchResult[] = filteredCandidates.map(item => {
      const searchTerms = query.query ? this.tokenize(query.query.toLowerCase()) : [];
      const score = query.query
        ? this.calculateSimilarity(item, searchTerms, query)
        : 1.0; // No query = all items are equally relevant

      return {
        memory: item,
        score: this.applyTemporalScoring(score, item),
        source: this.layer,
        explanation: this.generateTemporalExplanation(item, query),
      };
    });

    // Sort results
    if (query.chronological) {
      results.sort((a, b) => b.memory.createdAt.getTime() - a.memory.createdAt.getTime());
    } else {
      results.sort((a, b) => b.score - a.score);
    }

    // Apply limit and offset
    const limit = query.limit ?? 10;
    const offset = query.offset ?? 0;

    return results.slice(offset, offset + limit);
  }

  private addToTimeIndex(id: string, timestamp: Date): void {
    const bucket = this.getTimeBucket(timestamp);
    if (!this.timeIndex.has(bucket)) {
      this.timeIndex.set(bucket, new Set());
    }
    this.timeIndex.get(bucket)?.add(id);
  }

  private removeFromTimeIndex(id: string, timestamp: Date): void {
    const bucket = this.getTimeBucket(timestamp);
    this.timeIndex.get(bucket)?.delete(id);
  }

  private addToChronoIndex(id: string, timestamp: Date): void {
    this.chronoIndex.push({ id, timestamp: timestamp.getTime() });
    this.chronoIndex.sort((a, b) => a.timestamp - b.timestamp);
  }

  private removeFromChronoIndex(id: string): void {
    this.chronoIndex = this.chronoIndex.filter(entry => entry.id !== id);
  }

  private getTimeBucket(timestamp: Date): string {
    // Create daily buckets: YYYY-MM-DD
    return timestamp.toISOString().split('T')[0]!;
  }

  private applyTemporalScoring(baseScore: number, item: MemoryItem): number {
    const now = Date.now();
    const age = now - item.createdAt.getTime();
    const dayAge = age / (24 * 60 * 60 * 1000);

    // Apply recency boost (newer items get higher scores)
    let temporalBoost = 0;

    if (dayAge < 1) temporalBoost = 0.2; // Very recent
    else if (dayAge < 7) temporalBoost = 0.1; // Recent
    else if (dayAge < 30) temporalBoost = 0.05; // Somewhat recent

    // Apply access frequency boost
    const accessBoost = Math.min(item.accessCount / 10, 0.1);

    return Math.min(baseScore + temporalBoost + accessBoost, 1.0);
  }

  private getTemporalExplanation(item: MemoryItem): string {
    const now = Date.now();
    const age = now - item.createdAt.getTime();
    const dayAge = age / (24 * 60 * 60 * 1000);

    if (dayAge < 1) return ', very recent';
    if (dayAge < 7) return ', recent';
    if (dayAge < 30) return ', from this month';
    if (dayAge < 365) return ', from this year';
    return ', historical';
  }

  private generateTemporalExplanation(item: MemoryItem, query: TemporalQuery): string {
    const explanations: string[] = [];

    if (query.timeRange) {
      explanations.push('in time range');
    }

    if (query.chronological) {
      explanations.push('chronological order');
    }

    const age = Date.now() - item.createdAt.getTime();
    const dayAge = age / (24 * 60 * 60 * 1000);

    if (dayAge < 1) explanations.push('recent');
    if (item.accessCount > 3) explanations.push('frequently accessed');

    return explanations.length > 0 ? explanations.join(', ') : 'temporal match';
  }

  private analyzeDailyPattern(items: MemoryItem[]): TemporalPattern {
    const hourCounts = new Array(24).fill(0);

    for (const item of items) {
      const hour = item.createdAt.getHours();
      hourCounts[hour]++;
    }

    const maxCount = Math.max(...hourCounts);
    const avgCount = hourCounts.reduce((sum, count) => sum + count, 0) / 24;
    const strength = maxCount > 0 ? (maxCount - avgCount) / maxCount : 0;

    const peakHour = hourCounts.indexOf(maxCount);

    return {
      pattern: 'daily',
      strength,
      description: `Peak activity at ${peakHour}:00`,
      examples: [`Most active hour: ${peakHour}:00`],
    };
  }

  private analyzeWeeklyPattern(items: MemoryItem[]): TemporalPattern {
    const dayCounts = new Array(7).fill(0);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (const item of items) {
      const day = item.createdAt.getDay();
      dayCounts[day]++;
    }

    const maxCount = Math.max(...dayCounts);
    const avgCount = dayCounts.reduce((sum, count) => sum + count, 0) / 7;
    const strength = maxCount > 0 ? (maxCount - avgCount) / maxCount : 0;

    const peakDay = dayCounts.indexOf(maxCount);

    return {
      pattern: 'weekly',
      strength,
      description: `Peak activity on ${dayNames[peakDay]}`,
      examples: [`Most active day: ${dayNames[peakDay]}`],
    };
  }

  private analyzeMonthlyPattern(items: MemoryItem[]): TemporalPattern {
    const monthCounts = new Array(12).fill(0);
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    for (const item of items) {
      const month = item.createdAt.getMonth();
      monthCounts[month]++;
    }

    const maxCount = Math.max(...monthCounts);
    const avgCount = monthCounts.reduce((sum, count) => sum + count, 0) / 12;
    const strength = maxCount > 0 ? (maxCount - avgCount) / maxCount : 0;

    const peakMonth = monthCounts.indexOf(maxCount);

    return {
      pattern: 'monthly',
      strength,
      description: `Peak activity in ${monthNames[peakMonth]}`,
      examples: [`Most active month: ${monthNames[peakMonth]}`],
    };
  }

  private formatTimeDiff(ms: number): string {
    const seconds = ms / 1000;
    const minutes = seconds / 60;
    const hours = minutes / 60;
    const days = hours / 24;

    if (days > 1) return `${Math.round(days)} days`;
    if (hours > 1) return `${Math.round(hours)} hours`;
    if (minutes > 1) return `${Math.round(minutes)} minutes`;
    return `${Math.round(seconds)} seconds`;
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const itemsPath = join(this.dataDir, 'items.json');
      const indexPath = join(this.dataDir, 'temporal-index.json');

      // Load items
      try {
        await access(itemsPath);
        const itemsData = JSON.parse(await readFile(itemsPath, 'utf-8'));
        await this.import(itemsData.items || []);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      // Load temporal indexes
      try {
        await access(indexPath);
        const indexData = JSON.parse(await readFile(indexPath, 'utf-8'));

        if (indexData.timeIndex) {
          for (const [bucket, ids] of Object.entries(indexData.timeIndex)) {
            this.timeIndex.set(bucket, new Set(ids as string[]));
          }
        }

        if (indexData.chronoIndex) {
          this.chronoIndex = indexData.chronoIndex;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      this.isDirty = false;

      this.logger.info('Temporal data loaded from disk', {
        itemCount: this.items.size,
        timeIndexSize: this.timeIndex.size,
        chronoIndexSize: this.chronoIndex.length,
      });
    } catch (error) {
      this.logger.error('Failed to load temporal data', {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  private async saveToDisk(): Promise<void> {
    try {
      await this.ensureDirectoryExists(this.dataDir);

      const itemsPath = join(this.dataDir, 'items.json');
      const indexPath = join(this.dataDir, 'temporal-index.json');

      // Save items
      const itemsData = {
        version: '1.0',
        savedAt: new Date().toISOString(),
        items: await this.export(),
      };
      await writeFile(itemsPath, JSON.stringify(itemsData, null, 2));

      // Save temporal indexes
      const indexData = {
        version: '1.0',
        savedAt: new Date().toISOString(),
        timeIndex: Object.fromEntries(
          Array.from(this.timeIndex.entries()).map(([key, set]) => [key, Array.from(set)])
        ),
        chronoIndex: this.chronoIndex,
      };
      await writeFile(indexPath, JSON.stringify(indexData, null, 2));

      this.isDirty = false;

      this.logger.debug('Temporal data saved to disk', {
        itemCount: itemsData.items.length,
        timeIndexSize: this.timeIndex.size,
      });
    } catch (error) {
      this.logger.error('Failed to save temporal data', {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  private async ensureDirectoryExists(dir: string): Promise<void> {
    try {
      await access(dir);
    } catch {
      await mkdir(dir, { recursive: true });
    }
  }

  private markDirty(): void {
    this.isDirty = true;
  }

  private setupAutoPersistence(): void {
    this.persistenceInterval = setInterval(async () => {
      if (this.isDirty) {
        try {
          await this.saveToDisk();
        } catch (error) {
          this.logger.error('Auto-persistence failed', {
            error: error instanceof Error ? error.message : error,
          });
        }
      }
    }, 15 * 60 * 1000); // 15 minutes
  }

  private async compressHistoricalData(): Promise<void> {
    // Compress data older than 1 year with minimal access
    const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
    let compressedCount = 0;

    for (const [id, item] of this.items) {
      if (
        item.createdAt.getTime() < oneYearAgo &&
        item.lastAccessedAt.getTime() < oneYearAgo &&
        item.accessCount < 1
      ) {
        // Compress content
        const compressedContent = item.content
          .replace(/\s+/g, ' ')
          .replace(/\n\s*/g, '\n')
          .trim();

        if (compressedContent.length < item.content.length) {
          await this.update(id, { content: compressedContent });
          compressedCount++;
        }
      }
    }

    if (compressedCount > 0) {
      this.logger.info('Compressed historical data', { compressedCount });
    }
  }

}