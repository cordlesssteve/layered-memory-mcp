/**
 * Production-Ready System Integration
 * Combines all security, monitoring, and error recovery components
 */

import { setupEnvironment } from './config/environment.js';
import { createMonitoringService } from './monitoring/monitoring-integration.js';
import { createErrorRecoverySystem } from './error-handling/error-recovery.js';
import { createResilientRouter } from './error-handling/resilient-router.js';
import { createLogger } from './utils/logger.js';
import type { Environment } from './config/environment.js';

const logger = createLogger('production-system');

export interface ProductionSystemConfig {
  enableTelemetry: boolean;
  enableErrorRecovery: boolean;
  enableCircuitBreakers: boolean;
  enableRateLimiting: boolean;
  enableSecurityMiddleware: boolean;
  logLevel: 'silent' | 'error' | 'warn' | 'info' | 'debug';
}

export interface ProductionSystemStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    router: any;
    monitoring: any;
    errorRecovery: any;
    security: any;
  };
  metrics: {
    uptime: number;
    requestCount: number;
    errorRate: number;
    averageResponseTime: number;
  };
  timestamp: Date;
}

/**
 * Production-ready system that integrates all components
 */
export class ProductionReadySystem {
  private env: Environment;
  private config: ProductionSystemConfig;
  private monitoringService: any;
  private errorRecovery: any;
  private router: any;
  private startTime: Date;

  constructor(config?: Partial<ProductionSystemConfig>) {
    this.startTime = new Date();
    this.env = setupEnvironment();

    this.config = {
      enableTelemetry: this.env.telemetryEnabled,
      enableErrorRecovery: true,
      enableCircuitBreakers: true,
      enableRateLimiting: true,
      enableSecurityMiddleware: true,
      logLevel: this.env.logLevel,
      ...config,
    };

    logger.info('Production system initializing', {
      nodeEnv: this.env.nodeEnv,
      config: this.config,
    });

    this.initializeSystem();
  }

