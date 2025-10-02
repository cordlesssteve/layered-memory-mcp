/**
 * Unit tests for Error Types and Classification System
 */

import { describe, expect, it } from '@jest/globals';
import {
  ErrorCategory,
  ErrorSeverity,
  AppError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  NetworkError,
  DatabaseError,
  RateLimitError,
  ConfigurationError,
  BusinessLogicError,
  SystemError,
} from '../../src/error-handling/error-types.js';

describe('Error Types', () => {
  describe('AppError', () => {
    it('should create basic app error', () => {
      const error = new AppError({
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.HIGH,
        code: 'TEST_ERROR',
        message: 'Test error message',
        context: { timestamp: new Date() },
        retryable: false,
      });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Test error message');
      expect(error.category).toBe(ErrorCategory.SYSTEM);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.retryable).toBe(false);
    });

    it('should include user message and suggestions', () => {
      const error = new AppError({
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        code: 'INVALID_INPUT',
        message: 'Invalid input provided',
        context: { timestamp: new Date() },
        retryable: false,
        userMessage: 'Please check your input',
        suggestions: ['Use valid format', 'Check documentation'],
      });

      expect(error.userMessage).toBe('Please check your input');
      expect(error.suggestions).toEqual(['Use valid format', 'Check documentation']);
    });

    it('should include cause error', () => {
      const causeError = new Error('Original error');
      const error = new AppError({
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.CRITICAL,
        code: 'DB_FAILED',
        message: 'Database operation failed',
        context: { timestamp: new Date() },
        retryable: true,
        cause: causeError,
      });

      expect(error.cause).toBe(causeError);
    });

    it('should serialize to JSON', () => {
      const error = new AppError({
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        code: 'NETWORK_ERROR',
        message: 'Network request failed',
        context: { timestamp: new Date(), requestId: 'req-123' },
        retryable: true,
        userMessage: 'Connection failed',
        suggestions: ['Check network', 'Retry later'],
      });

      const json = error.toJSON();

      expect(json).toHaveProperty('name');
      expect(json).toHaveProperty('message', 'Network request failed');
      expect(json).toHaveProperty('category', ErrorCategory.NETWORK);
      expect(json).toHaveProperty('severity', ErrorSeverity.MEDIUM);
      expect(json).toHaveProperty('code', 'NETWORK_ERROR');
      expect(json).toHaveProperty('retryable', true);
      expect(json).toHaveProperty('userMessage', 'Connection failed');
      expect(json).toHaveProperty('suggestions');
      expect(json).toHaveProperty('stack');
    });

    it('should serialize nested AppError cause', () => {
      const causeError = new AppError({
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
        code: 'DB_ERROR',
        message: 'Database error',
        context: { timestamp: new Date() },
        retryable: true,
      });

      const error = new AppError({
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.CRITICAL,
        code: 'SYSTEM_ERROR',
        message: 'System failed',
        context: { timestamp: new Date() },
        retryable: false,
        cause: causeError,
      });

      const json: any = error.toJSON();
      expect(json).toHaveProperty('cause');
      expect(typeof json.cause).toBe('object');
    });

    it('should serialize regular Error cause', () => {
      const causeError = new Error('Regular error');
      const error = new AppError({
        category: ErrorCategory.UNKNOWN,
        severity: ErrorSeverity.LOW,
        code: 'UNKNOWN_ERROR',
        message: 'Unknown error',
        context: { timestamp: new Date() },
        retryable: false,
        cause: causeError,
      });

      const json = error.toJSON();
      expect(json).toHaveProperty('cause', 'Regular error');
    });

    it('should create user-safe error', () => {
      const error = new AppError({
        category: ErrorCategory.AUTHENTICATION,
        severity: ErrorSeverity.MEDIUM,
        code: 'AUTH_FAILED',
        message: 'Internal auth failure: token expired at xyz',
        context: { timestamp: new Date() },
        retryable: false,
        userMessage: 'Please log in again',
        suggestions: ['Re-authenticate', 'Contact support'],
      });

      const userError = error.toUserError();

      expect(userError.message).toBe('Please log in again');
      expect(userError.code).toBe('AUTH_FAILED');
      expect(userError.suggestions).toEqual(['Re-authenticate', 'Contact support']);
      expect(userError).not.toHaveProperty('stack');
      expect(userError).not.toHaveProperty('context');
    });

    it('should use default user message if not provided', () => {
      const error = new AppError({
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.HIGH,
        code: 'SYSTEM_ERROR',
        message: 'Internal system error',
        context: { timestamp: new Date() },
        retryable: false,
      });

      const userError = error.toUserError();
      expect(userError.message).toBe('An error occurred while processing your request');
    });
  });

  describe('AuthenticationError', () => {
    it('should create authentication error with defaults', () => {
      const error = new AuthenticationError('Invalid credentials');

      expect(error.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.code).toBe('AUTH_FAILED');
      expect(error.retryable).toBe(false);
      expect(error.message).toBe('Invalid credentials');
      expect(error.userMessage).toBe('Authentication failed. Please check your credentials.');
      expect(error.suggestions).toBeDefined();
    });

    it('should create authentication error with custom code', () => {
      const error = new AuthenticationError('Token expired', 'TOKEN_EXPIRED');

      expect(error.code).toBe('TOKEN_EXPIRED');
    });

    it('should include context', () => {
      const error = new AuthenticationError('Auth failed', 'AUTH_FAILED', {
        userId: 'user-123',
        requestId: 'req-456',
      });

      expect(error.context.userId).toBe('user-123');
      expect(error.context.requestId).toBe('req-456');
      expect(error.context.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('AuthorizationError', () => {
    it('should create authorization error', () => {
      const error = new AuthorizationError('Insufficient permissions');

      expect(error.category).toBe(ErrorCategory.AUTHORIZATION);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.code).toBe('ACCESS_DENIED');
      expect(error.retryable).toBe(false);
      expect(error.userMessage).toBe('You do not have permission to perform this action.');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid email format');

      expect(error.category).toBe(ErrorCategory.VALIDATION);
      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.retryable).toBe(false);
    });
  });

  describe('NetworkError', () => {
    it('should create network error', () => {
      const error = new NetworkError('Connection timeout');

      expect(error.category).toBe(ErrorCategory.NETWORK);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.retryable).toBe(true);
    });
  });

  describe('DatabaseError', () => {
    it('should create database error', () => {
      const error = new DatabaseError('Query failed');

      expect(error.category).toBe(ErrorCategory.DATABASE);
      expect(error.severity).toBe(ErrorSeverity.HIGH);
      expect(error.retryable).toBe(true);
    });
  });

  describe('RateLimitError', () => {
    it('should create rate limit error', () => {
      const error = new RateLimitError('Too many requests');

      expect(error.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(error.severity).toBe(ErrorSeverity.LOW);
      expect(error.retryable).toBe(true);
    });
  });

  describe('ConfigurationError', () => {
    it('should create configuration error', () => {
      const error = new ConfigurationError('Missing API key');

      expect(error.category).toBe(ErrorCategory.CONFIGURATION);
      expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.retryable).toBe(false);
    });
  });

  describe('BusinessLogicError', () => {
    it('should create business logic error', () => {
      const error = new BusinessLogicError('Invalid operation');

      expect(error.category).toBe(ErrorCategory.BUSINESS_LOGIC);
      expect(error.severity).toBe(ErrorSeverity.MEDIUM);
      expect(error.retryable).toBe(false);
    });
  });

  describe('SystemError', () => {
    it('should create system error', () => {
      const error = new SystemError('Out of memory');

      expect(error.category).toBe(ErrorCategory.SYSTEM);
      expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.retryable).toBe(false);
    });
  });

  describe('Error context', () => {
    it('should preserve all context fields', () => {
      const error = new AppError({
        category: ErrorCategory.SYSTEM,
        severity: ErrorSeverity.HIGH,
        code: 'TEST',
        message: 'Test',
        context: {
          timestamp: new Date(),
          userId: 'user-1',
          tenantId: 'tenant-1',
          operationId: 'op-1',
          requestId: 'req-1',
          metadata: { key: 'value' },
        },
        retryable: false,
      });

      expect(error.context.userId).toBe('user-1');
      expect(error.context.tenantId).toBe('tenant-1');
      expect(error.context.operationId).toBe('op-1');
      expect(error.context.requestId).toBe('req-1');
      expect(error.context.metadata).toEqual({ key: 'value' });
      expect(error.context.timestamp).toBeInstanceOf(Date);
    });
  });
});
