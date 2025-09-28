/**
 * Enhanced Error Types and Classification System
 * Provides structured error handling with proper categorization and context
 */

// Remove unused logger import
// import { createLogger } from '../utils/logger.js';
// const logger = createLogger('error-types');

/* eslint-disable no-unused-vars */
export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  NETWORK = 'network',
  DATABASE = 'database',
  EXTERNAL_SERVICE = 'external_service',
  RATE_LIMIT = 'rate_limit',
  CONFIGURATION = 'configuration',
  BUSINESS_LOGIC = 'business_logic',
  SYSTEM = 'system',
  UNKNOWN = 'unknown',
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface ErrorContext {
  userId?: string | undefined;
  tenantId?: string | undefined;
  operationId?: string | undefined;
  requestId?: string | undefined;
  metadata?: Record<string, any> | undefined;
  timestamp: Date;
}

export interface ErrorDetails {
  category: ErrorCategory;
  severity: ErrorSeverity;
  code: string;
  message: string;
  context: ErrorContext;
  cause?: Error | undefined;
  retryable: boolean;
  userMessage?: string | undefined;
  suggestions?: string[] | undefined;
}

/**
 * Base class for all application errors
 */
export class AppError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly code: string;
  public readonly context: ErrorContext;
  public readonly retryable: boolean;
  public readonly userMessage?: string | undefined;
  public readonly suggestions?: string[] | undefined;
  public readonly cause?: Error | undefined;

  constructor(details: ErrorDetails) {
    super(details.message);
    this.name = this.constructor.name;

    this.category = details.category;
    this.severity = details.severity;
    this.code = details.code;
    this.context = details.context;
    this.retryable = details.retryable;
    this.userMessage = details.userMessage;
    this.suggestions = details.suggestions;
    this.cause = details.cause;

    // Maintain proper stack trace for V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for serialization
   */
  toJSON(): object {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      severity: this.severity,
      code: this.code,
      context: this.context,
      retryable: this.retryable,
      userMessage: this.userMessage,
      suggestions: this.suggestions,
      stack: this.stack,
      cause: this.cause ? (this.cause instanceof AppError ? this.cause.toJSON() : this.cause.message) : undefined,
    };
  }

  /**
   * Create a user-safe version of the error
   */
  toUserError(): { message: string; code: string; suggestions?: string[] | undefined } {
    return {
      message: this.userMessage || 'An error occurred while processing your request',
      code: this.code,
      suggestions: this.suggestions,
    };
  }
}

/**
 * Authentication related errors
 */
export class AuthenticationError extends AppError {
  constructor(
    message: string,
    code: string = 'AUTH_FAILED',
    context: Partial<ErrorContext> = {},
    cause?: Error
  ) {
    super({
      category: ErrorCategory.AUTHENTICATION,
      severity: ErrorSeverity.MEDIUM,
      code,
      message,
      context: {
        timestamp: new Date(),
        ...context,
      },
      retryable: false,
      userMessage: 'Authentication failed. Please check your credentials.',
      suggestions: ['Verify your username and password', 'Check if your account is active'],
      cause,
    });
  }
}

/**
 * Authorization related errors
 */
export class AuthorizationError extends AppError {
  constructor(
    message: string,
    code: string = 'ACCESS_DENIED',
    context: Partial<ErrorContext> = {},
    cause?: Error
  ) {
    super({
      category: ErrorCategory.AUTHORIZATION,
      severity: ErrorSeverity.MEDIUM,
      code,
      message,
      context: {
        timestamp: new Date(),
        ...context,
      },
      retryable: false,
      userMessage: 'You do not have permission to perform this action.',
      suggestions: ['Contact your administrator for access', 'Verify your account permissions'],
      cause,
    });
  }
}

/**
 * Validation related errors
 */
export class ValidationError extends AppError {
  constructor(
    message: string,
    code: string = 'VALIDATION_FAILED',
    context: Partial<ErrorContext> = {},
    cause?: Error
  ) {
    super({
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.LOW,
      code,
      message,
      context: {
        timestamp: new Date(),
        ...context,
      },
      retryable: false,
      userMessage: 'The provided data is invalid.',
      suggestions: ['Check the format of your input', 'Ensure all required fields are provided'],
      cause,
    });
  }
}

/**
 * Network related errors
 */
export class NetworkError extends AppError {
  constructor(
    message: string,
    code: string = 'NETWORK_ERROR',
    context: Partial<ErrorContext> = {},
    cause?: Error
  ) {
    super({
      category: ErrorCategory.NETWORK,
      severity: ErrorSeverity.HIGH,
      code,
      message,
      context: {
        timestamp: new Date(),
        ...context,
      },
      retryable: true,
      userMessage: 'A network error occurred. Please try again.',
      suggestions: ['Check your internet connection', 'Try again in a few moments'],
      cause,
    });
  }
}

/**
 * Database related errors
 */
