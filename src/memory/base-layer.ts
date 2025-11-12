/**
 * Base implementation for memory layers with common functionality
 */

import { randomUUID } from 'crypto';
import { createLogger } from '../utils/logger.js';
import type {
  MemoryItem,
  MemoryLayerConfig,
  MemoryLayerInterface,
  MemoryLayer,
  MemoryQuery,
  MemorySearchResult,
  MemoryStats,
} from './types.js';

export abstract class BaseMemoryLayer implements MemoryLayerInterface {
  protected readonly logger: ReturnType<typeof createLogger>;
  protected items = new Map<string, MemoryItem>();
  protected index = new Map<string, Set<string>>(); // For basic text search indexing

  constructor(
    public readonly layer: MemoryLayer,
    // eslint-disable-next-line no-unused-vars
    public readonly config: MemoryLayerConfig
  ) {
    this.logger = createLogger(`memory-${layer}`);
    // Constructor parameters are used as public readonly properties
  }

  async store(
    item: Omit<MemoryItem, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt'>
  ): Promise<MemoryItem> {
    const now = new Date();
    const id = randomUUID();

    const memoryItem: MemoryItem = {
      ...item,
      id,
      createdAt: now,
      updatedAt: now,
      accessCount: 0,
      lastAccessedAt: now,
      metadata: {
        ...item.metadata,
        // Set expiresAt based on layer TTL if configured, or keep existing value
        ...(this.config.ttl && { expiresAt: new Date(now.getTime() + this.config.ttl) }),
      },
    };

    // Store the item first
    this.items.set(id, memoryItem);

    // Update search index
    this.updateIndex(id, memoryItem);

    // Then enforce capacity limits (which may remove the least recently accessed items)
    await this.enforceCapacityLimits();

    this.logger.info('Memory item stored', {
      id,
      layer: this.layer,
      contentLength: item.content.length,
      category: item.metadata.category,
    });

    return memoryItem;
  }

  async retrieve(id: string): Promise<MemoryItem | null> {
    const item = this.items.get(id);
    if (!item) {
      return null;
    }

    // Update access tracking
    item.accessCount++;
    item.lastAccessedAt = new Date();
    this.items.set(id, item);

    this.logger.debug('Memory item retrieved', {
      id,
      layer: this.layer,
      accessCount: item.accessCount,
    });

    return item;
  }

  async search(query: MemoryQuery): Promise<MemorySearchResult[]> {
    const results: MemorySearchResult[] = [];
    const searchTerms = this.tokenize(query.query.toLowerCase());

    for (const [_id, item] of this.items) {
      // Apply filters first
      if (!this.matchesFilters(item, query.filters)) {
        continue;
      }

      // Calculate similarity score
      const score = this.calculateSimilarity(item, searchTerms, query);

      if (score > (query.similarity?.threshold ?? 0.1)) {
        results.push({
          memory: item,
          score,
          source: this.layer,
          explanation: this.generateExplanation(item, searchTerms, score),
        });
      }
    }

    // Sort by score (descending) and apply limit
    results.sort((a, b) => b.score - a.score);

    const limit = query.limit ?? 10;
    const offset = query.offset ?? 0;

    return results.slice(offset, offset + limit);
  }

  async update(
    id: string,
    updates: Partial<Pick<MemoryItem, 'content' | 'metadata'>>
  ): Promise<MemoryItem | null> {
    const item = this.items.get(id);
    if (!item) {
      return null;
    }

    const updatedItem: MemoryItem = {
      ...item,
      ...updates,
      updatedAt: new Date(),
    };

    this.items.set(id, updatedItem);

    // Update search index if content changed
    if (updates.content) {
      this.updateIndex(id, updatedItem);
    }

    this.logger.info('Memory item updated', { id, layer: this.layer });

    return updatedItem;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = this.items.delete(id);

    if (deleted) {
      // Remove from search index
      this.removeFromIndex(id);
      this.logger.info('Memory item deleted', { id, layer: this.layer });
    }

    return deleted;
  }

  async bulkStore(
    items: Omit<MemoryItem, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt'>[]
  ): Promise<MemoryItem[]> {
    const results: MemoryItem[] = [];

    for (const item of items) {
      const stored = await this.store(item);
      results.push(stored);
    }

    return results;
  }

  async bulkDelete(ids: string[]): Promise<number> {
    let deletedCount = 0;

    for (const id of ids) {
      if (await this.delete(id)) {
        deletedCount++;
      }
    }

    return deletedCount;
  }

