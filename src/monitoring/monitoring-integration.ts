/**
 * Monitoring Integration
 * Integrates telemetry and performance monitoring with the security middleware
 */

import { TelemetrySystem } from './telemetry.js';
import { PerformanceMonitor } from './performance-monitor.js';
import { SecurityMiddleware } from '../security/security-middleware.js';
import { SimpleSecureRouter } from '../memory/simple-secure-router.js';
import { createLogger } from '../utils/logger.js';
import type { Environment } from '../config/environment.js';

const logger = createLogger('monitoring-integration');

export interface MonitoringConfig {
  telemetry: {
    enabled: boolean;
    metricsRetentionMs: number;
    exportMetrics: boolean;
  };
  performance: {
    enabled: boolean;
    slowOperationMs: number;
    alerting: boolean;
  };
  healthChecks: {
    enabled: boolean;
    intervalMs: number;
  };
}

/**
 * Enhanced security middleware with integrated monitoring
 */
export class MonitoredSecurityMiddleware extends SecurityMiddleware {
  private telemetry: TelemetrySystem;
  private performanceMonitor: PerformanceMonitor;

  constructor(
    env: Environment,
    telemetry: TelemetrySystem,
    performanceMonitor: PerformanceMonitor,
    securityConfig?: any
  ) {
    super(env, securityConfig);
    this.telemetry = telemetry;
    this.performanceMonitor = performanceMonitor;

    logger.info('Monitored security middleware initialized');
  }

  override async checkRequest(requestType: string, context: any, payload?: any) {
    return this.performanceMonitor.trackOperation(
      `security_check_${requestType}`,
      async () => {
        const result = await super.checkRequest(requestType, context, payload);

        // Record security metrics
        this.telemetry.recordMetric({
          name: 'security_check',
          value: 1,
          unit: 'count',
          tags: {
            requestType,
            allowed: result.allowed.toString(),
            statusCode: result.statusCode?.toString() || 'none',
          },
        });

        if (!result.allowed) {
          this.telemetry.recordMetric({
            name: 'security_blocked',
            value: 1,
            unit: 'count',
            tags: {
              requestType,
              reason: result.error?.code || 'unknown',
            },
          });
        }

        return result;
      },
      {
        requestType,
        hasPayload: !!payload,
        contextKeys: Object.keys(context).length,
      }
    );
  }

  override async checkAuth(context: any, authContext?: any, requiredPermissions?: any) {
    return this.performanceMonitor.trackOperation(
      'security_auth_check',
      async () => {
        const result = await super.checkAuth(context, authContext, requiredPermissions);

        // Record auth metrics
        this.telemetry.recordMetric({
          name: 'auth_check',
          value: 1,
          unit: 'count',
          tags: {
            allowed: result.allowed.toString(),
            hasAuth: (!!authContext).toString(),
            hasPermissions: (!!requiredPermissions).toString(),
          },
        });

        return result;
      },
      {
        hasAuthContext: !!authContext,
        requiresPermissions: !!requiredPermissions,
      }
    );
  }
}

/**
 * Enhanced secure router with integrated monitoring
 */
export class MonitoredSecureRouter extends SimpleSecureRouter {
  private telemetry: TelemetrySystem;
  private performanceMonitor: PerformanceMonitor;

  constructor(config: any, telemetry: TelemetrySystem, performanceMonitor: PerformanceMonitor) {
    super(config);
    this.telemetry = telemetry;
    this.performanceMonitor = performanceMonitor;

    // Replace security middleware with monitored version
    const env = require('../config/environment.js').setupEnvironment();
    (this as any).securityMiddleware = new MonitoredSecurityMiddleware(
      env,
      telemetry,
      performanceMonitor,
      config.security
    );

    logger.info('Monitored secure router initialized');
  }

  override async store(content: string, metadata: any, context?: any) {
    return this.performanceMonitor.trackOperation(
      'memory_store',
      async () => {
        const result = await super.store(content, metadata, context);

        // Record storage metrics
        this.telemetry.recordMetric({
          name: 'memory_operation',
          value: 1,
          unit: 'count',
          tags: {
            operation: 'store',
            contentSize: content.length.toString(),
            hasTenant: (!!context?.tenantId).toString(),
          },
        });

        this.telemetry.recordMetric({
          name: 'memory_content_size',
          value: content.length,
          unit: 'bytes',
          tags: { operation: 'store' },
        });

        return result;
      },
      {
        contentLength: content.length,
        metadataKeys: Object.keys(metadata).length,
        tenantId: context?.tenantId,
      }
    );
  }

  override async search(query: any, context?: any) {
    return this.performanceMonitor.trackOperation(
      'memory_search',
      async () => {
        const results = await super.search(query, context);

        // Record search metrics
        this.telemetry.recordMetric({
          name: 'memory_operation',
          value: 1,
          unit: 'count',
          tags: {
            operation: 'search',
            resultCount: results.length.toString(),
            queryLength: query.query?.length?.toString() || '0',
            hasFilters: (!!query.filters).toString(),
          },
        });

        this.telemetry.recordMetric({
          name: 'search_results',
          value: results.length,
          unit: 'count',
          tags: {
            hasFilters: (!!query.filters).toString(),
            hasTenant: (!!context?.tenantId).toString(),
          },
        });

        return results;
      },
      {
        queryText: query.query,
        hasFilters: !!query.filters,
        limit: query.limit,
        tenantId: context?.tenantId,
      }
    );
  }

