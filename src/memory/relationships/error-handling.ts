/**
 * Comprehensive Error Handling for Memory Relationship System
 * Provides standardized error types, validation, recovery strategies, and logging
 */

import { createLogger } from '../../utils/logger.js';

const logger = createLogger('relationship-error-handling');

export enum RelationshipErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  PROCESSING_ERROR = 'PROCESSING_ERROR',
  MEMORY_ACCESS_ERROR = 'MEMORY_ACCESS_ERROR',
  ALGORITHM_ERROR = 'ALGORITHM_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR'
}

export class RelationshipError extends Error {
  public readonly type: RelationshipErrorType;
  public readonly context: Record<string, any>;
  public readonly recoverable: boolean;
  public readonly timestamp: Date;

  constructor(
    type: RelationshipErrorType,
    message: string,
    context: Record<string, any> = {},
    recoverable: boolean = true
  ) {
    super(message);
    this.name = 'RelationshipError';
    this.type = type;
    this.context = context;
    this.recoverable = recoverable;
    this.timestamp = new Date();
  }
}

export interface ErrorRecoveryStrategy {
  canRecover(_error: RelationshipError): boolean;
  recover(_error: RelationshipError, _retryCount: number): Promise<any>;
  maxRetries: number;
  backoffMs: number;
}

export class DefaultRecoveryStrategy implements ErrorRecoveryStrategy {
  public readonly maxRetries = 3;
  public readonly backoffMs = 1000;

  canRecover(error: RelationshipError): boolean {
    return error.recoverable && error.type !== RelationshipErrorType.CONFIGURATION_ERROR;
  }

  async recover(error: RelationshipError, retryCount: number): Promise<any> {
    const delay = this.backoffMs * Math.pow(2, retryCount);
    await new Promise(resolve => setTimeout(resolve, delay));

    logger.warn('Attempting error recovery', {
      errorType: error.type,
      retryCount,
      delay,
      context: error.context
    });

    // Return null to indicate generic recovery (let caller retry)
    return null;
  }
}

export class RelationshipErrorHandler {
  private recoveryStrategies = new Map<RelationshipErrorType, ErrorRecoveryStrategy>();
  private errorStats = new Map<RelationshipErrorType, number>();

  constructor() {
    // Register default recovery strategies
    const defaultStrategy = new DefaultRecoveryStrategy();
    this.recoveryStrategies.set(RelationshipErrorType.PROCESSING_ERROR, defaultStrategy);
    this.recoveryStrategies.set(RelationshipErrorType.MEMORY_ACCESS_ERROR, defaultStrategy);
    this.recoveryStrategies.set(RelationshipErrorType.ALGORITHM_ERROR, defaultStrategy);
    this.recoveryStrategies.set(RelationshipErrorType.TIMEOUT_ERROR, defaultStrategy);
    this.recoveryStrategies.set(RelationshipErrorType.NETWORK_ERROR, defaultStrategy);
  }

  /**
   * Handle error with appropriate recovery strategy
   */
  async handleError<T>(
    error: RelationshipError,
    originalOperation: () => Promise<T>,
    fallbackValue?: T
  ): Promise<T | null> {
    // Track error statistics
    this.errorStats.set(error.type, (this.errorStats.get(error.type) || 0) + 1);

    logger.error('Relationship error occurred', {
      type: error.type,
      message: error.message,
      context: error.context,
      recoverable: error.recoverable
    });

    // Check if we have a recovery strategy
    const strategy = this.recoveryStrategies.get(error.type);
    if (!strategy || !strategy.canRecover(error)) {
      logger.error('No recovery strategy available or error not recoverable', {
        type: error.type,
        hasStrategy: !!strategy
      });
      return fallbackValue || null;
    }

    // Attempt recovery with retries
    for (let retryCount = 0; retryCount < strategy.maxRetries; retryCount++) {
      try {
        await strategy.recover(error, retryCount);
        return await originalOperation();
      } catch (retryError) {
        logger.warn('Recovery attempt failed', {
          errorType: error.type,
          retryCount: retryCount + 1,
          maxRetries: strategy.maxRetries,
          retryError: retryError instanceof Error ? retryError.message : String(retryError)
        });

        if (retryCount === strategy.maxRetries - 1) {
          logger.error('All recovery attempts exhausted', {
            errorType: error.type,
            originalError: error.message
          });
        }
      }
    }

    return fallbackValue || null;
  }

  /**
   * Wrap an async operation with error handling
   */
  async withErrorHandling<T>(
    operation: () => Promise<T>,
    context: Record<string, any> = {},
    fallbackValue?: T
  ): Promise<T | null> {
    try {
      return await operation();
    } catch (error) {
      const relationshipError = this.wrapError(error, context);
      return await this.handleError(relationshipError, operation, fallbackValue);
    }
  }

