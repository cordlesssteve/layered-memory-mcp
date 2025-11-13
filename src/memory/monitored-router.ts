/**
 * Monitored Memory Router
 * Wraps MemoryRouter with telemetry and performance monitoring
 * No authentication required - lighter weight than production-ready-system
 */

import { MemoryRouter } from './router.js';
import { TelemetrySystem } from '../monitoring/telemetry.js';
import { PerformanceMonitor } from '../monitoring/performance-monitor.js';
import { MemoryRateLimiter, type RateLimitConfig } from '../security/rate-limiter.js';
import { RequestValidator } from '../security/request-validator.js';
import { setupEnvironment } from '../config/environment.js';
import { createLogger } from '../utils/logger.js';
import type {
  MemoryItem,
  MemoryRouterInterface,
  MemoryRouterConfig,
  MemoryQuery,
  MemorySearchResult,
  MemoryStats,
  MemoryMetadata,
  MemoryLayer,
} from './types.js';

const logger = createLogger('monitored-router');

export interface MonitoredRouterConfig extends MemoryRouterConfig {
  monitoring?: {
    enabled: boolean;
    metricsRetentionMs?: number;
    slowOperationMs?: number;
  };
  security?: {
    rateLimiting?: {
      enabled: boolean;
      windowMs?: number;
      maxRequests?: number;
    };
    requestValidation?: {
      enabled: boolean;
    };
  };
}

/**
 * Memory router with integrated monitoring, telemetry, and security
 */
export class MonitoredMemoryRouter implements MemoryRouterInterface {
  private router: MemoryRouter;
  private telemetry: TelemetrySystem;
  private performanceMonitor: PerformanceMonitor;
  private monitoringEnabled: boolean;
  private rateLimiter?: MemoryRateLimiter;
  private rateLimitingEnabled: boolean;
  private validationEnabled: boolean;

  constructor(config: Partial<MonitoredRouterConfig> = {}) {
    const { monitoring, security, ...routerConfig } = config;

    this.router = new MemoryRouter(routerConfig);
    this.monitoringEnabled = monitoring?.enabled !== false;
    this.rateLimitingEnabled = security?.rateLimiting?.enabled || false;
    this.validationEnabled = security?.requestValidation?.enabled || false;

    // Get environment configuration
    const env = setupEnvironment();

    // Initialize monitoring systems
    this.telemetry = new TelemetrySystem(env, {
      metricsRetentionMs: monitoring?.metricsRetentionMs || 3600000, // 1 hour default
    });

    this.performanceMonitor = new PerformanceMonitor(this.telemetry, {
      slowOperationMs: monitoring?.slowOperationMs || 1000,
    });

    // Initialize security systems if enabled
    if (this.rateLimitingEnabled) {
      const rateLimitConfig: RateLimitConfig = {
        windowMs: security?.rateLimiting?.windowMs || env.rateLimitWindowMs || 60000, // 1 minute default
        maxRequests: security?.rateLimiting?.maxRequests || env.rateLimitMaxRequests || 100, // 100 req/min default
        keyGenerator: (context: any) => context?.clientId || context?.sessionId || 'anonymous',
      };
      this.rateLimiter = new MemoryRateLimiter(rateLimitConfig);
      logger.info('Rate limiting enabled', {
        windowMs: rateLimitConfig.windowMs,
        maxRequests: rateLimitConfig.maxRequests,
      });
    }

    if (this.validationEnabled) {
      logger.info('Request validation enabled');
    }

    const features = [];
    if (this.monitoringEnabled) features.push('monitoring');
    if (this.rateLimitingEnabled) features.push('rate-limiting');
    if (this.validationEnabled) features.push('validation');

    logger.info(`Monitored memory router initialized with: ${features.join(', ')}`);
  }