export class DatabaseError extends AppError {
  constructor(
    message: string,
    code: string = 'DATABASE_ERROR',
    context: Partial<ErrorContext> = {},
    cause?: Error
  ) {
    super({
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      code,
      message,
      context: {
        timestamp: new Date(),
        ...context,
      },
      retryable: true,
      userMessage: 'A database error occurred. Please try again.',
      suggestions: ['Try again in a few moments', 'Contact support if the problem persists'],
      cause,
    });
  }
}

/**
 * External service related errors
 */
export class ExternalServiceError extends AppError {
  constructor(
    message: string,
    code: string = 'EXTERNAL_SERVICE_ERROR',
    context: Partial<ErrorContext> = {},
    cause?: Error
  ) {
    super({
      category: ErrorCategory.EXTERNAL_SERVICE,
      severity: ErrorSeverity.MEDIUM,
      code,
      message,
      context: {
        timestamp: new Date(),
        ...context,
      },
      retryable: true,
      userMessage: 'An external service is temporarily unavailable.',
      suggestions: ['Try again later', 'The service may be undergoing maintenance'],
      cause,
    });
  }
}

/**
 * Rate limiting related errors
 */
export class RateLimitError extends AppError {
  constructor(
    message: string,
    retryAfter?: number,
    context: Partial<ErrorContext> = {},
    cause?: Error
  ) {
    super({
      category: ErrorCategory.RATE_LIMIT,
      severity: ErrorSeverity.LOW,
      code: 'RATE_LIMIT_EXCEEDED',
      message,
      context: {
        timestamp: new Date(),
        metadata: retryAfter ? { retryAfter } : undefined,
        ...context,
      },
      retryable: true,
      userMessage: 'Rate limit exceeded. Please slow down your requests.',
      suggestions: [
        retryAfter ? `Try again in ${retryAfter} seconds` : 'Try again later',
        'Reduce the frequency of your requests',
      ],
      cause,
    });
  }
}

/**
 * Configuration related errors
 */
export class ConfigurationError extends AppError {
  constructor(
    message: string,
    code: string = 'CONFIGURATION_ERROR',
    context: Partial<ErrorContext> = {},
    cause?: Error
  ) {
    super({
      category: ErrorCategory.CONFIGURATION,
      severity: ErrorSeverity.CRITICAL,
      code,
      message,
      context: {
        timestamp: new Date(),
        ...context,
      },
      retryable: false,
      userMessage: 'A configuration error occurred.',
      suggestions: ['Contact your system administrator'],
      cause,
    });
  }
}

/**
 * Business logic related errors
 */
export class BusinessLogicError extends AppError {
  constructor(
    message: string,
    code: string = 'BUSINESS_LOGIC_ERROR',
    context: Partial<ErrorContext> = {},
    cause?: Error
  ) {
    super({
      category: ErrorCategory.BUSINESS_LOGIC,
      severity: ErrorSeverity.MEDIUM,
      code,
      message,
      context: {
        timestamp: new Date(),
        ...context,
      },
      retryable: false,
      userMessage: message, // Business logic errors are usually user-facing
      cause,
    });
  }
}

/**
 * System related errors
 */
export class SystemError extends AppError {
  constructor(
    message: string,
    code: string = 'SYSTEM_ERROR',
    context: Partial<ErrorContext> = {},
    cause?: Error
  ) {
    super({
      category: ErrorCategory.SYSTEM,
      severity: ErrorSeverity.CRITICAL,
      code,
      message,
      context: {
        timestamp: new Date(),
        ...context,
      },
      retryable: false,
      userMessage: 'A system error occurred. Please contact support.',
      suggestions: ['Contact technical support with the error details'],
      cause,
    });
  }
}

/**
 * Error transformation utilities
 */
export class ErrorTransformer {
  /**
   * Transform any error into an AppError
   */
  static toAppError(
    error: any,
    context: Partial<ErrorContext> = {},
    fallbackCategory: ErrorCategory = ErrorCategory.UNKNOWN
  ): AppError {
    // If it's already an AppError, just update context
    if (error instanceof AppError) {
      return new AppError({
        ...error,
        context: {
          ...error.context,
          ...context,
        },
      });
    }

    // Handle common Node.js errors
    if (error instanceof Error) {
      return ErrorTransformer.classifyError(error, context);
    }

    // Handle string errors
    if (typeof error === 'string') {
      return new AppError({
        category: fallbackCategory,
        severity: ErrorSeverity.MEDIUM,
        code: 'UNKNOWN_ERROR',
        message: error,
        context: {
          timestamp: new Date(),
          ...context,
        },
        retryable: false,
      });
    }

    // Handle unknown error types
    return new AppError({
      category: fallbackCategory,
      severity: ErrorSeverity.MEDIUM,
      code: 'UNKNOWN_ERROR',
      message: 'An unknown error occurred',
      context: {
        timestamp: new Date(),
        metadata: { originalError: error },
        ...context,
      },
      retryable: false,
    });
  }