  /**
   * Convert generic errors to RelationshipError
   */
  private wrapError(error: any, context: Record<string, any>): RelationshipError {
    if (error instanceof RelationshipError) {
      return error;
    }

    let errorType = RelationshipErrorType.PROCESSING_ERROR;
    let recoverable = true;

    // Classify error based on message content
    const errorMessage = error.message || String(error);

    if (errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT')) {
      errorType = RelationshipErrorType.TIMEOUT_ERROR;
    } else if (errorMessage.includes('memory') || errorMessage.includes('undefined') || errorMessage.includes('null')) {
      errorType = RelationshipErrorType.MEMORY_ACCESS_ERROR;
    } else if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
      errorType = RelationshipErrorType.VALIDATION_ERROR;
    } else if (errorMessage.includes('config') || errorMessage.includes('configuration')) {
      errorType = RelationshipErrorType.CONFIGURATION_ERROR;
      recoverable = false;
    } else if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('connection')) {
      errorType = RelationshipErrorType.NETWORK_ERROR;
    }

    return new RelationshipError(
      errorType,
      errorMessage,
      { ...context, originalError: error },
      recoverable
    );
  }

  /**
   * Get error statistics
   */
  getErrorStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [type, count] of this.errorStats.entries()) {
      stats[type] = count;
    }
    return stats;
  }

  /**
   * Clear error statistics
   */
  clearErrorStats(): void {
    this.errorStats.clear();
  }
}

/**
 * Input validation utilities
 */
export class RelationshipValidator {
  static validateMemoryItem(memory: any, context: string = ''): void {
    if (!memory) {
      throw new RelationshipError(
        RelationshipErrorType.VALIDATION_ERROR,
        `Memory item is null or undefined ${context}`,
        { context }
      );
    }

    if (!memory.id || typeof memory.id !== 'string') {
      throw new RelationshipError(
        RelationshipErrorType.VALIDATION_ERROR,
        `Memory item must have a valid string ID ${context}`,
        { memoryData: memory, context }
      );
    }

    if (!memory.content || typeof memory.content !== 'string') {
      throw new RelationshipError(
        RelationshipErrorType.VALIDATION_ERROR,
        `Memory item must have valid content ${context}`,
        { memoryId: memory.id, context }
      );
    }

    if (!memory.metadata || typeof memory.metadata !== 'object') {
      throw new RelationshipError(
        RelationshipErrorType.VALIDATION_ERROR,
        `Memory item must have valid metadata ${context}`,
        { memoryId: memory.id, context }
      );
    }
  }

  static validateMemoryArray(memories: any[], context: string = ''): void {
    if (!Array.isArray(memories)) {
      throw new RelationshipError(
        RelationshipErrorType.VALIDATION_ERROR,
        `Expected array of memories ${context}`,
        { actualType: typeof memories, context }
      );
    }

    if (memories.length === 0) {
      throw new RelationshipError(
        RelationshipErrorType.VALIDATION_ERROR,
        `Memory array cannot be empty ${context}`,
        { context }
      );
    }

    memories.forEach((memory, index) => {
      this.validateMemoryItem(memory, `${context} at index ${index}`);
    });
  }

  static validateRelationshipData(relationship: any, context: string = ''): void {
    if (!relationship) {
      throw new RelationshipError(
        RelationshipErrorType.VALIDATION_ERROR,
        `Relationship data is null or undefined ${context}`,
        { context }
      );
    }

    const required = ['sourceMemoryId', 'targetMemoryId', 'type', 'confidence'];
    for (const field of required) {
      if (!(field in relationship)) {
        throw new RelationshipError(
          RelationshipErrorType.VALIDATION_ERROR,
          `Relationship missing required field: ${field} ${context}`,
          { relationship, missingField: field, context }
        );
      }
    }

    if (typeof relationship.confidence !== 'number' || relationship.confidence < 0 || relationship.confidence > 1) {
      throw new RelationshipError(
        RelationshipErrorType.VALIDATION_ERROR,
        `Relationship confidence must be a number between 0 and 1 ${context}`,
        { confidence: relationship.confidence, context }
      );
    }
  }

  static validateTimeout(timeoutMs: number, context: string = ''): void {
    if (typeof timeoutMs !== 'number' || timeoutMs <= 0) {
      throw new RelationshipError(
        RelationshipErrorType.CONFIGURATION_ERROR,
        `Timeout must be a positive number ${context}`,
        { timeout: timeoutMs, context },
        false
      );
    }
  }
}

/**
 * Global error handler instance
 */
export const relationshipErrorHandler = new RelationshipErrorHandler();