  /**
   * Store memory with performance tracking, rate limiting, and validation
   */
  async store(content: string, metadata: MemoryMetadata): Promise<MemoryItem> {
    // Rate limiting check
    if (this.rateLimitingEnabled && this.rateLimiter) {
      const context = {
        clientId: metadata.source || 'anonymous',
        sessionId: metadata.sessionId,
      };

      const rateLimitResult = await this.rateLimiter.checkLimit(context);

      if (!rateLimitResult.allowed) {
        this.telemetry.recordMetric({
          name: 'memory_store_rate_limited',
          value: 1,
          unit: 'count',
          tags: {
            category: metadata.category || 'unknown',
          },
        });

        throw new Error(`Rate limit exceeded. Retry after ${rateLimitResult.retryAfter}ms`);
      }
    }

    // Request validation
    if (this.validationEnabled) {
      const validationResult = RequestValidator.validateMemoryStore({
        content,
        metadata,
      });

      if (!validationResult.success) {
        this.telemetry.recordMetric({
          name: 'memory_store_validation_failed',
          value: 1,
          unit: 'count',
          tags: {
            category: metadata.category || 'unknown',
            errorType: validationResult.errors?.[0]?.code || 'validation_error',
          },
        });

        throw new Error(
          `Validation failed: ${validationResult.errors?.map(e => e.message).join(', ')}`
        );
      }
    }

    if (!this.monitoringEnabled) {
      return this.router.store(content, metadata);
    }

    return this.performanceMonitor.trackOperation('memory_store', async () => {
      const startTime = Date.now();

      try {
        const item = await this.router.store(content, metadata);

        // Record success metrics
        this.telemetry.recordMetric({
          name: 'memory_store_success',
          value: 1,
          unit: 'count',
          tags: {
            category: metadata.category || 'unknown',
            layer: this.determineLayer(metadata),
          },
        });

        this.telemetry.recordMetric({
          name: 'memory_store_size',
          value: content.length,
          unit: 'bytes',
          tags: {
            category: metadata.category || 'unknown',
          },
        });

        const duration = Date.now() - startTime;
        this.telemetry.recordMetric({
          name: 'memory_store_duration',
          value: duration,
          unit: 'duration_ms',
          tags: {
            category: metadata.category || 'unknown',
          },
        });

        return item;
      } catch (error) {
        // Record error metrics
        this.telemetry.recordMetric({
          name: 'memory_store_error',
          value: 1,
          unit: 'count',
          tags: {
            errorType: error instanceof Error ? error.name : 'unknown',
            category: metadata.category || 'unknown',
          },
        });

        throw error;
      }
    });
  }

  /**
   * Search memory with performance tracking
   */
  async search(query: MemoryQuery): Promise<MemorySearchResult[]> {
    if (!this.monitoringEnabled) {
      return this.router.search(query);
    }

    return this.performanceMonitor.trackOperation('memory_search', async () => {
      const startTime = Date.now();

      try {
        const results = await this.router.search(query);

        // Record success metrics
        this.telemetry.recordMetric({
          name: 'memory_search_success',
          value: 1,
          unit: 'count',
          tags: {
            resultCount: results.length.toString(),
            hasQuery: (!!query.query).toString(),
          },
        });

        this.telemetry.recordMetric({
          name: 'memory_search_results',
          value: results.length,
          unit: 'count',
          tags: {
            queryType: query.query ? 'text' : 'filter',
          },
        });

        const duration = Date.now() - startTime;
        this.telemetry.recordMetric({
          name: 'memory_search_duration',
          value: duration,
          unit: 'duration_ms',
          tags: {
            resultCount: results.length.toString(),
          },
        });

        return results;
      } catch (error) {
        // Record error metrics
        this.telemetry.recordMetric({
          name: 'memory_search_error',
          value: 1,
          unit: 'count',
          tags: {
            errorType: error instanceof Error ? error.name : 'unknown',
          },
        });

        throw error;
      }
    });
  }

