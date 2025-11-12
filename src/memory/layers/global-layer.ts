/* global NodeJS */
/**
 * Global Layer: Shared persistent storage for cross-project memories
 * - High-capacity persistent storage
 * - Vector embeddings for semantic search
 * - Cross-project knowledge sharing
 */

import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join, dirname } from 'path';
import { BaseMemoryLayer } from '../base-layer.js';
import type { MemoryItem, MemoryLayerConfig, MemoryQuery, MemorySearchResult } from '../types.js';

export class GlobalLayer extends BaseMemoryLayer {
  private readonly dataDir: string;
  private persistenceInterval?: NodeJS.Timeout;
  private isDirty = false;
  private vectorIndex = new Map<string, number[]>(); // Simple vector storage

  constructor(
    config: MemoryLayerConfig = { ttl: undefined },
    dataDir = './data/global'
  ) {
    // Default configuration for global layer
    const defaultConfig: MemoryLayerConfig = {
      maxItems: config.maxItems ?? 10000, // Large capacity
      maxSizeBytes: config.maxSizeBytes ?? 100 * 1024 * 1024, // 100MB max
      compressionEnabled: config.compressionEnabled ?? true,
      indexingEnabled: config.indexingEnabled ?? true,
      ttl: config.ttl ?? 1000 * 60 * 60 * 24 * 365, // 1 year
    };

    super('global', defaultConfig);

    this.dataDir = dataDir;

    // Auto-save every 10 minutes if dirty
    this.setupAutoPersistence();

    this.logger.info('Global layer initialized', {
      dataDir,
      config: defaultConfig,
    });

    // Load existing data
    this.loadFromDisk().catch(error => {
      this.logger.error('Failed to load global data', { error: error instanceof Error ? error.message : error });
    });
  }

  override async store(item: Parameters<BaseMemoryLayer['store']>[0]): Promise<MemoryItem> {
    const result = await super.store(item);

    // Generate simple vector representation for semantic search
    await this.generateVector(result.id, result.content);

    this.markDirty();
    return result;
  }

  override async search(query: MemoryQuery): Promise<MemorySearchResult[]> {
    // Combine text search with vector similarity
    const textResults = await super.search(query);
    const vectorResults = await this.vectorSearch(query.query, query.limit);

    // Merge and deduplicate results
    const resultMap = new Map<string, MemorySearchResult>();

    // Add text search results
    for (const result of textResults) {
      resultMap.set(result.memory.id, result);
    }

    // Add vector search results, combining scores if item already exists
    for (const result of vectorResults) {
      const existing = resultMap.get(result.memory.id);
      if (existing) {
        // Combine scores (weighted average)
        existing.score = (existing.score * 0.6) + (result.score * 0.4);
        existing.explanation += `, semantic similarity`;
      } else {
        resultMap.set(result.memory.id, result);
      }
    }

    // Sort by combined score and return
    const combinedResults = Array.from(resultMap.values())
      .sort((a, b) => b.score - a.score);

    const limit = query.limit ?? 10;
    const offset = query.offset ?? 0;

    return combinedResults.slice(offset, offset + limit);
  }

  override async update(id: string, updates: Parameters<BaseMemoryLayer['update']>[1]): Promise<MemoryItem | null> {
    const result = await super.update(id, updates);

    if (result && updates.content) {
      // Regenerate vector for updated content
      await this.generateVector(id, result.content);
    }

    if (result) {
      this.markDirty();
    }

    return result;
  }

  override async delete(id: string): Promise<boolean> {
    const result = await super.delete(id);

    if (result) {
      this.vectorIndex.delete(id);
      this.markDirty();
    }

    return result;
  }

  override async optimize(): Promise<void> {
    // Clean up first
    await this.cleanup();

    // Rebuild text index
    this.index.clear();
    for (const [id, item] of this.items) {
      this.updateIndex(id, item);
    }

    // Rebuild vector index
    this.vectorIndex.clear();
    for (const [id, item] of this.items) {
      await this.generateVector(id, item.content);
    }

    // Archive old items if enabled
    if (this.config.compressionEnabled) {
      await this.archiveOldItems();
    }

    // Persist optimized data
    await this.saveToDisk();

    this.logger.info('Global layer optimized', {
      itemCount: this.items.size,
      indexSize: this.index.size,
      vectorCount: this.vectorIndex.size,
    });
  }

  override async backup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `global-${timestamp}`;
    const backupPath = join(this.dataDir, 'backups', `${backupId}.json`);

    const dirCreated = await this.ensureDirectoryExists(dirname(backupPath));
    if (!dirCreated) {
      throw new Error(`Cannot create backup: failed to create directory ${dirname(backupPath)}`);
    }

