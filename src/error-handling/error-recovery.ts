/**
 * Comprehensive Error Recovery System
 * Provides graceful degradation, retry mechanisms, and circuit breaker patterns
 */

import { createLogger } from '../utils/logger.js';
import { TelemetrySystem } from '../monitoring/telemetry.js';

const logger = createLogger('error-recovery');

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: Array<string | Error | ((_error: any) => boolean)>;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  monitoringWindowMs: number;
  minimumThroughput: number;
}

export interface ErrorRecoveryConfig {
  retry: RetryConfig;
  circuitBreaker: CircuitBreakerConfig;
  gracefulDegradation: {
    enabled: boolean;
    fallbackStrategies: Map<string, () => Promise<any>>;
  };
  telemetryEnabled: boolean;
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface ErrorContext {
  operation: string;
  attemptNumber: number;
  error: Error;
  startTime: Date;
  metadata?: Record<string, any>;
}

/**
 * Circuit Breaker implementation for fault tolerance
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: Date;
  private requestCount = 0;
  private config: CircuitBreakerConfig;
  private telemetry?: TelemetrySystem | undefined;

  constructor(
    private _name: string,
    config: CircuitBreakerConfig,
    telemetry?: TelemetrySystem
  ) {
    this.config = config;
    this.telemetry = telemetry;

    logger.debug('Circuit breaker initialized', {
      name: this._name,
      config: this.config,
    });
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN';
        logger.info('Circuit breaker transitioning to HALF_OPEN', { name: this._name });
      } else {
        const error = new Error(`Circuit breaker is OPEN for ${this._name}`);
        (error as any).circuitBreakerOpen = true;
        this.recordMetric('circuit_breaker_open', 1);
        throw error;
      }
    }

    this.requestCount++;

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (_error) {
      this.onFailure();
      throw _error;
    }
  }

  /**
   * Get current circuit breaker status
   */
  getStatus() {
    return {
      name: this._name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      requestCount: this.requestCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Reset circuit breaker state
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    delete this.lastFailureTime;

    logger.info('Circuit breaker reset', { name: this._name });
    this.recordMetric('circuit_breaker_reset', 1);
  }

  private onSuccess(): void {
    this.successCount++;
    this.recordMetric('circuit_breaker_success', 1);

    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED';
      this.failureCount = 0;
      logger.info('Circuit breaker closed after successful recovery', { name: this._name });
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();
    this.recordMetric('circuit_breaker_failure', 1);

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      logger.warn('Circuit breaker opened during half-open test', { name: this._name });
    } else if (this.shouldOpen()) {
      this.state = 'OPEN';
      logger.warn('Circuit breaker opened due to failure threshold', {
        name: this._name,
        failureCount: this.failureCount,
        threshold: this.config.failureThreshold,
      });
    }
  }

  private shouldOpen(): boolean {
    return (
      this.failureCount >= this.config.failureThreshold &&
      this.requestCount >= this.config.minimumThroughput
    );
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;

    const timeSinceLastFailure = Date.now() - this.lastFailureTime.getTime();
    return timeSinceLastFailure >= this.config.resetTimeoutMs;
  }

  private recordMetric(name: string, value: number): void {
    if (this.telemetry) {
      this.telemetry.recordMetric({
        name,
        value,
        unit: 'count',
        tags: {
          circuit_breaker: this._name,
          state: this.state,
        },
      });
    }
  }
}

/**
 * Retry mechanism with exponential backoff
 */
export class RetryHandler {
  private config: RetryConfig;
  private telemetry?: TelemetrySystem | undefined;

  constructor(config: RetryConfig, telemetry?: TelemetrySystem) {
    this.config = config;
    this.telemetry = telemetry;
  }