  /**
   * Get statistics for all layers
   */
  async getAllStats(): Promise<Record<MemoryLayer, MemoryStats>> {
    if (!this.monitoringEnabled) {
      return this.router.getAllStats();
    }

    return this.performanceMonitor.trackOperation('memory_get_all_stats', async () => {
      try {
        const stats = await this.router.getAllStats();

        // Record stats retrieval
        this.telemetry.recordMetric({
          name: 'memory_stats_retrieved',
          value: 1,
          unit: 'count',
          tags: {
            layer: 'all',
          },
        });

        return stats;
      } catch (error) {
        this.telemetry.recordMetric({
          name: 'memory_stats_error',
          value: 1,
          unit: 'count',
          tags: {
            errorType: error instanceof Error ? error.name : 'unknown',
          },
        });

        throw error;
      }
    });
  }

  /**
   * Get telemetry system for external access
   */
  getTelemetry(): TelemetrySystem {
    return this.telemetry;
  }

  /**
   * Get performance monitor for external access
   */
  getPerformanceMonitor(): PerformanceMonitor {
    return this.performanceMonitor;
  }

  /**
   * Get comprehensive monitoring stats
   */
  getMonitoringStats() {
    // Get all metrics from telemetry system
    const allMetricNames = this.telemetry.getMetricNames();
    const allMetrics = allMetricNames.flatMap(name => this.telemetry.getMetrics(name));

    return {
      telemetry: allMetrics,
      performance: {}, // PerformanceMonitor doesn't have getMetrics()
      enabled: this.monitoringEnabled,
    };
  }

  /**
   * Gracefully close the router and monitoring systems
   */
  async close(): Promise<void> {
    logger.info('Closing monitored router');
    await this.router.close();

    if (this.monitoringEnabled) {
      // Telemetry and performance monitor don't require cleanup
      logger.info('Monitoring systems stopped');
    }
  }

  /**
   * Helper to determine target storage layer
   */
  private determineLayer(metadata: MemoryMetadata): string {
    if (metadata.sessionId) return 'session';
    if (metadata.projectId) return 'project';
    return 'global';
  }

  // Delegate all MemoryRouter methods to the underlying router
  async retrieve(id: string): Promise<MemoryItem | null> {
    return this.router.retrieve(id);
  }

  async update(
    _id: string,
    _updates: Partial<Pick<MemoryItem, 'content' | 'metadata'>>
  ): Promise<MemoryItem | null> {
    // Rate limiting check
    if (this.rateLimitingEnabled && this.rateLimiter) {
      const context = {
        clientId: _updates.metadata?.source || 'anonymous',
        sessionId: _updates.metadata?.sessionId,
      };

      const rateLimitResult = await this.rateLimiter.checkLimit(context);

      if (!rateLimitResult.allowed) {
        this.telemetry.recordMetric({
          name: 'memory_update_rate_limited',
          value: 1,
          unit: 'count',
        });

        throw new Error(`Rate limit exceeded. Retry after ${rateLimitResult.retryAfter}ms`);
      }
    }

    // Request validation for updates
    if (this.validationEnabled && _updates.content) {
      const validationResult = RequestValidator.validateMemoryStore({
        content: _updates.content,
        metadata: _updates.metadata || ({} as any),
      });

      if (!validationResult.success) {
        this.telemetry.recordMetric({
          name: 'memory_update_validation_failed',
          value: 1,
          unit: 'count',
        });

        throw new Error(
          `Validation failed: ${validationResult.errors?.map(e => e.message).join(', ')}`
        );
      }
    }

    return this.router.update(_id, _updates);
  }

  async delete(id: string): Promise<boolean> {
    // Rate limiting check
    if (this.rateLimitingEnabled && this.rateLimiter) {
      const context = {
        clientId: 'anonymous', // No metadata available for delete
      };

      const rateLimitResult = await this.rateLimiter.checkLimit(context);

      if (!rateLimitResult.allowed) {
        this.telemetry.recordMetric({
          name: 'memory_delete_rate_limited',
          value: 1,
          unit: 'count',
        });

        throw new Error(`Rate limit exceeded. Retry after ${rateLimitResult.retryAfter}ms`);
      }
    }

    return this.router.delete(id);
  }

  addEventListener(handler: any): void {
    return this.router.addEventListener(handler);
  }

  removeEventListener(handler: any): void {
    return this.router.removeEventListener(handler);
  }

