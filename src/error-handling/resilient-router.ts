/**
 * Resilient Router with Comprehensive Error Handling
 * Integrates error recovery, monitoring, and graceful degradation
 */

import { SimpleSecureRouter } from '../memory/simple-secure-router.js';
import { ErrorRecoverySystem } from './error-recovery.js';
import {
  AppError,
  ErrorTransformer,
  ErrorCategory,
} from './error-types.js';
import { TelemetrySystem } from '../monitoring/telemetry.js';
import { PerformanceMonitor } from '../monitoring/performance-monitor.js';
import { createLogger } from '../utils/logger.js';
import type {
  MemoryItem,
  MemoryMetadata,
  MemoryQuery,
  MemorySearchResult,
  MemoryStats,
  MemoryLayer
} from '../memory/types.js';
import type { SimpleAuthContext } from '../security/simple-auth.js';

const logger = createLogger('resilient-router');

export interface ResilientRouterConfig {
  enableErrorRecovery: boolean;
  enableGracefulDegradation: boolean;
  enableDetailedErrorLogging: boolean;
  fallbackResponses: {
    search: MemorySearchResult[];
    stats: MemoryStats;
  };
}

/**
 * Enhanced router with comprehensive error handling and resilience
 */
export class ResilientMemoryRouter extends SimpleSecureRouter {
  private errorRecovery: ErrorRecoverySystem;
  private telemetry: TelemetrySystem;
  // private performanceMonitor: PerformanceMonitor; // Currently unused
  private config: ResilientRouterConfig;

  constructor(
    routerConfig: any,
    errorRecovery: ErrorRecoverySystem,
    telemetry: TelemetrySystem,
    performanceMonitor: PerformanceMonitor,
    resilientConfig?: Partial<ResilientRouterConfig>
  ) {
    super(routerConfig);

    this.errorRecovery = errorRecovery;
    this.telemetry = telemetry;
    // this.performanceMonitor = performanceMonitor; // Currently unused
    this.config = {
      enableErrorRecovery: true,
      enableGracefulDegradation: true,
      enableDetailedErrorLogging: true,
      fallbackResponses: {
        search: [],
        stats: {
          totalItems: 0,
          totalSize: 0,
          averageAccessCount: 0,
          lastAccessed: undefined,
          oldestItem: undefined,
          newestItem: undefined,
          categoryCounts: {},
          tagCounts: {},
        },
      },
      ...resilientConfig,
    };

    this.setupFallbackStrategies();

    logger.info('Resilient memory router initialized', {
      errorRecovery: this.config.enableErrorRecovery,
      gracefulDegradation: this.config.enableGracefulDegradation,
    });
  }

  override async store(content: string, metadata: MemoryMetadata, context?: SimpleAuthContext): Promise<MemoryItem> {
    const errorContext = ErrorTransformer.extractContext({
      userId: context?.userId || undefined,
      tenantId: context?.tenantId || undefined,
      operationId: 'memory_store',
      metadata: { contentLength: content.length },
    });

    try {
      if (this.config.enableErrorRecovery) {
        return await this.errorRecovery.executeWithRecovery(
          () => super.store(content, metadata, context),
          {
            operationName: 'memory_store',
            useCircuitBreaker: true,
            useRetry: true,
            useFallback: false, // Store operations shouldn't have fallbacks
            metadata: { contentLength: content.length, tenantId: context?.tenantId },
          }
        );
      } else {
        return await super.store(content, metadata, context);
      }
    } catch (error) {
      const appError = this.handleError(error, errorContext, 'store');

      // Store operations are critical, so we don't provide fallbacks
      throw appError;
    }
  }

  override async search(query: MemoryQuery, context?: SimpleAuthContext): Promise<MemorySearchResult[]> {
    const errorContext = ErrorTransformer.extractContext({
      userId: context?.userId || undefined,
      tenantId: context?.tenantId || undefined,
      operationId: 'memory_search',
      metadata: { query: query.query, hasFilters: !!query.filters },
    });

    try {
      if (this.config.enableErrorRecovery) {
        return await this.errorRecovery.executeWithRecovery(
          () => super.search(query, context),
          {
            operationName: 'memory_search',
            useCircuitBreaker: true,
            useRetry: true,
            useFallback: this.config.enableGracefulDegradation,
            metadata: { query: query.query, tenantId: context?.tenantId },
          }
        );
      } else {
        return await super.search(query, context);
      }
    } catch (error) {
      const appError = this.handleError(error, errorContext, 'search');

      // For search operations, we can provide a fallback empty result
      if (this.config.enableGracefulDegradation && this.isRecoverableError(appError)) {
        logger.warn('Search operation failed, returning empty results as fallback', {
          error: appError.message,
          query: query.query,
          tenantId: context?.tenantId,
        });

        this.telemetry.recordMetric({
          name: 'fallback_search_executed',
          value: 1,
          unit: 'count',
          tags: {
            tenantId: context?.tenantId || 'unknown',
            errorCategory: appError.category,
          },
        });

        return this.config.fallbackResponses.search;
      }

      throw appError;
    }
  }

