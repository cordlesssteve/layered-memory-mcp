/**
 * Secure Memory Router - Multi-tenant memory routing with security integration
 * Phase 2.1.2: Multi-tenant Architecture
 */

import { createLogger } from '../utils/logger.js';
import { MemoryRouter } from './router.js';
import { TenantAwareSessionLayer } from './layers/tenant-aware-session-layer.js';
import { TenantAwareProjectLayer } from './layers/tenant-aware-project-layer.js';
import { TenantAwareGlobalLayer } from './layers/tenant-aware-global-layer.js';
import { TenantAwareTemporalLayer } from './layers/tenant-aware-temporal-layer.js';
import type {
  MemoryItem,
  MemoryLayerInterface,
  MemoryRouterInterface,
  MemoryRouterConfig,
  MemoryLayer,
  MemoryQuery,
  MemorySearchResult,
  MemoryStats,
  MemoryMetadata,
  MemoryAnalysis,
  MemoryFilters,
  MemoryEvent,
  MemoryEventHandler,
} from './types.js';
import type {
  AuthContext,
  TenantContext,
  SecureMemoryMetadata,
  SecurityEvent,
} from '../security/types.js';
import type { AdvancedQuery, SearchResult } from './search/advanced-search.js';

// const _logger = createLogger('secure-memory-router');

export interface SecureMemoryRouterConfig extends MemoryRouterConfig {
  enableTenantIsolation: boolean;
  enableAccessControl: boolean;
  enableAuditLogging: boolean;
  defaultTenantId?: string;
}

export class SecureMemoryRouter implements MemoryRouterInterface {
  private readonly logger = createLogger('secure-memory-router');
  private readonly layers = new Map<
    MemoryLayer,
    | TenantAwareSessionLayer
    | TenantAwareProjectLayer
    | TenantAwareGlobalLayer
    | TenantAwareTemporalLayer
  >();
  private readonly eventHandlers: MemoryEventHandler[] = [];
  private readonly config: SecureMemoryRouterConfig;
  private readonly fallbackRouter: MemoryRouter;
  private readonly securityEvents: SecurityEvent[] = [];

  constructor(config: Partial<SecureMemoryRouterConfig> = {}) {
    this.config = {
      sessionLayer: { maxItems: 50, maxSizeBytes: 1024 * 1024, ttl: undefined },
      projectLayer: { maxItems: 1000, maxSizeBytes: 10 * 1024 * 1024, ttl: undefined },
      globalLayer: { maxItems: 10000, maxSizeBytes: 100 * 1024 * 1024, ttl: undefined },
      temporalLayer: { maxItems: 50000, maxSizeBytes: 500 * 1024 * 1024, ttl: undefined },
      routing: {
        sessionThreshold: 0.8,
        projectThreshold: 0.6,
        globalThreshold: 0.4,
        temporalFallback: true,
        maxResults: 20,
        scoringWeights: {
          recency: 0.3,
          frequency: 0.2,
          relevance: 0.4,
          priority: 0.1,
        },
      },
      relationships: {
        enabled: true, // Enable relationship detection in secure router
        minConfidence: 0.7, // Higher confidence threshold for security
        batchSize: 50, // Smaller batch size for performance
      },
      enableTenantIsolation: true,
      enableAccessControl: true,
      enableAuditLogging: true,
      defaultTenantId: 'default-tenant',
      ...config,
    };

    this.initializeTenantAwareLayers();

    // Create fallback router for non-tenant operations
    this.fallbackRouter = new MemoryRouter({
      sessionLayer: this.config.sessionLayer,
      projectLayer: this.config.projectLayer,
      globalLayer: this.config.globalLayer,
      temporalLayer: this.config.temporalLayer,
      routing: this.config.routing,
    });

    this.logger.info('Secure memory router initialized', {
      layerCount: this.layers.size,
      tenantIsolation: this.config.enableTenantIsolation,
      accessControl: this.config.enableAccessControl,
      auditLogging: this.config.enableAuditLogging,
    });
  }