  async cleanup(): Promise<number> {
    const now = new Date();
    let cleanedCount = 0;

    // Remove expired items
    for (const [id, item] of this.items) {
      if (item.metadata.expiresAt && item.metadata.expiresAt < now) {
        await this.delete(id);
        cleanedCount++;
      }
    }

    // Apply capacity limits
    cleanedCount += await this.enforceCapacityLimits();

    this.logger.info('Cleanup completed', { layer: this.layer, cleanedCount });

    return cleanedCount;
  }

  async getStats(): Promise<MemoryStats> {
    const items = Array.from(this.items.values());
    const totalSize = items.reduce((sum, item) => sum + this.calculateItemSize(item), 0);
    const categoryCounts: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};

    for (const item of items) {
      // Count categories
      const { category } = item.metadata;
      categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;

      // Count tags
      for (const tag of item.metadata.tags) {
        tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      }
    }

    return {
      totalItems: items.length,
      totalSize,
      averageAccessCount:
        items.length > 0
          ? items.reduce((sum, item) => sum + item.accessCount, 0) / items.length
          : 0,
      lastAccessed:
        items.length > 0
          ? new Date(
              Math.max(
                ...items.map(item => {
                  const lastAccessed = item.lastAccessedAt;
                  return lastAccessed instanceof Date
                    ? lastAccessed.getTime()
                    : new Date(lastAccessed).getTime();
                })
              )
            )
          : undefined,
      oldestItem:
        items.length > 0
          ? new Date(
              Math.min(
                ...items.map(item => {
                  const { createdAt } = item;
                  return createdAt instanceof Date
                    ? createdAt.getTime()
                    : new Date(createdAt).getTime();
                })
              )
            )
          : undefined,
      newestItem:
        items.length > 0
          ? new Date(
              Math.max(
                ...items.map(item => {
                  const { createdAt } = item;
                  return createdAt instanceof Date
                    ? createdAt.getTime()
                    : new Date(createdAt).getTime();
                })
              )
            )
          : undefined,
      categoryCounts,
      tagCounts,
    };
  }

  async export(): Promise<MemoryItem[]> {
    return Array.from(this.items.values());
  }

  async import(items: MemoryItem[]): Promise<number> {
    let importedCount = 0;

    for (const item of items) {
      // Fix date deserialization - convert string dates back to Date objects
      const normalizedItem: MemoryItem = {
        ...item,
        createdAt: typeof item.createdAt === 'string' ? new Date(item.createdAt) : item.createdAt,
        updatedAt: typeof item.updatedAt === 'string' ? new Date(item.updatedAt) : item.updatedAt,
      };

      this.items.set(normalizedItem.id, normalizedItem);
      this.updateIndex(normalizedItem.id, normalizedItem);
      importedCount++;
    }

    this.logger.info('Items imported', { layer: this.layer, importedCount });

    return importedCount;
  }

  abstract optimize(): Promise<void>;
  abstract backup(): Promise<string>;
  abstract restore(_backupId: string): Promise<boolean>;

  // Protected helper methods

  protected tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2);
  }

  protected updateIndex(id: string, item: MemoryItem): void {
    // Remove existing index entries for this item
    this.removeFromIndex(id);

    // Index content, tags, and category
    const textToIndex = [item.content, ...item.metadata.tags, item.metadata.category].join(' ');

    const tokens = this.tokenize(textToIndex);

    for (const token of tokens) {
      if (!this.index.has(token)) {
        this.index.set(token, new Set());
      }
      this.index.get(token)?.add(id);
    }
  }

  protected removeFromIndex(_id: string): void {
    for (const tokenSet of this.index.values()) {
      tokenSet.delete(_id);
    }
  }

  protected matchesFilters(item: MemoryItem, filters?: MemoryQuery['filters']): boolean {
    if (!filters) return true;

    const filterChecks = [
      () => this.matchesTagFilter(item, filters.tags),
      () => this.matchesStringFilter(item.metadata.category, filters.category),
      () => this.matchesPriorityFilter(item.metadata.priority, filters.priority),
      () => this.matchesStringFilter(item.metadata.source, filters.source),
      () => this.matchesStringFilter(item.metadata.projectId, filters.projectId),
      () => this.matchesStringFilter(item.metadata.sessionId, filters.sessionId),
      () => this.matchesStringFilter(item.metadata.userId, filters.userId),
      () => this.matchesDateRangeFilter(item.createdAt, filters.dateRange),
    ];

    return filterChecks.every(check => check());
  }

  private matchesTagFilter(item: MemoryItem, tags?: string[]): boolean {
    return !tags || tags.some(tag => item.metadata.tags.includes(tag));
  }

  private matchesStringFilter(value: string | undefined, filterValue: string | undefined): boolean {
    return !filterValue || value === filterValue;
  }

  private matchesPriorityFilter(
    priority: number,
    range?: { min?: number | undefined; max?: number | undefined } | undefined
  ): boolean {
    if (!range) return true;
    return !(range.min && priority < range.min) && !(range.max && priority > range.max);
  }

  private matchesDateRangeFilter(
    date: Date,
    range?: { start?: Date | undefined; end?: Date | undefined } | undefined
  ): boolean {
    if (!range) return true;
    return !(range.start && date < range.start) && !(range.end && date > range.end);
  }

  protected calculateSimilarity(
    item: MemoryItem,
    searchTerms: string[],
    query: MemoryQuery
  ): number {
    const itemTokens = this.tokenize(
      [item.content, ...item.metadata.tags, item.metadata.category].join(' ')
    );

    // Handle case where query is empty but filters are applied
    let score: number;
    if (searchTerms.length === 0 && query.filters) {
      // For filter-only searches, give a base score to matched items
      score = 0.5;
    } else {
      // Simple term frequency-based similarity
      const matches = searchTerms.filter(term =>
        itemTokens.some(token => token.includes(term) || term.includes(token))
      );
      score = matches.length / Math.max(searchTerms.length, 1);
    }

    // Boost score based on metadata
    if (searchTerms.some(term => item.metadata.category.toLowerCase().includes(term))) {
      score += 0.1;
    }

    // Boost for priority
    score += (item.metadata.priority / 10) * 0.05;

    // Boost for recency (items from last 24 hours get boost)
    const hoursSinceCreated = (Date.now() - item.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreated < 24) {
      score += 0.05;
    }

    // Boost for access frequency
    score += Math.min(item.accessCount / 10, 0.1);

    return Math.min(score, 1.0);
  }

  protected generateExplanation(item: MemoryItem, searchTerms: string[], score: number): string {
    const explanations: string[] = [];

    if (searchTerms.some(term => item.content.toLowerCase().includes(term))) {
      explanations.push('content match');
    }

    if (
      searchTerms.some(term => item.metadata.tags.some(tag => tag.toLowerCase().includes(term)))
    ) {
      explanations.push('tag match');
    }

    if (searchTerms.some(term => item.metadata.category.toLowerCase().includes(term))) {
      explanations.push('category match');
    }

    if (item.metadata.priority > 7) {
      explanations.push('high priority');
    }

    if (item.accessCount > 5) {
      explanations.push('frequently accessed');
    }

    const hoursSinceCreated = (Date.now() - item.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceCreated < 24) {
      explanations.push('recent');
    }

    return explanations.length > 0 ? explanations.join(', ') : `similarity: ${score.toFixed(2)}`;
  }

  protected calculateItemSize(item: MemoryItem): number {
    return JSON.stringify(item).length * 2; // Rough estimate in bytes (UTF-16)
  }

  protected async enforceCapacityLimits(): Promise<number> {
    let removedCount = 0;

    // Check item count limit
    if (this.config.maxItems && this.items.size > this.config.maxItems) {
      const excess = this.items.size - this.config.maxItems;
      removedCount += await this.evictOldestItems(excess);
    }

    // Check size limit
    if (this.config.maxSizeBytes) {
      const currentSize = Array.from(this.items.values()).reduce(
        (sum, item) => sum + this.calculateItemSize(item),
        0
      );

      if (currentSize > this.config.maxSizeBytes) {
        // Remove items until under limit
        const sortedItems = Array.from(this.items.values()).sort(
          (a, b) => a.lastAccessedAt.getTime() - b.lastAccessedAt.getTime()
        );

        let sizeToRemove = currentSize - this.config.maxSizeBytes;

        for (const item of sortedItems) {
          if (sizeToRemove <= 0) break;

          sizeToRemove -= this.calculateItemSize(item);
          await this.delete(item.id);
          removedCount++;
        }
      }
    }

    return removedCount;
  }

  protected async evictOldestItems(count: number): Promise<number> {
    const sortedItems = Array.from(this.items.values()).sort(
      (a, b) => a.lastAccessedAt.getTime() - b.lastAccessedAt.getTime()
    );

    let removedCount = 0;
    for (let i = 0; i < Math.min(count, sortedItems.length); i++) {
      await this.delete(sortedItems[i]!.id);
      removedCount++;
    }

    return removedCount;
  }
}