  override async retrieve(id: string): Promise<MemoryItem | null> {
    const errorContext = ErrorTransformer.extractContext({
      operationId: 'memory_retrieve',
      metadata: { memoryId: id },
    });

    try {
      if (this.config.enableErrorRecovery) {
        return await this.errorRecovery.executeWithRecovery(
          () => super.retrieve(id),
          {
            operationName: 'memory_retrieve',
            useCircuitBreaker: true,
            useRetry: true,
            useFallback: this.config.enableGracefulDegradation,
            metadata: { memoryId: id },
          }
        );
      } else {
        return await super.retrieve(id);
      }
    } catch (error) {
      const appError = this.handleError(error, errorContext, 'retrieve');

      // For retrieve operations, we can return null as a fallback
      if (this.config.enableGracefulDegradation && this.isRecoverableError(appError)) {
        logger.warn('Retrieve operation failed, returning null as fallback', {
          error: appError.message,
          memoryId: id,
        });

        this.telemetry.recordMetric({
          name: 'fallback_retrieve_executed',
          value: 1,
          unit: 'count',
          tags: {
            errorCategory: appError.category,
          },
        });

        return null;
      }

      throw appError;
    }
  }

  override async update(id: string, updates: Partial<Pick<MemoryItem, 'content' | 'metadata'>>): Promise<MemoryItem | null> {
    const errorContext = ErrorTransformer.extractContext({
      operationId: 'memory_update',
      metadata: { memoryId: id, hasContent: !!updates.content, hasMetadata: !!updates.metadata },
    });

    try {
      if (this.config.enableErrorRecovery) {
        return await this.errorRecovery.executeWithRecovery(
          () => super.update(id, updates),
          {
            operationName: 'memory_update',
            useCircuitBreaker: true,
            useRetry: true,
            useFallback: false, // Update operations shouldn't have fallbacks
            metadata: { memoryId: id },
          }
        );
      } else {
        return await super.update(id, updates);
      }
    } catch (error) {
      const appError = this.handleError(error, errorContext, 'update');

      // Update operations are critical, so we don't provide fallbacks
      throw appError;
    }
  }

  override async delete(id: string): Promise<boolean> {
    const errorContext = ErrorTransformer.extractContext({
      operationId: 'memory_delete',
      metadata: { memoryId: id },
    });

    try {
      if (this.config.enableErrorRecovery) {
        return await this.errorRecovery.executeWithRecovery(
          () => super.delete(id),
          {
            operationName: 'memory_delete',
            useCircuitBreaker: true,
            useRetry: true,
            useFallback: false, // Delete operations shouldn't have fallbacks
            metadata: { memoryId: id },
          }
        );
      } else {
        return await super.delete(id);
      }
    } catch (error) {
      const appError = this.handleError(error, errorContext, 'delete');

      // Delete operations are critical, so we don't provide fallbacks
      throw appError;
    }
  }

  override async getAllStats(): Promise<Record<MemoryLayer, MemoryStats>> {
    const errorContext = ErrorTransformer.extractContext({
      operationId: 'memory_stats',
    });

    try {
      if (this.config.enableErrorRecovery) {
        return await this.errorRecovery.executeWithRecovery(
          () => super.getAllStats(),
          {
            operationName: 'memory_stats',
            useCircuitBreaker: true,
            useRetry: true,
            useFallback: this.config.enableGracefulDegradation,
          }
        );
      } else {
        return await super.getAllStats();
      }
    } catch (error) {
      const appError = this.handleError(error, errorContext, 'getAllStats');

      // For stats operations, we can provide fallback empty stats
      if (this.config.enableGracefulDegradation && this.isRecoverableError(appError)) {
        logger.warn('Stats operation failed, returning fallback stats', {
          error: appError.message,
        });

        this.telemetry.recordMetric({
          name: 'fallback_stats_executed',
          value: 1,
          unit: 'count',
          tags: {
            errorCategory: appError.category,
          },
        });

        return {
          session: this.config.fallbackResponses.stats,
          project: this.config.fallbackResponses.stats,
          global: this.config.fallbackResponses.stats,
          temporal: this.config.fallbackResponses.stats,
        };
      }

      throw appError;
    }
  }