  /**
   * Store memory with security context
   */
  async store(
    content: string,
    metadata: MemoryMetadata,
    context?: AuthContext
  ): Promise<MemoryItem> {
    if (this.config.enableTenantIsolation && !context) {
      throw new Error('Authentication context required for secure operations');
    }

    const tenantContext = context ? this.createTenantContext(context) : undefined;
    const targetLayer = this.determineStorageLayer(content, metadata, context);
    const layer = this.layers.get(targetLayer);

    if (!layer) {
      throw new Error(`Layer ${targetLayer} not available`);
    }

    // Enhance metadata with security information
    const secureMetadata: SecureMemoryMetadata = {
      ...metadata,
      tenantId: context?.tenantId || this.config.defaultTenantId!,
      createdBy: context?.userId || 'system',
      visibility: 'private', // Default to private
      source: metadata.source || 'mcp-tool',
    };

    // Store in tenant-aware layer
    const item = await layer.store(
      {
        content,
        metadata: secureMetadata,
      },
      tenantContext
    );

    // Log security event
    if (this.config.enableAuditLogging && context) {
      await this.logSecurityEvent({
        tenantId: context.tenantId,
        userId: context.userId,
        eventType: 'data_modification',
        severity: 'low',
        resource: 'memory',
        action: 'create',
        metadata: {
          itemId: item.id,
          layer: targetLayer,
          contentLength: content.length,
          category: metadata.category,
        },
      });
    }

    // Emit event
    await this.emitEvent({
      type: 'store',
      layer: targetLayer,
      itemId: item.id,
      timestamp: new Date(),
      metadata: {
        contentLength: content.length,
        category: metadata.category,
        tenantId: context?.tenantId,
        userId: context?.userId,
      },
    });

    this.logger.info('Secure memory stored', {
      id: item.id,
      layer: targetLayer,
      tenantId: context?.tenantId,
      userId: context?.userId,
    });

    return item;
  }

  /**
   * Search memories with security context
   */
  async search(query: MemoryQuery, context?: AuthContext): Promise<MemorySearchResult[]> {
    if (this.config.enableTenantIsolation && !context) {
      return []; // No access without authentication
    }

    const startTime = Date.now();
    const tenantContext = context ? this.createTenantContext(context) : undefined;

    // Analyze query to determine which layers to search
    const analysis = await this.analyze(query.query);
    const layersToSearch = analysis.suggestedLayers;

    this.logger.debug('Secure search routing', {
      query: query.query,
      suggestedLayers: layersToSearch,
      tenantId: context?.tenantId,
      userId: context?.userId,
    });

    // Search each layer in parallel with tenant context
    const searchPromises = layersToSearch.map(async layerName => {
      const layer = this.layers.get(layerName);
      if (!layer) return [];

      try {
        const results = await layer.search(query, tenantContext);
        return results;
      } catch (error) {
        this.logger.error(`Secure search failed in ${layerName} layer`, {
          error: error instanceof Error ? error.message : error,
          tenantId: context?.tenantId,
        });
        return [];
      }
    });

    const layerResults = await Promise.all(searchPromises);
    const allResults = layerResults.flat();

    // Merge and rank results
    const mergedResults = this.mergeAndRankResults(allResults, query);

    // Apply query limit or default limit
    const limit = query.limit ?? this.config.routing.maxResults;
    const finalResults = mergedResults.slice(0, limit);

    // Log security event
    if (this.config.enableAuditLogging && context) {
      await this.logSecurityEvent({
        tenantId: context.tenantId,
        userId: context.userId,
        eventType: 'data_access',
        severity: 'low',
        resource: 'memory',
        action: 'search',
        metadata: {
          query: query.query,
          layersSearched: layersToSearch,
          resultCount: finalResults.length,
          searchTime: Date.now() - startTime,
        },
      });
    }

    // Emit event
    await this.emitEvent({
      type: 'search',
      layer: 'session',
      query: query.query,
      timestamp: new Date(),
      metadata: {
        layersSearched: layersToSearch,
        resultCount: finalResults.length,
        searchTime: Date.now() - startTime,
        tenantId: context?.tenantId,
        userId: context?.userId,
      },
    });

    this.logger.info('Secure search completed', {
      query: query.query,
      layersSearched: layersToSearch,
      resultCount: finalResults.length,
      searchTime: Date.now() - startTime,
      tenantId: context?.tenantId,
    });

    return finalResults;
  }