  /**
   * Execute operation with retry logic
   */
  async execute<T>(
    operation: () => Promise<T>,
    context: { operationName: string; metadata?: Record<string, any> }
  ): Promise<T> {
    let lastError: Error;
    const startTime = new Date();

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        const result = await operation();

        if (attempt > 1) {
          this.recordMetric('retry_success', 1, {
            operation: context.operationName,
            attempts: attempt.toString(),
          });

          logger.info('Operation succeeded after retry', {
            operation: context.operationName,
            attempt,
            totalTime: Date.now() - startTime.getTime(),
          });
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (!this.isRetryable(lastError) || attempt === this.config.maxAttempts) {
          this.recordMetric('retry_exhausted', 1, {
            operation: context.operationName,
            attempts: attempt.toString(),
            finalError: lastError.message,
          });

          logger.error('Operation failed after retries', {
            operation: context.operationName,
            attempts: attempt,
            totalTime: Date.now() - startTime.getTime(),
            error: lastError.message,
          });

          throw lastError;
        }

        const delay = this.calculateDelay(attempt);

        this.recordMetric('retry_attempt', 1, {
          operation: context.operationName,
          attempt: attempt.toString(),
          error: lastError.message,
        });

        logger.warn('Operation failed, retrying', {
          operation: context.operationName,
          attempt,
          maxAttempts: this.config.maxAttempts,
          delay,
          error: lastError.message,
        });

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  private isRetryable(error: Error): boolean {
    return this.config.retryableErrors.some(retryableError => {
      if (typeof retryableError === 'string') {
        return error.message.includes(retryableError);
      } else if (retryableError instanceof Error) {
        return error.constructor === retryableError.constructor;
      } else if (typeof retryableError === 'function') {
        return retryableError(error);
      }
      return false;
    });
  }

  private calculateDelay(attempt: number): number {
    const delay = this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1);
    return Math.min(delay, this.config.maxDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private recordMetric(
    name: string,
    value: number,
    tags?: Record<string, string> | undefined
  ): void {
    if (this.telemetry) {
      this.telemetry.recordMetric({
        name,
        value,
        unit: 'count',
        tags: tags || {},
      });
    }
  }
}

/**
 * Comprehensive error recovery system
 */
export class ErrorRecoverySystem {
  private retryHandler: RetryHandler;
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private config: ErrorRecoveryConfig;
  private telemetry?: TelemetrySystem | undefined;

  constructor(config: ErrorRecoveryConfig, telemetry?: TelemetrySystem) {
    this.config = config;
    this.telemetry = telemetry;
    this.retryHandler = new RetryHandler(config.retry, telemetry);

    logger.info('Error recovery system initialized', {
      retryConfig: config.retry,
      circuitBreakerConfig: config.circuitBreaker,
      gracefulDegradation: config.gracefulDegradation.enabled,
    });
  }

  /**
   * Execute operation with full error recovery protection
   */
  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    options: {
      operationName: string;
      useCircuitBreaker?: boolean;
      useRetry?: boolean;
      useFallback?: boolean;
      metadata?: Record<string, any>;
    }
  ): Promise<T> {
    const {
      operationName,
      useCircuitBreaker = true,
      useRetry = true,
      useFallback = true,
    } = options;

    try {
      if (useCircuitBreaker) {
        const circuitBreaker = this.getOrCreateCircuitBreaker(operationName);

        if (useRetry) {
          return await circuitBreaker.execute(async () => {
            return await this.retryHandler.execute(operation, {
              operationName,
              metadata: options.metadata || {},
            });
          });
        } else {
          return await circuitBreaker.execute(operation);
        }
      } else if (useRetry) {
        return await this.retryHandler.execute(operation, {
          operationName,
          metadata: options.metadata || {},
        });
      } else {
        return await operation();
      }
    } catch (error) {
      if (useFallback && this.config.gracefulDegradation.enabled) {
        const fallback = this.config.gracefulDegradation.fallbackStrategies.get(operationName);

        if (fallback) {
          logger.warn('Executing fallback strategy', {
            operation: operationName,
            originalError: error instanceof Error ? error.message : error,
          });

          this.recordMetric('fallback_executed', 1, {
            operation: operationName,
          });

          try {
            return await fallback();
          } catch (fallbackError) {
            logger.error('Fallback strategy failed', {
              operation: operationName,
              originalError: error instanceof Error ? error.message : error,
              fallbackError: fallbackError instanceof Error ? fallbackError.message : fallbackError,
            });

            this.recordMetric('fallback_failed', 1, {
              operation: operationName,
            });
          }
        }
      }

      // Record the final error
      this.recordMetric('operation_failed', 1, {
        operation: operationName,
        error: error instanceof Error ? error.message : 'unknown',
      });

      throw error;
    }
  }

  /**
   * Register a fallback strategy for an operation
   */
  registerFallback(operationName: string, fallback: () => Promise<any>): void {
    this.config.gracefulDegradation.fallbackStrategies.set(operationName, fallback);

    logger.debug('Fallback strategy registered', { operation: operationName });
  }

  /**
   * Get circuit breaker status for all operations
   */
  getCircuitBreakerStatuses(): Array<ReturnType<CircuitBreaker['getStatus']>> {
    return Array.from(this.circuitBreakers.values()).map(cb => cb.getStatus());
  }

  /**
   * Reset circuit breaker for a specific operation
   */
  resetCircuitBreaker(operationName: string): void {
    const circuitBreaker = this.circuitBreakers.get(operationName);
    if (circuitBreaker) {
      circuitBreaker.reset();
    }
  }

  /**
   * Reset all circuit breakers
   */
  resetAllCircuitBreakers(): void {
    for (const circuitBreaker of this.circuitBreakers.values()) {
      circuitBreaker.reset();
    }

    logger.info('All circuit breakers reset');
  }

  /**
   * Get error recovery statistics
   */
  getStats() {
    return {
      circuitBreakers: this.getCircuitBreakerStatuses(),
      retryConfig: this.config.retry,
      fallbackStrategies: Array.from(this.config.gracefulDegradation.fallbackStrategies.keys()),
    };
  }

  private getOrCreateCircuitBreaker(operationName: string): CircuitBreaker {
    if (!this.circuitBreakers.has(operationName)) {
      const circuitBreaker = new CircuitBreaker(
        operationName,
        this.config.circuitBreaker,
        this.telemetry
      );
      this.circuitBreakers.set(operationName, circuitBreaker);
    }

    return this.circuitBreakers.get(operationName)!;
  }

  private recordMetric(
    name: string,
    value: number,
    tags?: Record<string, string> | undefined
  ): void {
    if (this.telemetry) {
      this.telemetry.recordMetric({
        name,
        value,
        unit: 'count',
        tags: tags || {},
      });
    }
  }
}

/**
 * Create error recovery system with default configuration
 */
export function createErrorRecoverySystem(telemetry?: TelemetrySystem): ErrorRecoverySystem {
  const config: ErrorRecoveryConfig = {
    retry: {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      retryableErrors: [
        'ETIMEDOUT',
        'ECONNRESET',
        'ENOTFOUND',
        'EAI_AGAIN',
        'ECONNREFUSED',
        (error: any) => error.code === 'NETWORK_ERROR',
        (error: any) => error.status >= 500 && error.status < 600,
      ],
    },
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeoutMs: 60000, // 1 minute
      monitoringWindowMs: 60000, // 1 minute
      minimumThroughput: 3,
    },
    gracefulDegradation: {
      enabled: true,
      fallbackStrategies: new Map(),
    },
    telemetryEnabled: !!telemetry,
  };

  return new ErrorRecoverySystem(config, telemetry);
}