  /**
   * Get comprehensive health status including error recovery stats
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    router: any;
    errorRecovery: any;
    circuitBreakers: any;
  }> {
    try {
      const stats = await this.getAllStats();
      const errorRecoveryStats = this.errorRecovery.getStats();
      const circuitBreakers = this.errorRecovery.getCircuitBreakerStatuses();

      // Determine overall health based on circuit breaker states
      const openCircuitBreakers = circuitBreakers.filter(cb => cb.state === 'OPEN');
      const halfOpenCircuitBreakers = circuitBreakers.filter(cb => cb.state === 'HALF_OPEN');

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      if (openCircuitBreakers.length > 0) {
        status = 'unhealthy';
      } else if (halfOpenCircuitBreakers.length > 0) {
        status = 'degraded';
      }

      return {
        status,
        router: {
          totalLayers: Object.keys(stats).length,
          stats,
        },
        errorRecovery: errorRecoveryStats,
        circuitBreakers,
      };
    } catch (error) {
      logger.error('Health check failed', { error });
      return {
        status: 'unhealthy',
        router: { error: 'Health check failed' },
        errorRecovery: this.errorRecovery.getStats(),
        circuitBreakers: this.errorRecovery.getCircuitBreakerStatuses(),
      };
    }
  }

  /**
   * Reset all circuit breakers (for emergency recovery)
   */
  resetCircuitBreakers(): void {
    this.errorRecovery.resetAllCircuitBreakers();
    logger.info('All circuit breakers reset for resilient router');
  }

  /**
   * Setup fallback strategies for graceful degradation
   */
  private setupFallbackStrategies(): void {
    // Fallback for search operations
    this.errorRecovery.registerFallback('memory_search', async () => {
      logger.info('Executing fallback strategy for memory search');
      return this.config.fallbackResponses.search;
    });

    // Fallback for stats operations
    this.errorRecovery.registerFallback('memory_stats', async () => {
      logger.info('Executing fallback strategy for memory stats');
      return {
        session: this.config.fallbackResponses.stats,
        project: this.config.fallbackResponses.stats,
        global: this.config.fallbackResponses.stats,
        temporal: this.config.fallbackResponses.stats,
      };
    });

    // Fallback for retrieve operations
    this.errorRecovery.registerFallback('memory_retrieve', async () => {
      logger.info('Executing fallback strategy for memory retrieve');
      return null;
    });
  }

  /**
   * Handle and transform errors into appropriate AppError types
   */
  private handleError(error: any, context: any, operation: string): AppError {
    const appError = ErrorTransformer.toAppError(error, context);

    if (this.config.enableDetailedErrorLogging) {
      logger.error('Memory operation failed', {
        operation,
        error: appError.toJSON(),
        context,
      });
    }

    // Record error metrics
    this.telemetry.recordMetric({
      name: 'memory_operation_error',
      value: 1,
      unit: 'count',
      tags: {
        operation,
        category: appError.category,
        severity: appError.severity,
        retryable: appError.retryable.toString(),
      },
    });

    return appError;
  }

  /**
   * Determine if an error is recoverable through fallback strategies
   */
  private isRecoverableError(error: AppError): boolean {
    return (
      error.category === ErrorCategory.NETWORK ||
      error.category === ErrorCategory.DATABASE ||
      error.category === ErrorCategory.EXTERNAL_SERVICE ||
      (error.category === ErrorCategory.SYSTEM && error.retryable)
    );
  }
}

/**
 * Factory function to create a resilient router with all dependencies
 */
export function createResilientRouter(
  routerConfig: any,
  errorRecovery: ErrorRecoverySystem,
  telemetry: TelemetrySystem,
  performanceMonitor: PerformanceMonitor,
  resilientConfig?: Partial<ResilientRouterConfig>
): ResilientMemoryRouter {
  return new ResilientMemoryRouter(
    routerConfig,
    errorRecovery,
    telemetry,
    performanceMonitor,
    resilientConfig
  );
}