  override async retrieve(id: string) {
    return this.performanceMonitor.trackOperation(
      'memory_retrieve',
      async () => {
        const result = await super.retrieve(id);

        this.telemetry.recordMetric({
          name: 'memory_operation',
          value: 1,
          unit: 'count',
          tags: {
            operation: 'retrieve',
            found: (!!result).toString(),
          },
        });

        return result;
      },
      { itemId: id }
    );
  }

  override async update(id: string, updates: any) {
    return this.performanceMonitor.trackOperation(
      'memory_update',
      async () => {
        const result = await super.update(id, updates);

        this.telemetry.recordMetric({
          name: 'memory_operation',
          value: 1,
          unit: 'count',
          tags: {
            operation: 'update',
            found: (!!result).toString(),
            hasContent: (!!updates.content).toString(),
            hasMetadata: (!!updates.metadata).toString(),
          },
        });

        return result;
      },
      {
        itemId: id,
        updateKeys: Object.keys(updates).length,
      }
    );
  }

  override async delete(id: string) {
    return this.performanceMonitor.trackOperation(
      'memory_delete',
      async () => {
        const result = await super.delete(id);

        this.telemetry.recordMetric({
          name: 'memory_operation',
          value: 1,
          unit: 'count',
          tags: {
            operation: 'delete',
            success: result.toString(),
          },
        });

        return result;
      },
      { itemId: id }
    );
  }
}

/**
 * Monitoring service that coordinates all monitoring components
 */
export class MonitoringService {
  private telemetry: TelemetrySystem;
  private performanceMonitor: PerformanceMonitor;
  private config: MonitoringConfig;
  private healthCheckInterval?: ReturnType<typeof setTimeout>;

  constructor(env: Environment, config?: Partial<MonitoringConfig>) {
    this.config = {
      telemetry: {
        enabled: env.telemetryEnabled ?? env.nodeEnv !== 'test',
        metricsRetentionMs: 24 * 60 * 60 * 1000,
        exportMetrics: env.nodeEnv === 'production',
      },
      performance: {
        enabled: env.performanceMonitoringEnabled ?? env.nodeEnv !== 'test',
        slowOperationMs: 5000,
        alerting: env.nodeEnv === 'production',
      },
      healthChecks: {
        enabled: true,
        intervalMs: 30 * 1000,
      },
      ...config,
    };

    // Initialize monitoring components
    this.telemetry = new TelemetrySystem(env, this.config.telemetry);
    this.performanceMonitor = new PerformanceMonitor(this.telemetry, {
      slowOperationMs: this.config.performance.slowOperationMs,
    });

    // Setup alert handling
    if (this.config.performance.alerting) {
      this.setupAlertHandling();
    }

    // Start health checks
    if (this.config.healthChecks.enabled) {
      this.startHealthChecks();
    }

    logger.info('Monitoring service initialized', {
      config: this.config,
    });
  }

  /**
   * Create a monitored secure router
   */
  createMonitoredRouter(routerConfig?: any): MonitoredSecureRouter {
    return new MonitoredSecureRouter(routerConfig, this.telemetry, this.performanceMonitor);
  }

  /**
   * Get telemetry system
   */
  getTelemetry(): TelemetrySystem {
    return this.telemetry;
  }

  /**
   * Get performance monitor
   */
  getPerformanceMonitor(): PerformanceMonitor {
    return this.performanceMonitor;
  }

  /**
   * Get health status
   */
  async getHealthStatus() {
    return this.telemetry.runHealthChecks();
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      telemetry: this.telemetry.getPerformanceMetrics(),
      monitor: this.performanceMonitor.getStats(),
    };
  }

  /**
   * Export metrics in various formats
   */
  exportMetrics(format: 'prometheus' | 'json' = 'json') {
    if (format === 'prometheus') {
      return this.telemetry.exportPrometheusMetrics();
    } else {
      return {
        metrics: this.telemetry.getMetricNames().map(name => ({
          name,
          data: this.telemetry.getMetrics(name),
        })),
        performance: this.telemetry.getPerformanceMetrics(),
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Setup alert handling
   */
  private setupAlertHandling(): void {
    this.performanceMonitor.onAlert(alert => {
      logger.warn('Performance alert received', {
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
      });

      // In a real system, you might send alerts to external systems
      // like Slack, PagerDuty, email, etc.
    });
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.telemetry.runHealthChecks();

        // Record health status as metric
        this.telemetry.recordMetric({
          name: 'health_check',
          value: health.status === 'healthy' ? 1 : 0,
          unit: 'count',
          tags: { status: health.status },
        });

        if (health.status !== 'healthy') {
          logger.warn('Health check failed', { health });
        }
      } catch (error) {
        logger.error('Health check error', { error });
      }
    }, this.config.healthChecks.intervalMs);
  }

  /**
   * Shutdown monitoring service
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.performanceMonitor.shutdown();
    await this.telemetry.shutdown();

    logger.info('Monitoring service shutdown complete');
  }
}

/**
 * Create monitoring service from environment
 */
export function createMonitoringService(
  env: Environment,
  config?: Partial<MonitoringConfig>
): MonitoringService {
  return new MonitoringService(env, config);
}
