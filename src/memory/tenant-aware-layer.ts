/**
 * Tenant-Aware Memory Layer - Multi-tenant data isolation
 * Phase 2.1.2: Multi-tenant Architecture
 */

import { createLogger } from '../utils/logger.js';
import type {
  MemoryItem,
  MemoryLayerInterface,
  MemoryQuery,
  MemorySearchResult,
  MemoryStats,
  MemoryLayer,
  MemoryLayerConfig,
} from './types.js';
import type { TenantContext, SecureMemoryMetadata } from '../security/types.js';

const logger = createLogger('tenant-aware-layer');

export abstract class TenantAwareMemoryLayer implements MemoryLayerInterface {
  protected tenantSeparation: Map<string, MemoryLayerInterface> = new Map();
  protected defaultLayer: MemoryLayerInterface;

  constructor(defaultLayer: MemoryLayerInterface) {
    this.defaultLayer = defaultLayer;
  }

  // Implement MemoryLayerInterface readonly properties
  get layer(): MemoryLayer {
    return this.defaultLayer.layer;
  }

  get config(): MemoryLayerConfig {
    return this.defaultLayer.config;
  }

  /**
   * Get or create tenant-specific layer instance
   */
  protected getTenantLayer(tenantId: string): MemoryLayerInterface {
    if (!this.tenantSeparation.has(tenantId)) {
      // Create tenant-specific layer instance
      const tenantLayer = this.createTenantLayer(tenantId);
      this.tenantSeparation.set(tenantId, tenantLayer);

      logger.info('Created tenant-specific layer', {
        tenantId,
        layerType: this.constructor.name,
      });
    }

    return this.tenantSeparation.get(tenantId)!;
  }

  /**
   * Abstract method to create tenant-specific layer implementation
   */
  protected abstract createTenantLayer(_tenantId: string): MemoryLayerInterface;

  /**
   * Store memory with tenant isolation
   */
  async store(
    item: Omit<MemoryItem, 'id' | 'createdAt' | 'updatedAt' | 'lastAccessedAt' | 'accessCount'>,
    context?: TenantContext
  ): Promise<MemoryItem> {
    if (!context) {
      throw new Error('Tenant context required for secure operations');
    }

    // Add tenant-specific metadata
    const secureItem = {
      ...item,
      metadata: {
        ...item.metadata,
        tenantId: context.tenantId,
        createdBy: context.userId,
        visibility: (item.metadata as unknown as SecureMemoryMetadata).visibility || 'private',
      } as SecureMemoryMetadata,
    };

    const tenantLayer = this.getTenantLayer(context.tenantId);
    const storedItem = await tenantLayer.store(secureItem);

    logger.debug('Memory stored with tenant isolation', {
      itemId: storedItem.id,
      tenantId: context.tenantId,
      userId: context.userId,
    });

    return storedItem;
  }

  /**
   * Retrieve memory with tenant isolation
   */
  async retrieve(id: string, context?: TenantContext): Promise<MemoryItem | null> {
    if (!context) {
      return null; // No access without tenant context
    }

    const tenantLayer = this.getTenantLayer(context.tenantId);
    const item = await tenantLayer.retrieve(id);

    if (!item) {
      return null;
    }

    // Verify tenant ownership
    const metadata = item.metadata as unknown as SecureMemoryMetadata;
    if (metadata.tenantId !== context.tenantId) {
      logger.warn('Attempted cross-tenant access blocked', {
        itemId: id,
        itemTenantId: metadata.tenantId,
        requestTenantId: context.tenantId,
        userId: context.userId,
      });
      return null;
    }

    // Check visibility and access permissions
    if (!this.canAccessMemory(item, context)) {
      return null;
    }

    return item;
  }

  /**
   * Search memories with tenant isolation
   */
  async search(query: MemoryQuery, context?: TenantContext): Promise<MemorySearchResult[]> {
    if (!context) {
      return []; // No access without tenant context
    }

    const tenantLayer = this.getTenantLayer(context.tenantId);
    const results = await tenantLayer.search(query);

    // Filter results by access permissions
    const filteredResults = results.filter(result => {
      const metadata = result.memory.metadata as unknown as SecureMemoryMetadata;
      return metadata.tenantId === context.tenantId && this.canAccessMemory(result.memory, context);
    });

    logger.debug('Search completed with tenant filtering', {
      tenantId: context.tenantId,
      totalResults: results.length,
      filteredResults: filteredResults.length,
    });

    return filteredResults;
  }