    const backupData = {
      timestamp: new Date().toISOString(),
      items: await this.export(),
      vectors: Object.fromEntries(this.vectorIndex),
      metadata: {
        version: '1.0',
        layerType: 'global',
        totalItems: this.items.size,
      },
    };

    await writeFile(backupPath, JSON.stringify(backupData, null, 2));

    this.logger.info('Global layer backup created', {
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
      this.vectorIndex.clear();

      // Import backup data
      const importedCount = await this.import(backupData.items);

      // Restore vector index
      if (backupData.vectors) {
        for (const [id, vector] of Object.entries(backupData.vectors)) {
          this.vectorIndex.set(id, vector as number[]);
        }
      }

      // Save restored data
      await this.saveToDisk();

      this.logger.info('Global layer restored from backup', {
        backupId,
        importedCount,
        vectorCount: this.vectorIndex.size,
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
   * Get global layer statistics with cross-project insights
   */
  async getGlobalStats(): Promise<{
    projectDistribution: Record<string, number>;
    topCategories: Array<{ category: string; count: number }>;
    topTags: Array<{ tag: string; count: number }>;
    semanticClusters: Array<{ center: string; size: number }>;
    growthRate: { daily: number; weekly: number; monthly: number };
  }> {
    const stats = await this.getStats();
    const items = Array.from(this.items.values());

    // Project distribution
    const projectDistribution: Record<string, number> = {};
    for (const item of items) {
      const projectId = item.metadata.projectId || 'unknown';
      projectDistribution[projectId] = (projectDistribution[projectId] || 0) + 1;
    }

    // Top categories
    const topCategories = Object.entries(stats.categoryCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Top tags
    const topTags = Object.entries(stats.tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Simple semantic clustering (group by similar vectors)
    const semanticClusters = this.analyzeClusters();

    // Growth rate analysis
    const growthRate = this.calculateGrowthRate(items);

    return {
      projectDistribution,
      topCategories,
      topTags,
      semanticClusters,
      growthRate,
    };
  }

  /**
   * Find similar memories across all projects
   */
  async findSimilarMemories(content: string, limit = 5): Promise<MemorySearchResult[]> {
    const queryVector = await this.textToVector(content);
    const similarities: Array<{ id: string; score: number }> = [];

    for (const [id, vector] of this.vectorIndex) {
      const similarity = this.cosineSimilarity(queryVector, vector);
      if (similarity > 0.1) { // Minimum threshold
        similarities.push({ id, score: similarity });
      }
    }

    // Sort by similarity and take top results
    similarities.sort((a, b) => b.score - a.score);
    const topSimilar = similarities.slice(0, limit);

    const results: MemorySearchResult[] = [];
    for (const { id, score } of topSimilar) {
      const item = this.items.get(id);
      if (item) {
        results.push({
          memory: item,
          score,
          source: this.layer,
          explanation: `semantic similarity: ${score.toFixed(2)}`,
        });
      }
    }

    return results;
  }

  /**
   * Close the global layer and perform final persistence
   */
  async close(): Promise<void> {
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
    }

    if (this.isDirty) {
      await this.saveToDisk();
    }

    this.logger.info('Global layer closed');
  }

  private async vectorSearch(query: string, limit = 10): Promise<MemorySearchResult[]> {
    const queryVector = await this.textToVector(query);
    const similarities: Array<{ id: string; score: number }> = [];

    for (const [id, vector] of this.vectorIndex) {
      const similarity = this.cosineSimilarity(queryVector, vector);
      if (similarity > 0.1) {
        similarities.push({ id, score: similarity });
      }
    }

    similarities.sort((a, b) => b.score - a.score);
    const topResults = similarities.slice(0, limit);

    const results: MemorySearchResult[] = [];
    for (const { id, score } of topResults) {
      const item = this.items.get(id);
      if (item) {
        results.push({
          memory: item,
          score,
          source: this.layer,
          explanation: `vector similarity: ${score.toFixed(2)}`,
        });
      }
    }

    return results;
  }

  private async generateVector(id: string, content: string): Promise<void> {
    const vector = await this.textToVector(content);
    this.vectorIndex.set(id, vector);
  }

  private async textToVector(text: string): Promise<number[]> {
    // Simple TF-IDF-like vector generation
    // In a real implementation, you'd use a proper embedding model
    const tokens = this.tokenize(text);
    const vector = new Array(100).fill(0); // 100-dimensional vector

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      const hash = this.simpleHash(token) % 100;
      vector[hash] += 1 / tokens.length; // Normalized frequency
    }

    return vector;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private analyzeClusters(): Array<{ center: string; size: number }> {
    // Simple clustering analysis
    const clusters: Array<{ center: string; size: number }> = [];
    const processed = new Set<string>();

    for (const [id, vector] of this.vectorIndex) {
      if (processed.has(id)) continue;

      const clusterMembers = [id];
      processed.add(id);

      // Find similar vectors
      for (const [otherId, otherVector] of this.vectorIndex) {
        if (processed.has(otherId)) continue;

        const similarity = this.cosineSimilarity(vector, otherVector);
        if (similarity > 0.8) { // High similarity threshold
          clusterMembers.push(otherId);
          processed.add(otherId);
        }
      }

      if (clusterMembers.length > 1) {
        const centerItem = this.items.get(id);
        clusters.push({
          center: centerItem?.metadata.category || 'unknown',
          size: clusterMembers.length,
        });
      }
    }

    return clusters.sort((a, b) => b.size - a.size).slice(0, 10);
  }

  private calculateGrowthRate(items: MemoryItem[]): { daily: number; weekly: number; monthly: number } {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    const oneMonth = 30 * oneDay;

    const dailyItems = items.filter(item => (now - item.createdAt.getTime()) < oneDay).length;
    const weeklyItems = items.filter(item => (now - item.createdAt.getTime()) < oneWeek).length;
    const monthlyItems = items.filter(item => (now - item.createdAt.getTime()) < oneMonth).length;

    return {
      daily: dailyItems,
      weekly: weeklyItems / 7,
      monthly: monthlyItems / 30,
    };
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const itemsPath = join(this.dataDir, 'items.json');
      const vectorsPath = join(this.dataDir, 'vectors.json');

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

      // Load vectors
      try {
        await access(vectorsPath);
        const vectorsData = JSON.parse(await readFile(vectorsPath, 'utf-8'));
        for (const [id, vector] of Object.entries(vectorsData)) {
          this.vectorIndex.set(id, vector as number[]);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      this.isDirty = false;

      this.logger.info('Global data loaded from disk', {
        itemCount: this.items.size,
        vectorCount: this.vectorIndex.size,
      });
    } catch (error) {
      this.logger.error('Failed to load global data', {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  private async saveToDisk(): Promise<void> {
    try {
      const dirCreated = await this.ensureDirectoryExists(this.dataDir);

      if (!dirCreated) {
        this.logger.warn('Cannot save to disk: directory creation failed', {
          dataDir: this.dataDir,
        });
        return; // Skip saving but don't throw
      }

      const itemsPath = join(this.dataDir, 'items.json');
      const vectorsPath = join(this.dataDir, 'vectors.json');

      // Save items
      const itemsData = {
        version: '1.0',
        savedAt: new Date().toISOString(),
        items: await this.export(),
      };
      await writeFile(itemsPath, JSON.stringify(itemsData, null, 2));

      // Save vectors
      const vectorsData = Object.fromEntries(this.vectorIndex);
      await writeFile(vectorsPath, JSON.stringify(vectorsData, null, 2));

      this.isDirty = false;

      this.logger.debug('Global data saved to disk', {
        itemCount: itemsData.items.length,
        vectorCount: this.vectorIndex.size,
      });
    } catch (error) {
      this.logger.error('Failed to save global data', {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  private async ensureDirectoryExists(dir: string): Promise<boolean> {
    try {
      await access(dir);
      return true;
    } catch {
      try {
        await mkdir(dir, { recursive: true });
        return true;
      } catch (error) {
        this.logger.error('Failed to create directory', {
          dir,
          error: error instanceof Error ? error.message : error,
        });
        return false;
      }
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
    }, 10 * 60 * 1000); // 10 minutes
  }

  private async archiveOldItems(): Promise<void> {
    // Archive items older than 6 months with low access
    const sixMonthsAgo = Date.now() - (6 * 30 * 24 * 60 * 60 * 1000);
    const archiveCandidates: MemoryItem[] = [];

    for (const item of this.items.values()) {
      if (
        item.createdAt.getTime() < sixMonthsAgo &&
        item.accessCount < 2 &&
        item.lastAccessedAt.getTime() < sixMonthsAgo
      ) {
        archiveCandidates.push(item);
      }
    }

    if (archiveCandidates.length > 0) {
      // Save to archive
      const archivePath = join(this.dataDir, 'archive', `archive-${Date.now()}.json`);
      const dirCreated = await this.ensureDirectoryExists(dirname(archivePath));

      if (!dirCreated) {
        this.logger.warn('Cannot create archive: directory creation failed', {
          archivePath: dirname(archivePath),
          candidateCount: archiveCandidates.length,
        });
        return; // Skip archiving
      }

      await writeFile(archivePath, JSON.stringify({
        archivedAt: new Date().toISOString(),
        items: archiveCandidates,
      }, null, 2));

      // Remove from active storage
      for (const item of archiveCandidates) {
        await this.delete(item.id);
      }

      this.logger.info('Archived old items', {
        archivedCount: archiveCandidates.length,
        archivePath,
      });
    }
  }
}