  /**
   * Classify native errors into appropriate AppError types
   */
  private static classifyError(error: Error, context: Partial<ErrorContext> = {}): AppError {
    const message = error.message;
    const errorName = error.name;

    // Network errors
    if (
      message.includes('ETIMEDOUT') ||
      message.includes('ECONNRESET') ||
      message.includes('ENOTFOUND') ||
      message.includes('ECONNREFUSED') ||
      errorName === 'NetworkError'
    ) {
      return new NetworkError(message, 'NETWORK_ERROR', context, error);
    }

    // Database errors
    if (
      message.includes('database') ||
      message.includes('connection') ||
      message.includes('sql') ||
      errorName.includes('Database')
    ) {
      return new DatabaseError(message, 'DATABASE_ERROR', context, error);
    }

    // Validation errors
    if (
      message.includes('validation') ||
      message.includes('invalid') ||
      errorName === 'ValidationError' ||
      errorName === 'ZodError'
    ) {
      return new ValidationError(message, 'VALIDATION_ERROR', context, error);
    }

    // Authorization errors
    if (
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('access denied') ||
      errorName === 'UnauthorizedError'
    ) {
      return new AuthorizationError(message, 'ACCESS_DENIED', context, error);
    }

    // Authentication errors
    if (
      message.includes('authentication') ||
      message.includes('login') ||
      message.includes('credentials') ||
      errorName === 'AuthenticationError'
    ) {
      return new AuthenticationError(message, 'AUTH_FAILED', context, error);
    }

    // Configuration errors
    if (
      message.includes('configuration') ||
      message.includes('config') ||
      message.includes('environment') ||
      errorName === 'ConfigurationError'
    ) {
      return new ConfigurationError(message, 'CONFIGURATION_ERROR', context, error);
    }

    // Default to system error
    return new SystemError(message, 'SYSTEM_ERROR', context, error);
  }

  /**
   * Extract error context from request or operation
   */
  static extractContext(options: {
    userId?: string;
    tenantId?: string;
    operationId?: string;
    requestId?: string;
    metadata?: Record<string, any>;
  }): ErrorContext {
    return {
      ...options,
      timestamp: new Date(),
    };
  }

  /**
   * Determine if an error should be retried
   */
  static isRetryable(error: AppError): boolean {
    return error.retryable && (
      error.category === ErrorCategory.NETWORK ||
      error.category === ErrorCategory.DATABASE ||
      error.category === ErrorCategory.EXTERNAL_SERVICE ||
      error.category === ErrorCategory.RATE_LIMIT
    );
  }

  /**
   * Get appropriate HTTP status code for error
   */
  static getHttpStatusCode(error: AppError): number {
    switch (error.category) {
      case ErrorCategory.AUTHENTICATION:
        return 401;
      case ErrorCategory.AUTHORIZATION:
        return 403;
      case ErrorCategory.VALIDATION:
        return 400;
      case ErrorCategory.RATE_LIMIT:
        return 429;
      case ErrorCategory.NETWORK:
      case ErrorCategory.DATABASE:
      case ErrorCategory.EXTERNAL_SERVICE:
        return 502;
      case ErrorCategory.CONFIGURATION:
      case ErrorCategory.SYSTEM:
        return 500;
      case ErrorCategory.BUSINESS_LOGIC:
        return 422;
      default:
        return 500;
    }
  }
}

/**
 * Error aggregation for collecting multiple errors
 */
export class ErrorAggregate extends AppError {
  public readonly errors: AppError[];

  constructor(
    errors: AppError[],
    message: string = 'Multiple errors occurred',
    context: Partial<ErrorContext> = {}
  ) {
    const highestSeverity = errors.reduce((highest, error) => {
      const severityOrder = [ErrorSeverity.LOW, ErrorSeverity.MEDIUM, ErrorSeverity.HIGH, ErrorSeverity.CRITICAL];
      return severityOrder.indexOf(error.severity) > severityOrder.indexOf(highest) ? error.severity : highest;
    }, ErrorSeverity.LOW);

    super({
      category: ErrorCategory.SYSTEM,
      severity: highestSeverity,
      code: 'AGGREGATE_ERROR',
      message,
      context: {
        timestamp: new Date(),
        metadata: { errorCount: errors.length },
        ...context,
      },
      retryable: errors.some(error => error.retryable),
      userMessage: 'Multiple errors occurred during processing',
      suggestions: ['Review individual error details', 'Contact support if issues persist'],
    });

    this.errors = errors;
  }

  /**
   * Get all errors by category
   */
  getErrorsByCategory(category: ErrorCategory): AppError[] {
    return this.errors.filter(error => error.category === category);
  }

  /**
   * Get all errors by severity
   */
  getErrorsBySeverity(severity: ErrorSeverity): AppError[] {
    return this.errors.filter(error => error.severity === severity);
  }

  override toJSON(): object {
    return {
      ...super.toJSON(),
      errors: this.errors.map(error => error.toJSON()),
    };
  }
}