  /**
   * Update memory with tenant isolation
   */
  async update(
    id: string,
    updates: Partial<Pick<MemoryItem, 'content' | 'metadata'>>,
    context?: TenantContext
  ): Promise<MemoryItem | null> {
    if (!context) {
      return null;
    }

    // First verify the memory exists and user has access
    const existingItem = await this.retrieve(id, context);
    if (!existingItem) {
      return null;
    }

    // Check if user can modify this memory
    if (!this.canModifyMemory(existingItem, context)) {
      logger.warn('Attempted unauthorized memory modification', {
        itemId: id,
        tenantId: context.tenantId,
        userId: context.userId,
      });
      return null;
    }

    const tenantLayer = this.getTenantLayer(context.tenantId);
    return tenantLayer.update(id, updates);
  }

  /**
   * Delete memory with tenant isolation
   */
  async delete(id: string, context?: TenantContext): Promise<boolean> {
    if (!context) {
      return false;
    }

    // First verify the memory exists and user has access
    const existingItem = await this.retrieve(id, context);
    if (!existingItem) {
      return false;
    }

    // Check if user can delete this memory
    if (!this.canDeleteMemory(existingItem, context)) {
      logger.warn('Attempted unauthorized memory deletion', {
        itemId: id,
        tenantId: context.tenantId,
        userId: context.userId,
      });
      return false;
    }

    const tenantLayer = this.getTenantLayer(context.tenantId);
    return tenantLayer.delete(id);
  }

  /**
   * Get stats with tenant isolation
   */
  async getStats(context?: TenantContext): Promise<MemoryStats> {
    if (!context) {
      return {
        totalItems: 0,
        totalSize: 0,
        averageAccessCount: 0,
        lastAccessed: undefined,
        oldestItem: undefined,
        newestItem: undefined,
        categoryCounts: {},
        tagCounts: {},
      };
    }

    const tenantLayer = this.getTenantLayer(context.tenantId);
    return tenantLayer.getStats();
  }

  /**
   * Export memories with tenant isolation
   */
  async export(context?: TenantContext): Promise<MemoryItem[]> {
    if (!context) {
      return [];
    }

    const tenantLayer = this.getTenantLayer(context.tenantId);
    const items = await tenantLayer.export();

    // Double-check tenant isolation
    return items.filter(item => {
      const metadata = item.metadata as unknown as SecureMemoryMetadata;
      return metadata.tenantId === context.tenantId;
    });
  }

  /**
   * Import memories with tenant isolation
   */
  async import(items: MemoryItem[], context?: TenantContext): Promise<number> {
    if (!context) {
      throw new Error('Tenant context required for import');
    }

    // Ensure all items have correct tenant metadata
    const tenantItems = items.map(item => ({
      ...item,
      metadata: {
        ...item.metadata,
        tenantId: context.tenantId,
      } as SecureMemoryMetadata,
    }));

    const tenantLayer = this.getTenantLayer(context.tenantId);
    return tenantLayer.import(tenantItems);
  }

  /**
   * Cleanup with tenant isolation
   */
  async cleanup(context?: TenantContext): Promise<number> {
    if (!context) {
      return 0;
    }

    const tenantLayer = this.getTenantLayer(context.tenantId);
    return tenantLayer.cleanup();
  }

  /**
   * Optimize with tenant isolation
   */
  async optimize(context?: TenantContext): Promise<void> {
    if (context) {
      const tenantLayer = this.getTenantLayer(context.tenantId);
      await tenantLayer.optimize();
    } else {
      // Optimize all tenant layers
      const optimizationPromises = Array.from(this.tenantSeparation.values()).map(layer =>
        layer.optimize()
      );
      await Promise.all(optimizationPromises);
    }
  }

