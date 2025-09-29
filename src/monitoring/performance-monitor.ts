/**
 * Performance Monitoring Middleware
 * Tracks and analyzes system performance in real-time
 */

import { createLogger } from '../utils/logger.js';
import { TelemetrySystem } from './telemetry.js';

const logger = createLogger('performance-monitor');

export interface PerformanceContext {
  operationId: string;
  operationType: string;
  startTime: number;
  metadata?: Record<string, any> | undefined;
}

export interface PerformanceAlert {
  type: 'slow_operation' | 'high_memory' | 'error_spike' | 'resource_exhaustion';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  context: any;
  timestamp: Date;
}

export interface PerformanceThresholds {
  slowOperationMs: number;
  highMemoryMB: number;
  errorRateThreshold: number;
  alertCooldownMs: number;
}

/**
 * Advanced performance monitoring with real-time alerting
 */
export class PerformanceMonitor {
  private activeOperations = new Map<string, PerformanceContext>();
  private telemetry: TelemetrySystem;
  private thresholds: PerformanceThresholds;
  private lastAlerts = new Map<string, Date>();
  private alertHandlers: Array<(_alert: PerformanceAlert) => void> = [];

  constructor(telemetry: TelemetrySystem, thresholds?: Partial<PerformanceThresholds>) {
    this.telemetry = telemetry;
    this.thresholds = {
      slowOperationMs: 5000,
      highMemoryMB: 512,
      errorRateThreshold: 5.0,
      alertCooldownMs: 5 * 60 * 1000, // 5 minutes
      ...thresholds,
    };

    // Start periodic performance checks
    this.startPeriodicChecks();

    logger.info('Performance monitor initialized', {
      thresholds: this.thresholds,
    });
  }

