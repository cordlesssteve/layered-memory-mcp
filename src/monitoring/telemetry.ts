/**
 * Comprehensive Telemetry and Observability System
 * Provides metrics collection, performance monitoring, and health checks
 */

import { createLogger } from '../utils/logger.js';
import type { Environment } from '../config/environment.js';

const logger = createLogger('telemetry');

export interface TelemetryMetric {
  name: string;
  value: number;
  unit: 'count' | 'duration_ms' | 'bytes' | 'percentage' | 'rate';
  tags?: Record<string, string>;
  timestamp: Date;
}

export interface PerformanceMetrics {
  requestCount: number;
  averageResponseTime: number;
  errorRate: number;
  memoryUsage: number;
  activeConnections: number;
  requestsPerSecond: number;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, {
    status: 'pass' | 'warn' | 'fail';
    message?: string;
    duration?: number;
    timestamp: Date;
  }>;
  version: string;
  uptime: number;
}

export interface TelemetryConfig {
  enabled: boolean;
  metricsRetentionMs: number;
  healthCheckIntervalMs: number;
  performanceMetricsEnabled: boolean;
  errorTrackingEnabled: boolean;
  exportMetrics?: boolean | undefined;
  exportEndpoint?: string | undefined;
}

/**
 * Centralized telemetry system for monitoring application performance
 */
export class TelemetrySystem {
  private metrics = new Map<string, TelemetryMetric[]>();
  private performanceData: {
    requests: Array<{ timestamp: Date; duration: number; success: boolean; endpoint: string }>;
    errors: Array<{ timestamp: Date; error: string; context?: any }>;
    startTime: Date;
  };
  private healthChecks = new Map<string, () => Promise<{ status: 'pass' | 'warn' | 'fail'; message?: string }>>();
  private config: TelemetryConfig;

  constructor(env: Environment, config?: Partial<TelemetryConfig>) {
    this.config = {
      enabled: env.nodeEnv !== 'test',
      metricsRetentionMs: 24 * 60 * 60 * 1000, // 24 hours
      healthCheckIntervalMs: 30 * 1000, // 30 seconds
      performanceMetricsEnabled: true,
      errorTrackingEnabled: true,
      exportMetrics: env.nodeEnv === 'production',
      exportEndpoint: process.env['METRICS_ENDPOINT'],
      ...config,
    };

    this.performanceData = {
      requests: [],
      errors: [],
      startTime: new Date(),
    };

    if (this.config.enabled) {
      this.startPeriodicCleanup();
      this.registerDefaultHealthChecks();

      logger.info('Telemetry system initialized', {
        enabled: this.config.enabled,
        metricsRetention: this.config.metricsRetentionMs,
        performanceTracking: this.config.performanceMetricsEnabled,
      });
    }
  }

  /**
   * Record a custom metric
   */
  recordMetric(metric: Omit<TelemetryMetric, 'timestamp'>): void {
    if (!this.config.enabled) return;

    const fullMetric: TelemetryMetric = {
      ...metric,
      timestamp: new Date(),
    };

    if (!this.metrics.has(metric.name)) {
      this.metrics.set(metric.name, []);
    }

    this.metrics.get(metric.name)!.push(fullMetric);

    logger.debug('Metric recorded', {
      name: metric.name,
      value: metric.value,
      unit: metric.unit,
      tags: metric.tags,
    });
  }

  /**
   * Track request performance
   */
  recordRequest(endpoint: string, duration: number, success: boolean, metadata?: any): void {
    if (!this.config.performanceMetricsEnabled) return;

    this.performanceData.requests.push({
      timestamp: new Date(),
      duration,
      success,
      endpoint,
    });

    // Record as metrics
    this.recordMetric({
      name: 'request_duration',
      value: duration,
      unit: 'duration_ms',
      tags: { endpoint, success: success.toString() },
    });

    this.recordMetric({
      name: 'request_count',
      value: 1,
      unit: 'count',
      tags: { endpoint, success: success.toString() },
    });

    if (metadata) {
      logger.debug('Request tracked', {
        endpoint,
        duration,
        success,
        metadata,
      });
    }
  }