  /**
   * Get tenant usage statistics
   */
  async getTenantUsage(): Promise<Record<string, MemoryStats>> {
    const tenantStats: Record<string, MemoryStats> = {};

    for (const [tenantId, layer] of this.tenantSeparation) {
      try {
        tenantStats[tenantId] = await layer.getStats();
      } catch (error) {
        logger.error('Failed to get stats for tenant', {
          tenantId,
          error: error instanceof Error ? error.message : error,
        });
        tenantStats[tenantId] = {
          totalItems: 0,
          totalSize: 0,
          averageAccessCount: 0,
          lastAccessed: undefined,
          oldestItem: undefined,
          newestItem: undefined,
          categoryCounts: {},
          tagCounts: {},
        };
      }
    }

    return tenantStats;
  }

  /**
   * Bulk store memories with tenant isolation
   */
  async bulkStore(
    items: Omit<MemoryItem, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt'>[],
    context?: TenantContext
  ): Promise<MemoryItem[]> {
    if (!context) {
      throw new Error('Tenant context required for secure operations');
    }

    // Add tenant-specific metadata to all items
    const secureItems = items.map(item => ({
      ...item,
      metadata: {
        ...item.metadata,
        tenantId: context.tenantId,
        createdBy: context.userId,
        visibility: (item.metadata as unknown as SecureMemoryMetadata).visibility || 'private',
      } as SecureMemoryMetadata,
    }));

    const tenantLayer = this.getTenantLayer(context.tenantId);
    return tenantLayer.bulkStore(secureItems);
  }

  /**
   * Bulk delete memories with tenant isolation
   */
  async bulkDelete(ids: string[], context?: TenantContext): Promise<number> {
    if (!context) {
      return 0;
    }

    const tenantLayer = this.getTenantLayer(context.tenantId);
    return tenantLayer.bulkDelete(ids);
  }

  /**
   * Backup with tenant isolation
   */
  async backup(context?: TenantContext): Promise<string> {
    if (!context) {
      throw new Error('Tenant context required for backup');
    }

    const tenantLayer = this.getTenantLayer(context.tenantId);
    return tenantLayer.backup();
  }

  /**
   * Restore with tenant isolation
   */
  async restore(backupId: string, context?: TenantContext): Promise<boolean> {
    if (!context) {
      return false;
    }

    const tenantLayer = this.getTenantLayer(context.tenantId);
    return tenantLayer.restore(backupId);
  }

  /**
   * Close all tenant layers
   */
  async close(): Promise<void> {
    const closePromises = Array.from(this.tenantSeparation.values()).map(async layer => {
      if ('close' in layer && typeof layer.close === 'function') {
        try {
          await (layer as any).close();
        } catch (error) {
          logger.error('Failed to close tenant layer', {
            error: error instanceof Error ? error.message : error,
          });
        }
      }
    });

    await Promise.all(closePromises);
    this.tenantSeparation.clear();

    // Close default layer if it has close method
    if ('close' in this.defaultLayer && typeof this.defaultLayer.close === 'function') {
      await (this.defaultLayer as any).close();
    }
  }

  // Access control helper methods

  /**
   * Check if user can access a memory item
   */
  protected canAccessMemory(item: MemoryItem, context: TenantContext): boolean {
    const metadata = item.metadata as unknown as SecureMemoryMetadata;

    // Tenant must match
    if (metadata.tenantId !== context.tenantId) {
      return false;
    }

    // Check visibility
    switch (metadata.visibility) {
      case 'public':
        return true;
      case 'shared':
        // Check if user is in ACL
        return (
          metadata.accessControlList?.includes(context.userId) ||
          metadata.createdBy === context.userId
        );
      case 'private':
      default:
        // Only creator can access
        return metadata.createdBy === context.userId;
    }
  }

  /**
   * Check if user can modify a memory item
   */
  protected canModifyMemory(item: MemoryItem, context: TenantContext): boolean {
    const metadata = item.metadata as unknown as SecureMemoryMetadata;

    // Must be able to access first
    if (!this.canAccessMemory(item, context)) {
      return false;
    }

    // Only creator or admin can modify
    return metadata.createdBy === context.userId || context.roles.includes('admin');
  }

  /**
   * Check if user can delete a memory item
   */
  protected canDeleteMemory(item: MemoryItem, context: TenantContext): boolean {
    const metadata = item.metadata as unknown as SecureMemoryMetadata;

    // Must be able to access first
    if (!this.canAccessMemory(item, context)) {
      return false;
    }

    // Only creator or admin can delete
    return metadata.createdBy === context.userId || context.roles.includes('admin');
  }
}