  /**
   * Start tracking an operation
   */
  startOperation(operationType: string, metadata?: Record<string, any>): PerformanceContext {
    const operationId = `${operationType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const context: PerformanceContext = {
      operationId,
      operationType,
      startTime: Date.now(),
      metadata,
    };

    this.activeOperations.set(operationId, context);

    logger.debug('Operation started', {
      operationId,
      operationType,
      metadata,
    });

    return context;
  }

  /**
   * End tracking an operation
   */
  endOperation(context: PerformanceContext, success: boolean = true, result?: any): void {
    const duration = Date.now() - context.startTime;

    // Remove from active operations
    this.activeOperations.delete(context.operationId);

    // Record telemetry
    this.telemetry.recordRequest(context.operationType, duration, success, {
      ...context.metadata,
      result: result ? 'present' : 'empty',
    });

    // Check for slow operations
    if (duration > this.thresholds.slowOperationMs) {
      this.raiseAlert({
        type: 'slow_operation',
        severity: duration > this.thresholds.slowOperationMs * 2 ? 'high' : 'medium',
        message: `Slow operation detected: ${context.operationType} took ${duration}ms`,
        context: {
          operationType: context.operationType,
          duration,
          metadata: context.metadata,
        },
        timestamp: new Date(),
      });
    }

    logger.debug('Operation completed', {
      operationId: context.operationId,
      operationType: context.operationType,
      duration,
      success,
      metadata: context.metadata,
    });
  }

  /**
   * Track an operation with automatic timing
   */
  async trackOperation<T>(
    operationType: string,
    operation: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<T> {
    const context = this.startOperation(operationType, metadata);

    try {
      const result = await operation();
      this.endOperation(context, true, result);
      return result;
    } catch (error) {
      this.endOperation(context, false);
      this.telemetry.recordError(error instanceof Error ? error : new Error(String(error)), {
        operationType,
        metadata,
      });
      throw error;
    }
  }

  /**
   * Track a synchronous operation
   */
  trackSyncOperation<T>(
    operationType: string,
    operation: () => T,
    metadata?: Record<string, any>
  ): T {
    const context = this.startOperation(operationType, metadata);

    try {
      const result = operation();
      this.endOperation(context, true, result);
      return result;
    } catch (error) {
      this.endOperation(context, false);
      this.telemetry.recordError(error instanceof Error ? error : new Error(String(error)), {
        operationType,
        metadata,
      });
      throw error;
    }
  }

  /**
   * Get current performance statistics
   */
  getStats(): {
    activeOperations: number;
    operationTypes: Record<string, number>;
    performanceMetrics: any;
    recentAlerts: PerformanceAlert[];
  } {
    const operationTypes: Record<string, number> = {};

    for (const context of this.activeOperations.values()) {
      operationTypes[context.operationType] = (operationTypes[context.operationType] || 0) + 1;
    }

    return {
      activeOperations: this.activeOperations.size,
      operationTypes,
      performanceMetrics: this.telemetry.getPerformanceMetrics(),
      recentAlerts: [], // TODO: implement recent alerts storage
    };
  }

  /**
   * Register an alert handler
   */
  onAlert(handler: (_alert: PerformanceAlert) => void): void {
    this.alertHandlers.push(handler);
  }

  /**
   * Raise a performance alert
   */
  private raiseAlert(alert: PerformanceAlert): void {
    // Check cooldown period
    const alertKey = `${alert.type}_${alert.severity}`;
    const lastAlert = this.lastAlerts.get(alertKey);

    if (lastAlert && Date.now() - lastAlert.getTime() < this.thresholds.alertCooldownMs) {
      return; // Still in cooldown period
    }

    this.lastAlerts.set(alertKey, new Date());

    // Log the alert
    logger.warn('Performance alert', {
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
      context: alert.context,
    });

    // Record as metric
    this.telemetry.recordMetric({
      name: 'performance_alert',
      value: 1,
      unit: 'count',
      tags: {
        type: alert.type,
        severity: alert.severity,
      },
    });

    // Notify handlers
    for (const handler of this.alertHandlers) {
      try {
        handler(alert);
      } catch (error) {
        logger.error('Alert handler failed', { error });
      }
    }
  }

  /**
   * Periodic performance checks
   */
  private startPeriodicChecks(): void {
    setInterval(() => {
      this.checkSystemPerformance();
    }, 30 * 1000); // Check every 30 seconds
  }

  /**
   * Check system-level performance metrics
   */
  private checkSystemPerformance(): void {
    // Check memory usage
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;

    if (heapUsedMB > this.thresholds.highMemoryMB) {
      this.raiseAlert({
        type: 'high_memory',
        severity: heapUsedMB > this.thresholds.highMemoryMB * 1.5 ? 'critical' : 'high',
        message: `High memory usage: ${Math.round(heapUsedMB)}MB`,
        context: {
          heapUsed: heapUsedMB,
          heapTotal: memoryUsage.heapTotal / 1024 / 1024,
          threshold: this.thresholds.highMemoryMB,
        },
        timestamp: new Date(),
      });
    }

    // Check error rate
    const metrics = this.telemetry.getPerformanceMetrics();
    if (metrics.errorRate > this.thresholds.errorRateThreshold) {
      this.raiseAlert({
        type: 'error_spike',
        severity: metrics.errorRate > this.thresholds.errorRateThreshold * 2 ? 'critical' : 'high',
        message: `High error rate: ${metrics.errorRate}%`,
        context: {
          errorRate: metrics.errorRate,
          threshold: this.thresholds.errorRateThreshold,
          requestCount: metrics.requestCount,
        },
        timestamp: new Date(),
      });
    }

    // Check for long-running operations
    const now = Date.now();
    for (const context of this.activeOperations.values()) {
      const duration = now - context.startTime;

      if (duration > this.thresholds.slowOperationMs * 3) {
        this.raiseAlert({
          type: 'slow_operation',
          severity: 'critical',
          message: `Long-running operation: ${context.operationType} running for ${duration}ms`,
          context: {
            operationType: context.operationType,
            duration,
            operationId: context.operationId,
            metadata: context.metadata,
          },
          timestamp: new Date(),
        });
      }
    }

    // Record system metrics
    this.telemetry.recordMetric({
      name: 'system_memory_heap_used',
      value: heapUsedMB,
      unit: 'bytes',
    });

    this.telemetry.recordMetric({
      name: 'active_operations',
      value: this.activeOperations.size,
      unit: 'count',
    });
  }

  /**
   * Create a performance-aware wrapper for async functions
   */
  createWrapper<TArgs extends any[], TReturn>(
    operationType: string,
    fn: (..._args: TArgs) => Promise<TReturn>
  ): (..._args: TArgs) => Promise<TReturn> {
    return async (..._args: TArgs): Promise<TReturn> => {
      return this.trackOperation(operationType, () => fn(..._args), { argCount: _args.length });
    };
  }

  /**
   * Create a performance-aware wrapper for sync functions
   */
  createSyncWrapper<TArgs extends any[], TReturn>(
    operationType: string,
    fn: (..._args: TArgs) => TReturn
  ): (..._args: TArgs) => TReturn {
    return (..._args: TArgs): TReturn => {
      return this.trackSyncOperation(operationType, () => fn(..._args), { argCount: _args.length });
    };
  }

  /**
   * Shutdown the performance monitor
   */
  shutdown(): void {
    // Complete any active operations with timeout
    for (const context of this.activeOperations.values()) {
      this.endOperation(context, false);
      logger.warn('Operation terminated during shutdown', {
        operationType: context.operationType,
        operationId: context.operationId,
      });
    }

    this.activeOperations.clear();
    logger.info('Performance monitor shutdown');
  }
}

/**
 * Decorator for automatic performance tracking
 */
export function PerformanceTracked(operationType?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const opType = operationType || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      // Note: This assumes a global performance monitor instance
      // In real usage, you'd inject this dependency properly
      const monitor = (this as any).performanceMonitor as PerformanceMonitor;

      if (monitor) {
        return monitor.trackOperation(opType, () => originalMethod.apply(this, args));
      } else {
        return originalMethod.apply(this, args);
      }
    };

    return descriptor;
  };
}