  /**
   * Track errors and exceptions
   */
  recordError(error: string | Error, context?: any): void {
    if (!this.config.errorTrackingEnabled) return;

    const errorMessage = error instanceof Error ? error.message : error;

    this.performanceData.errors.push({
      timestamp: new Date(),
      error: errorMessage,
      context,
    });

    this.recordMetric({
      name: 'error_count',
      value: 1,
      unit: 'count',
      tags: { error_type: error instanceof Error ? error.constructor.name : 'string' },
    });

    logger.error('Error tracked', {
      error: errorMessage,
      context,
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const now = new Date();
    const last5Minutes = new Date(now.getTime() - 5 * 60 * 1000);
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000);

    const recentRequests = this.performanceData.requests.filter(r => r.timestamp > last5Minutes);
    const hourlyRequests = this.performanceData.requests.filter(r => r.timestamp > lastHour);
    const recentErrors = this.performanceData.errors.filter(e => e.timestamp > last5Minutes);

    const successfulRequests = recentRequests.filter(r => r.success);
    const averageResponseTime = successfulRequests.length > 0
      ? successfulRequests.reduce((sum, r) => sum + r.duration, 0) / successfulRequests.length
      : 0;

    const errorRate = recentRequests.length > 0
      ? (recentErrors.length / recentRequests.length) * 100
      : 0;

    const requestsPerSecond = hourlyRequests.length / 3600; // requests per second over last hour

    const memoryUsage = process.memoryUsage();

    return {
      requestCount: recentRequests.length,
      averageResponseTime: Math.round(averageResponseTime),
      errorRate: Math.round(errorRate * 100) / 100,
      memoryUsage: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
      activeConnections: 0, // TODO: implement connection tracking
      requestsPerSecond: Math.round(requestsPerSecond * 100) / 100,
    };
  }

  /**
   * Register a health check
   */
  registerHealthCheck(
    name: string,
    check: () => Promise<{ status: 'pass' | 'warn' | 'fail'; message?: string }>
  ): void {
    this.healthChecks.set(name, check);
    logger.debug('Health check registered', { name });
  }

  /**
   * Run all health checks
   */
  async runHealthChecks(): Promise<HealthCheckResult> {
    const checks: HealthCheckResult['checks'] = {};

    for (const [name, check] of this.healthChecks.entries()) {
      const startTime = Date.now();
      try {
        const result = await check();
        checks[name] = {
          ...result,
          duration: Date.now() - startTime,
          timestamp: new Date(),
        };
      } catch (error) {
        checks[name] = {
          status: 'fail',
          message: error instanceof Error ? error.message : 'Unknown error',
          duration: Date.now() - startTime,
          timestamp: new Date(),
        };
      }
    }

    // Determine overall status
    const statuses = Object.values(checks).map(c => c.status);
    let overallStatus: HealthCheckResult['status'] = 'healthy';

    if (statuses.includes('fail')) {
      overallStatus = 'unhealthy';
    } else if (statuses.includes('warn')) {
      overallStatus = 'degraded';
    }

    const uptime = Date.now() - this.performanceData.startTime.getTime();

    return {
      status: overallStatus,
      checks,
      version: process.env['npm_package_version'] || '1.0.0',
      uptime: Math.round(uptime / 1000), // seconds
    };
  }

  /**
   * Get metrics by name
   */
  getMetrics(name: string, since?: Date): TelemetryMetric[] {
    const metrics = this.metrics.get(name) || [];

    if (since) {
      return metrics.filter(m => m.timestamp >= since);
    }

    return metrics;
  }

  /**
   * Get all metric names
   */
  getMetricNames(): string[] {
    return Array.from(this.metrics.keys());
  }

  /**
   * Export metrics in Prometheus format (basic implementation)
   */
  exportPrometheusMetrics(): string {
    const lines: string[] = [];

    for (const [name, metrics] of this.metrics.entries()) {
      if (metrics.length === 0) continue;

      const latest = metrics[metrics.length - 1];
      if (!latest) continue;

      const prometheusName = name.replace(/[^a-zA-Z0-9_]/g, '_');

      // Add help and type comments
      lines.push(`# HELP ${prometheusName} ${name} metric`);
      lines.push(`# TYPE ${prometheusName} gauge`);

      // Add metric with labels
      const labels = latest.tags
        ? Object.entries(latest.tags).map(([k, v]) => `${k}="${v}"`).join(',')
        : '';

      lines.push(`${prometheusName}${labels ? `{${labels}}` : ''} ${latest.value}`);
    }

    return lines.join('\n');
  }

  /**
   * Clean up old metrics
   */
  private cleanup(): void {
    const cutoff = new Date(Date.now() - this.config.metricsRetentionMs);

    for (const [name, metrics] of this.metrics.entries()) {
      const filtered = metrics.filter(m => m.timestamp > cutoff);
      this.metrics.set(name, filtered);
    }

    // Clean up performance data
    this.performanceData.requests = this.performanceData.requests.filter(r => r.timestamp > cutoff);
    this.performanceData.errors = this.performanceData.errors.filter(e => e.timestamp > cutoff);

    logger.debug('Metrics cleanup completed', {
      cutoff: cutoff.toISOString(),
      retainedMetrics: Array.from(this.metrics.values()).reduce((sum, arr) => sum + arr.length, 0),
    });
  }

  /**
   * Start periodic cleanup
   */
  private startPeriodicCleanup(): void {
    setInterval(() => {
      this.cleanup();
    }, this.config.metricsRetentionMs / 24); // Clean up every hour if retention is 24 hours
  }

  /**
   * Register default system health checks
   */
  private registerDefaultHealthChecks(): void {
    // Memory usage check
    this.registerHealthCheck('memory', async () => {
      const usage = process.memoryUsage();
      const heapUsedMB = usage.heapUsed / 1024 / 1024;
      const heapTotalMB = usage.heapTotal / 1024 / 1024;
      const usagePercentage = (heapUsedMB / heapTotalMB) * 100;

      if (usagePercentage > 90) {
        return { status: 'fail', message: `High memory usage: ${Math.round(usagePercentage)}%` };
      } else if (usagePercentage > 75) {
        return { status: 'warn', message: `Elevated memory usage: ${Math.round(usagePercentage)}%` };
      }

      return { status: 'pass', message: `Memory usage: ${Math.round(usagePercentage)}%` };
    });

    // Error rate check
    this.registerHealthCheck('error_rate', async () => {
      const metrics = this.getPerformanceMetrics();

      if (metrics.errorRate > 10) {
        return { status: 'fail', message: `High error rate: ${metrics.errorRate}%` };
      } else if (metrics.errorRate > 5) {
        return { status: 'warn', message: `Elevated error rate: ${metrics.errorRate}%` };
      }

      return { status: 'pass', message: `Error rate: ${metrics.errorRate}%` };
    });

    // Response time check
    this.registerHealthCheck('response_time', async () => {
      const metrics = this.getPerformanceMetrics();

      if (metrics.averageResponseTime > 5000) {
        return { status: 'fail', message: `Slow response time: ${metrics.averageResponseTime}ms` };
      } else if (metrics.averageResponseTime > 2000) {
        return { status: 'warn', message: `Elevated response time: ${metrics.averageResponseTime}ms` };
      }

      return { status: 'pass', message: `Response time: ${metrics.averageResponseTime}ms` };
    });
  }

  /**
   * Shutdown telemetry system
   */
  async shutdown(): Promise<void> {
    if (this.config.exportMetrics && this.config.exportEndpoint) {
      try {
        // Export final metrics before shutdown
        this.exportPrometheusMetrics();
        logger.info('Final metrics exported', { metricsCount: this.getMetricNames().length });
      } catch (error) {
        logger.error('Failed to export final metrics', { error });
      }
    }

    logger.info('Telemetry system shutdown');
  }
}

/**
 * Create telemetry system from environment
 */
export function createTelemetrySystem(env: Environment, config?: Partial<TelemetryConfig>): TelemetrySystem {
  return new TelemetrySystem(env, config);
}