  // Advanced search methods - delegate to underlying router
  async advancedSearch(query: any): Promise<any[]> {
    return this.router.advancedSearch(query);
  }

  async semanticSearch(
    query: string,
    options?: { threshold?: number; maxResults?: number }
  ): Promise<any[]> {
    return this.router.semanticSearch(query, options);
  }

  async temporalSearch(query: string, timeRange?: { start?: Date; end?: Date }): Promise<any[]> {
    return this.router.temporalSearch(query, timeRange);
  }

  // Relationship methods - delegate to underlying router
  async buildKnowledgeGraph(): Promise<any> {
    return this.router.buildKnowledgeGraph();
  }

  async getMemoryRelationships(memoryId: string): Promise<any[]> {
    return this.router.getMemoryRelationships(memoryId);
  }

  async detectConflicts(): Promise<any[]> {
    return this.router.detectConflicts();
  }

  async getMemoryVersions(memoryId: string): Promise<any[]> {
    return this.router.getMemoryVersions(memoryId);
  }

  async summarizeCluster(memoryIds: string[]): Promise<string> {
    return this.router.summarizeCluster(memoryIds);
  }

  // Validation methods - delegate to underlying router
  async getRelationshipSuggestions(limit?: number, minConfidence?: number): Promise<any[]> {
    return this.router.getRelationshipSuggestions(limit, minConfidence);
  }

  async validateRelationship(suggestionId: string, action: any): Promise<any> {
    return this.router.validateRelationship(suggestionId, action);
  }

  async getValidationStats(): Promise<any> {
    return this.router.getValidationStats();
  }

  async getAlgorithmInsights(): Promise<any> {
    return this.router.getAlgorithmInsights();
  }

  // Decay prediction methods - delegate to underlying router
  async predictMemoryDecay(): Promise<any[]> {
    return this.router.predictMemoryDecay();
  }

  async getUrgentMemories(): Promise<any[]> {
    return this.router.getUrgentMemories();
  }

  async getPromotionCandidates(): Promise<any[]> {
    return this.router.getPromotionCandidates();
  }

  async getArchivalCandidates(): Promise<any[]> {
    return this.router.getArchivalCandidates();
  }

  async getDecayModelInsights(): Promise<any> {
    return this.router.getDecayModelInsights();
  }

  // Additional router methods
  getLayer(layer: MemoryLayer): any {
    return this.router.getLayer(layer);
  }

  getRelationshipEngine(): any {
    return this.router.getRelationshipEngine();
  }

  // Additional MemoryRouterInterface methods
  async optimize(): Promise<void> {
    return (this.router as any).optimize?.();
  }

  async cleanup(): Promise<Record<MemoryLayer, number>> {
    return (this.router as any).cleanup?.() || {};
  }

  async migrate(_fromLayer: MemoryLayer, _toLayer: MemoryLayer, _criteria: any): Promise<number> {
    return (this.router as any).migrate?.(_fromLayer, _toLayer, _criteria) || 0;
  }

  async analyze(): Promise<any> {
    return (this.router as any).analyze?.();
  }

  // Graph operations - delegate to router
  async findMemoryPath(fromId: string, toId: string): Promise<MemoryItem[] | null> {
    return this.router.findMemoryPath(fromId, toId);
  }

  async getRelatedMemories(
    memoryId: string,
    relationshipType?: string
  ): Promise<Array<{ memory: MemoryItem; relationshipType: string; strength: number }>> {
    return this.router.getRelatedMemories(memoryId, relationshipType);
  }

  async createMemoryRelationship(
    fromId: string,
    toId: string,
    type: string,
    strength?: number
  ): Promise<boolean> {
    return this.router.createMemoryRelationship(fromId, toId, type, strength);
  }

  async getReachableMemories(memoryId: string): Promise<MemoryItem[]> {
    return this.router.getReachableMemories(memoryId);
  }

  async graphSearch(query: MemoryQuery, maxDepth?: number): Promise<MemorySearchResult[]> {
    return this.router.graphSearch(query, maxDepth);
  }
}