  /**
   * Retrieve memory with security context
   */
  async retrieve(id: string, context?: AuthContext): Promise<MemoryItem | null> {
    if (this.config.enableTenantIsolation && !context) {
      return null;
    }

    const tenantContext = context ? this.createTenantContext(context) : undefined;

    // Try each layer until found
    for (const [layerName, layer] of this.layers) {
      try {
        const item = await layer.retrieve(id, tenantContext);
        if (item) {
          // Log access
          if (this.config.enableAuditLogging && context) {
            await this.logSecurityEvent({
              tenantId: context.tenantId,
              userId: context.userId,
              eventType: 'data_access',
              severity: 'low',
              resource: 'memory',
              action: 'read',
              metadata: {
                itemId: id,
                layer: layerName,
              },
            });
          }

          // Emit event
          await this.emitEvent({
            type: 'retrieve',
            layer: layerName,
            itemId: id,
            timestamp: new Date(),
            metadata: {
              tenantId: context?.tenantId,
              userId: context?.userId,
            },
          });

          this.logger.debug('Secure memory retrieved', {
            id,
            layer: layerName,
            tenantId: context?.tenantId,
          });
          return item;
        }
      } catch (error) {
        this.logger.error(`Secure retrieve failed in ${layerName} layer`, {
          id,
          error: error instanceof Error ? error.message : error,
          tenantId: context?.tenantId,
        });
      }
    }

    return null;
  }

  /**
   * Update memory with security context
   */
  async update(
    id: string,
    updates: Partial<Pick<MemoryItem, 'content' | 'metadata'>>,
    context?: AuthContext
  ): Promise<MemoryItem | null> {
    if (this.config.enableTenantIsolation && !context) {
      return null;
    }

    const tenantContext = context ? this.createTenantContext(context) : undefined;

    // Find which layer contains the item and update
    for (const [layerName, layer] of this.layers) {
      try {
        const updated = await layer.update(id, updates, tenantContext);
        if (updated) {
          // Log modification
          if (this.config.enableAuditLogging && context) {
            await this.logSecurityEvent({
              tenantId: context.tenantId,
              userId: context.userId,
              eventType: 'data_modification',
              severity: 'low',
              resource: 'memory',
              action: 'update',
              metadata: {
                itemId: id,
                layer: layerName,
                hasContentChange: !!updates.content,
                hasMetadataChange: !!updates.metadata,
              },
            });
          }

          // Emit event
          await this.emitEvent({
            type: 'update',
            layer: layerName,
            itemId: id,
            timestamp: new Date(),
            metadata: {
              ...updates,
              tenantId: context?.tenantId,
              userId: context?.userId,
            },
          });

          this.logger.info('Secure memory updated', {
            id,
            layer: layerName,
            tenantId: context?.tenantId,
          });
          return updated;
        }
      } catch (error) {
        this.logger.error(`Secure update failed in ${layerName} layer`, {
          id,
          error: error instanceof Error ? error.message : error,
          tenantId: context?.tenantId,
        });
      }
    }

    return null;
  }

  /**
   * Delete memory with security context
   */
  async delete(id: string, context?: AuthContext): Promise<boolean> {
    if (this.config.enableTenantIsolation && !context) {
      return false;
    }

    const tenantContext = context ? this.createTenantContext(context) : undefined;
    let deleted = false;

    // Try to delete from all layers
    for (const [layerName, layer] of this.layers) {
      try {
        if (await layer.delete(id, tenantContext)) {
          deleted = true;

          // Log deletion
          if (this.config.enableAuditLogging && context) {
            await this.logSecurityEvent({
              tenantId: context.tenantId,
              userId: context.userId,
              eventType: 'data_modification',
              severity: 'medium',
              resource: 'memory',
              action: 'delete',
              metadata: {
                itemId: id,
                layer: layerName,
              },
            });
          }

          // Emit event
          await this.emitEvent({
            type: 'delete',
            layer: layerName,
            itemId: id,
            timestamp: new Date(),
            metadata: {
              tenantId: context?.tenantId,
              userId: context?.userId,
            },
          });

          this.logger.info('Secure memory deleted', {
            id,
            layer: layerName,
            tenantId: context?.tenantId,
          });
        }
      } catch (error) {
        this.logger.error(`Secure delete failed in ${layerName} layer`, {
          id,
          error: error instanceof Error ? error.message : error,
          tenantId: context?.tenantId,
        });
      }
    }

    return deleted;
  }

