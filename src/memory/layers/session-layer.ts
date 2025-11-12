/**
 * Session Layer: In-memory storage for current conversation context
 * - Ultra-fast access
 * - Temporary storage (cleared on restart)
 * - Small capacity (optimized for current session)
 */

import { BaseMemoryLayer } from '../base-layer.js';
import type { MemoryLayerConfig, MemoryItem, MemorySearchResult } from '../types.js';

export class SessionLayer extends BaseMemoryLayer {
  constructor(config: MemoryLayerConfig = { ttl: undefined }) {
    // Default configuration for session layer
    const defaultConfig: MemoryLayerConfig = {
      maxItems: config.maxItems ?? 50, // Keep only recent items
      maxSizeBytes: config.maxSizeBytes ?? 1024 * 1024, // 1MB max
      compressionEnabled: config.compressionEnabled ?? false, // No compression for speed
      indexingEnabled: config.indexingEnabled ?? true,
      ttl: config.ttl ?? 1000 * 60 * 60 * 8, // 8 hours
    };

    super('session', defaultConfig);

    // Auto-cleanup every 30 minutes
    this.setupAutoCleanup();

    this.logger.info('Session layer initialized', { config: defaultConfig });
  }

  override async optimize(): Promise<void> {
    // For session layer, optimization is just cleanup
    await this.cleanup();

    // Rebuild index for better performance
    this.index.clear();
    for (const [id, item] of this.items) {
      this.updateIndex(id, item);
    }

    this.logger.info('Session layer optimized', {
      itemCount: this.items.size,
      indexSize: this.index.size,
    });
  }

  override async backup(): Promise<string> {
    // Session layer doesn't need persistent backups
    // Return a timestamp-based identifier for consistency
    const backupId = `session-backup-${Date.now()}`;

    this.logger.info('Session layer backup created (in-memory only)', { backupId });

    return backupId;
  }

  override async restore(_backupId: string): Promise<boolean> {
    // Session layer can't restore from backups (intentionally ephemeral)
    this.logger.warn('Session layer restore attempted but not supported');
    return false;
  }

  /**
   * Clear all session data (useful for session reset)
   */
  async clear(): Promise<void> {
    const itemCount = this.items.size;
    this.items.clear();
    this.index.clear();

    this.logger.info('Session layer cleared', { clearedItems: itemCount });
  }

  /**
   * Get session-specific statistics
   */
  async getSessionStats(): Promise<{
    activeMinutes: number;
    averageItemAge: number;
    mostAccessedItem?: { id: string; accessCount: number };
    recentActivity: { stores: number; searches: number; retrievals: number };
  }> {
    const stats = await this.getStats();
    const now = Date.now();

    // Calculate session duration
    const oldestItemTime = stats.oldestItem?.getTime() ?? now;
    const activeMinutes = (now - oldestItemTime) / (1000 * 60);

    // Calculate average item age
    const items = Array.from(this.items.values());
    const averageItemAge = items.length > 0
      ? items.reduce((sum, item) => sum + (now - item.createdAt.getTime()), 0) / items.length / (1000 * 60)
      : 0;

    // Find most accessed item
    const mostAccessedItem = items.reduce((max, item) =>
      item.accessCount > (max?.accessCount ?? 0) ? item : max, undefined as { id: string; accessCount: number } | undefined);

    const result: {
      activeMinutes: number;
      averageItemAge: number;
      mostAccessedItem?: { id: string; accessCount: number };
      recentActivity: { stores: number; searches: number; retrievals: number };
    } = {
      activeMinutes,
      averageItemAge,
      recentActivity: {
        stores: this.recentActivity.stores,
        searches: this.recentActivity.searches,
        retrievals: this.recentActivity.retrievals,
      },
    };

    if (mostAccessedItem) {
      result.mostAccessedItem = { id: mostAccessedItem.id, accessCount: mostAccessedItem.accessCount };
    }

    return result;
  }

  private recentActivity = {
    stores: 0,
    searches: 0,
    retrievals: 0,
  };

  // Override methods to track activity
  override async store(item: Parameters<BaseMemoryLayer['store']>[0]): Promise<MemoryItem> {
    this.recentActivity.stores++;
    return super.store(item);
  }

  override async search(query: Parameters<BaseMemoryLayer['search']>[0]): Promise<MemorySearchResult[]> {
    this.recentActivity.searches++;
    return super.search(query);
  }

  override async retrieve(id: string): Promise<MemoryItem | null> {
    this.recentActivity.retrievals++;
    return super.retrieve(id);
  }

  private setupAutoCleanup(): void {
    // Clean up expired items every 30 minutes
    setInterval(async () => {
      try {
        await this.cleanup();
      } catch (error) {
        this.logger.error('Auto-cleanup failed', { error: error instanceof Error ? error.message : error });
      }
    }, 30 * 60 * 1000); // 30 minutes
  }

  override async enforceCapacityLimits(): Promise<number> {
    let removedCount = await super.enforceCapacityLimits();

    // Additional session-specific cleanup: remove items older than TTL
    if (this.config.ttl) {
      const now = Date.now();
      const expiredItems: string[] = [];

      for (const [id, item] of this.items) {
        const age = now - item.createdAt.getTime();
        if (age > this.config.ttl) {
          expiredItems.push(id);
        }
      }

      for (const id of expiredItems) {
        await this.delete(id);
        removedCount++;
      }

      if (expiredItems.length > 0) {
        this.logger.debug('Removed expired items', { count: expiredItems.length });
      }
    }

    return removedCount;
  }

  /**
   * Get items that are candidates for promotion to project layer
   * (frequently accessed or explicitly marked as important)
   */
  async getPromotionCandidates(): Promise<string[]> {
    const candidates: string[] = [];
    const items = Array.from(this.items.values());

    for (const item of items) {
      // Promote if:
      // 1. High access count (accessed 3+ times)
      // 2. High priority (8+)
      // 3. Explicitly tagged for promotion
      if (
        item.accessCount >= 3 ||
        item.metadata.priority >= 8 ||
        item.metadata.tags.includes('promote') ||
        item.metadata.tags.includes('important')
      ) {
        candidates.push(item.id);
      }
    }

    return candidates;
  }
}