  /**
   * Initialize all system components
   */
  private initializeSystem(): void {
    try {
      // 1. Initialize monitoring and telemetry
      if (this.config.enableTelemetry) {
        this.monitoringService = createMonitoringService(this.env, {
          telemetry: {
            enabled: true,
            metricsRetentionMs: this.env.metricsRetentionMs,
            exportMetrics: this.env.metricsExportEnabled,
          },
          performance: {
            enabled: this.env.performanceMonitoringEnabled,
            slowOperationMs: this.env.slowOperationThresholdMs,
            alerting: this.env.nodeEnv === 'production',
          },
          healthChecks: {
            enabled: true,
            intervalMs: this.env.healthCheckIntervalMs,
          },
        });

        logger.info('Monitoring service initialized');
      }

      // 2. Initialize error recovery system
      if (this.config.enableErrorRecovery) {
        const telemetry = this.monitoringService?.getTelemetry();
        this.errorRecovery = createErrorRecoverySystem(telemetry);

        logger.info('Error recovery system initialized');
      }

      // 3. Initialize resilient router
      this.router = createResilientRouter(
        {
          // Memory router configuration
          layers: {
            session: { maxItems: 1000, ttl: 3600000 }, // 1 hour
            project: { maxItems: 5000, ttl: 86400000 }, // 24 hours
            global: { maxItems: 10000, ttl: 604800000 }, // 7 days
            temporal: { maxItems: 50000, ttl: undefined }, // Permanent
          },
          security: {
            rateLimiting: {
              enabled: this.config.enableRateLimiting,
              maxRequests: this.env.rateLimitMaxRequests,
              windowMs: this.env.rateLimitWindowMs,
            },
            validation: {
              enabled: this.config.enableSecurityMiddleware,
              sanitizeContent: true,
            },
          },
        },
        this.errorRecovery,
        this.monitoringService?.getTelemetry(),
        this.monitoringService?.getPerformanceMonitor(),
        {
          enableErrorRecovery: this.config.enableErrorRecovery,
          enableGracefulDegradation: true,
          enableDetailedErrorLogging: this.env.nodeEnv !== 'production',
        }
      );

      logger.info('Resilient router initialized');

      // 4. Setup system health monitoring
      this.setupSystemMonitoring();

      logger.info('Production system initialization complete', {
        uptime: this.getUptime(),
        components: {
          monitoring: !!this.monitoringService,
          errorRecovery: !!this.errorRecovery,
          router: !!this.router,
        },
      });
    } catch (error) {
      logger.error('Failed to initialize production system', {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Get the main router instance for handling memory operations
   */
  getRouter(): any {
    return this.router;
  }

  /**
   * Get monitoring service for metrics and health checks
   */
  getMonitoringService(): any {
    return this.monitoringService;
  }

  /**
   * Get error recovery system for manual operations
   */
  getErrorRecovery(): any {
    return this.errorRecovery;
  }

  /**
   * Get comprehensive system status
   */
  async getSystemStatus(): Promise<ProductionSystemStatus> {
    try {
      const routerHealth = this.router
        ? await this.router.getHealthStatus()
        : { status: 'unhealthy' };
      const monitoringHealth = this.monitoringService
        ? await this.monitoringService.getHealthStatus()
        : { status: 'unhealthy' };
      const performanceMetrics = this.monitoringService
        ? this.monitoringService.getPerformanceMetrics()
        : {};

      // Determine overall system status
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

      if (routerHealth.status === 'unhealthy' || monitoringHealth.status === 'unhealthy') {
        status = 'unhealthy';
      } else if (routerHealth.status === 'degraded' || monitoringHealth.status === 'degraded') {
        status = 'degraded';
      }

      return {
        status,
        components: {
          router: routerHealth,
          monitoring: monitoringHealth,
          errorRecovery: this.errorRecovery?.getStats() || null,
          security: {
            rateLimiting: this.config.enableRateLimiting,
            securityMiddleware: this.config.enableSecurityMiddleware,
            errorRecovery: this.config.enableErrorRecovery,
          },
        },
        metrics: {
          uptime: this.getUptime(),
          requestCount: performanceMetrics.telemetry?.requestCount || 0,
          errorRate: performanceMetrics.telemetry?.errorRate || 0,
          averageResponseTime: performanceMetrics.telemetry?.averageResponseTime || 0,
        },
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error('Failed to get system status', { error });
      return {
        status: 'unhealthy',
        components: {
          router: { error: 'Status check failed' },
          monitoring: { error: 'Status check failed' },
          errorRecovery: { error: 'Status check failed' },
          security: { error: 'Status check failed' },
        },
        metrics: {
          uptime: this.getUptime(),
          requestCount: 0,
          errorRate: 100,
          averageResponseTime: 0,
        },
        timestamp: new Date(),
      };
    }
  }

  /**
   * Perform emergency recovery operations
   */
  async emergencyRecovery(): Promise<void> {
    logger.warn('Emergency recovery initiated');

    try {
      // Reset all circuit breakers
      if (this.router && this.config.enableErrorRecovery) {
        this.router.resetCircuitBreakers();
        logger.info('Circuit breakers reset');
      }

      // Clear monitoring data if needed
      if (this.monitoringService) {
        // Note: In a real implementation, you might want to preserve some monitoring data
        logger.info('Monitoring data preserved (no reset performed)');
      }

      logger.info('Emergency recovery completed');
    } catch (error) {
      logger.error('Emergency recovery failed', {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Graceful shutdown of the entire system
   */
  async shutdown(): Promise<void> {
    logger.info('Production system shutdown initiated');

    try {
      // Shutdown router
      if (this.router) {
        await this.router.close();
        logger.info('Router shutdown complete');
      }

      // Shutdown monitoring
      if (this.monitoringService) {
        await this.monitoringService.shutdown();
        logger.info('Monitoring service shutdown complete');
      }

      logger.info('Production system shutdown complete', {
        uptime: this.getUptime(),
      });
    } catch (error) {
      logger.error('Shutdown error', {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Setup system-level monitoring
   */
  private setupSystemMonitoring(): void {
    if (!this.monitoringService) return;

    // Register system-level health checks
    const telemetry = this.monitoringService.getTelemetry();

    telemetry.registerHealthCheck('system_uptime', async () => {
      const uptime = this.getUptime();
      if (uptime < 60) {
        // Less than 1 minute
        return { status: 'warn', message: `System recently started: ${uptime}s uptime` };
      }
      return { status: 'pass', message: `System uptime: ${uptime}s` };
    });

    telemetry.registerHealthCheck('error_recovery', async () => {
      if (!this.errorRecovery) {
        return { status: 'fail', message: 'Error recovery system not initialized' };
      }

      const circuitBreakers = this.errorRecovery.getCircuitBreakerStatuses();
      const openCircuitBreakers = circuitBreakers.filter((cb: any) => cb.state === 'OPEN');

      if (openCircuitBreakers.length > 0) {
        return {
          status: 'fail',
          message: `${openCircuitBreakers.length} circuit breakers are open`,
        };
      }

      return { status: 'pass', message: 'All circuit breakers operational' };
    });

    logger.debug('System monitoring setup complete');
  }

  /**
   * Get system uptime in seconds
   */
  private getUptime(): number {
    return Math.floor((Date.now() - this.startTime.getTime()) / 1000);
  }
}

/**
 * Factory function to create and initialize a production-ready system
 */
export function createProductionSystem(
  config?: Partial<ProductionSystemConfig>
): ProductionReadySystem {
  return new ProductionReadySystem(config);
}

/**
 * Quick health check function for external monitoring
 */
export async function quickHealthCheck(): Promise<{
  status: string;
  uptime: number;
  timestamp: string;
}> {
  try {
    // This is a lightweight check that doesn't require full system initialization
    setupEnvironment();

    return {
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      uptime: 0,
      timestamp: new Date().toISOString(),
    };
  }
}