  /**
   * Get layer with security context
   */
  getLayer(layer: MemoryLayer, context?: AuthContext): MemoryLayerInterface {
    if (this.config.enableTenantIsolation && !context) {
      throw new Error('Authentication context required for layer access');
    }

    const layerInstance = this.layers.get(layer);
    if (!layerInstance) {
      throw new Error(`Layer ${layer} not available`);
    }
    return layerInstance;
  }

  /**
   * Get all stats with tenant isolation
   */
  async getAllStats(context?: AuthContext): Promise<Record<MemoryLayer, MemoryStats>> {
    if (this.config.enableTenantIsolation && !context) {
      return {} as Record<MemoryLayer, MemoryStats>;
    }

    const tenantContext = context ? this.createTenantContext(context) : undefined;
    const stats = {} as Record<MemoryLayer, MemoryStats>;

    for (const [layerName, layer] of this.layers) {
      try {
        stats[layerName] = await layer.getStats(tenantContext);
      } catch (error) {
        this.logger.error(`Failed to get secure stats for ${layerName}`, {
          error: error instanceof Error ? error.message : error,
          tenantId: context?.tenantId,
        });
        stats[layerName] = {
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

    return stats;
  }

  /**
   * Get tenant usage across all layers
   */
  async getTenantUsage(context: AuthContext): Promise<{
    tenantId: string;
    layers: Record<MemoryLayer, MemoryStats>;
    totalMemories: number;
    totalSize: number;
    lastUpdated: string;
  }> {
    const layerStats = await this.getAllStats(context);

    const totalMemories = Object.values(layerStats).reduce(
      (sum, stats) => sum + stats.totalItems,
      0
    );

    const totalSize = Object.values(layerStats).reduce((sum, stats) => sum + stats.totalSize, 0);

    return {
      tenantId: context.tenantId,
      layers: layerStats,
      totalMemories,
      totalSize,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Get security events for tenant
   */
  getSecurityEvents(context: AuthContext, limit = 100): SecurityEvent[] {
    return this.securityEvents
      .filter(event => event.tenantId === context.tenantId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  // Forward other methods to the fallback router for now
  async advancedSearch(query: AdvancedQuery): Promise<SearchResult[]> {
    return this.fallbackRouter.advancedSearch(query);
  }

  async semanticSearch(
    query: string,
    options?: { threshold?: number; maxResults?: number }
  ): Promise<SearchResult[]> {
    return this.fallbackRouter.semanticSearch(query, options);
  }

  async temporalSearch(
    query: string,
    timeRange?: { start?: Date; end?: Date }
  ): Promise<SearchResult[]> {
    return this.fallbackRouter.temporalSearch(query, timeRange);
  }

  async relationshipSearch(query: string, relationshipTypes?: string[]): Promise<SearchResult[]> {
    return this.fallbackRouter.relationshipSearch(query, relationshipTypes);
  }

  async optimize(): Promise<void> {
    // Optimize all layers
    const optimizePromises = Array.from(this.layers.values()).map(layer => layer.optimize());
    await Promise.all(optimizePromises);
  }

  async cleanup(): Promise<Record<MemoryLayer, number>> {
    const cleanupResults = {} as Record<MemoryLayer, number>;

    for (const [layerName, layer] of this.layers) {
      try {
        const cleanedCount = await layer.cleanup();
        cleanupResults[layerName] = cleanedCount;
      } catch (error) {
        this.logger.error(`Cleanup failed for ${layerName}`, {
          error: error instanceof Error ? error.message : error,
        });
        cleanupResults[layerName] = 0;
      }
    }

    return cleanupResults;
  }

  async migrate(
    fromLayer: MemoryLayer,
    toLayer: MemoryLayer,
    criteria: MemoryFilters
  ): Promise<number> {
    // For now, delegate to fallback router
    return this.fallbackRouter.migrate(fromLayer, toLayer, criteria);
  }

  async analyze(query: string): Promise<MemoryAnalysis> {
    return this.fallbackRouter.analyze(query);
  }

  addEventListener(handler: MemoryEventHandler): void {
    this.eventHandlers.push(handler);
  }

  removeEventListener(handler: MemoryEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index >= 0) {
      this.eventHandlers.splice(index, 1);
    }
  }

  async close(): Promise<void> {
    this.logger.info('Closing secure memory router');

    // Close all tenant-aware layers
    const closePromises = Array.from(this.layers.values()).map(async layer => {
      try {
        await layer.close();
      } catch (error) {
        this.logger.error('Failed to close tenant-aware layer', {
          error: error instanceof Error ? error.message : error,
        });
      }
    });

    await Promise.all(closePromises);

    // Close fallback router
    await this.fallbackRouter.close();

    this.logger.info('Secure memory router closed');
  }

  // Relationship methods - delegated to fallback for now
  async buildKnowledgeGraph() {
    return this.fallbackRouter.buildKnowledgeGraph();
  }
  async getMemoryRelationships(memoryId: string) {
    return this.fallbackRouter.getMemoryRelationships(memoryId);
  }
  async detectConflicts() {
    return this.fallbackRouter.detectConflicts();
  }
  async getMemoryVersions(memoryId: string) {
    return this.fallbackRouter.getMemoryVersions(memoryId);
  }
  async summarizeCluster(memoryIds: string[]) {
    return this.fallbackRouter.summarizeCluster(memoryIds);
  }
  async getRelationshipSuggestions(limit?: number, minConfidence?: number) {
    return this.fallbackRouter.getRelationshipSuggestions(limit, minConfidence);
  }
  async validateRelationship(suggestionId: string, options: any) {
    return this.fallbackRouter.validateRelationship(suggestionId, options);
  }
  async getValidationStats() {
    return this.fallbackRouter.getValidationStats();
  }
  async getAlgorithmInsights() {
    return this.fallbackRouter.getAlgorithmInsights();
  }
  async predictMemoryDecay() {
    return this.fallbackRouter.predictMemoryDecay();
  }
  async getUrgentMemories() {
    return this.fallbackRouter.getUrgentMemories();
  }
  async getPromotionCandidates() {
    return this.fallbackRouter.getPromotionCandidates();
  }
  async getArchivalCandidates() {
    return this.fallbackRouter.getArchivalCandidates();
  }
  async getDecayModelInsights() {
    return this.fallbackRouter.getDecayModelInsights();
  }
  async storeWithRelationships(content: string, metadata: MemoryMetadata) {
    return this.fallbackRouter.storeWithRelationships(content, metadata);
  }
  getRelationshipEngine() {
    return this.fallbackRouter.getRelationshipEngine();
  }

  // Private helper methods

  private initializeTenantAwareLayers(): void {
    // Initialize tenant-aware session layer
    this.layers.set('session', new TenantAwareSessionLayer(this.config.sessionLayer));

    // Initialize tenant-aware project layer
    this.layers.set('project', new TenantAwareProjectLayer('default', this.config.projectLayer));

    // Initialize tenant-aware global layer
    this.layers.set('global', new TenantAwareGlobalLayer(this.config.globalLayer));

    // Initialize tenant-aware temporal layer
    this.layers.set('temporal', new TenantAwareTemporalLayer(this.config.temporalLayer));
  }

  private createTenantContext(authContext: AuthContext): TenantContext {
    return {
      tenantId: authContext.tenantId,
      userId: authContext.userId,
      roles: authContext.roles,
      permissions: authContext.permissions,
    };
  }

  private determineStorageLayer(
    content: string,
    metadata: MemoryMetadata,
    _context?: AuthContext
  ): MemoryLayer {
    // Use the same logic as the original router
    return this.fallbackRouter['determineStorageLayer'](content, metadata);
  }

  private mergeAndRankResults(
    results: MemorySearchResult[],
    query: MemoryQuery
  ): MemorySearchResult[] {
    // Use the same logic as the original router
    return this.fallbackRouter['mergeAndRankResults'](results, query);
  }

  private async emitEvent(event: MemoryEvent): Promise<void> {
    for (const handler of this.eventHandlers) {
      try {
        await handler(event);
      } catch (error) {
        this.logger.error('Event handler failed', {
          eventType: event.type,
          error: error instanceof Error ? error.message : error,
        });
      }
    }
  }

  private async logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<void> {
    const securityEvent: SecurityEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      ...event,
    };

    this.securityEvents.push(securityEvent);

    // Keep only recent events (last 1000)
    if (this.securityEvents.length > 1000) {
      this.securityEvents.splice(0, this.securityEvents.length - 1000);
    }

    // Log important events
    if (event.severity === 'high' || event.severity === 'critical') {
      this.logger.warn('Security event logged', {
        eventType: event.eventType,
        severity: event.severity,
        tenantId: event.tenantId,
        userId: event.userId,
        metadata: event.metadata,
      });
    }
  }
}
