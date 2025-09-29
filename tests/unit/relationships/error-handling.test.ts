/**
 * Error Handling System Tests
 * Tests the comprehensive error handling for relationship modules
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import {
  RelationshipErrorHandler,
  RelationshipValidator,
  RelationshipError,
  RelationshipErrorType,
  relationshipErrorHandler,
} from '../../../src/memory/relationships/error-handling.js';
import type { MemoryItem } from '../../../src/memory/types.js';

describe('RelationshipErrorHandler', () => {
  let errorHandler: RelationshipErrorHandler;

  beforeEach(() => {
    errorHandler = new RelationshipErrorHandler();
  });

  test('should handle recoverable errors with retry', async () => {
    let attemptCount = 0;
    const operation = jest.fn(async () => {
      attemptCount++;
      if (attemptCount < 3) {
        throw new Error('Temporary failure');
      }
      return 'success';
    });

    const result = await errorHandler.withErrorHandling(
      operation,
      { test: 'retry-test' },
      'fallback'
    );

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  test('should return fallback value when all retries exhausted', async () => {
    const operation = jest.fn(async () => {
      throw new Error('Persistent failure');
    });

    const result = await errorHandler.withErrorHandling(
      operation,
      { test: 'fallback-test' },
      'fallback'
    );

    expect(result).toBe('fallback');
    expect(operation).toHaveBeenCalledTimes(4); // Initial call + 3 retries
  });

  test('should not retry non-recoverable errors', async () => {
    const operation = jest.fn(async () => {
      throw new RelationshipError(
        RelationshipErrorType.CONFIGURATION_ERROR,
        'Configuration is invalid',
        {},
        false // not recoverable
      );
    });

    const result = await errorHandler.withErrorHandling(
      operation,
      { test: 'non-recoverable-test' },
      'fallback'
    );

    expect(result).toBe('fallback');
    expect(operation).toHaveBeenCalledTimes(1); // No retries
  });

  test('should track error statistics', async () => {
    const operation = jest.fn(async () => {
      throw new RelationshipError(RelationshipErrorType.PROCESSING_ERROR, 'Processing failed');
    });

    await errorHandler.withErrorHandling(operation, {}, null);
    await errorHandler.withErrorHandling(operation, {}, null);

    const stats = errorHandler.getErrorStats();
    expect(stats[RelationshipErrorType.PROCESSING_ERROR]).toBe(2);
  });
});

describe('RelationshipValidator', () => {
  test('should validate memory items correctly', () => {
    const validMemory: MemoryItem = {
      id: 'test-id',
      content: 'test content',
      metadata: {
        category: 'test',
        priority: 5,
        tags: ['test'],
        source: 'test',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 0,
    };

    expect(() => {
      RelationshipValidator.validateMemoryItem(validMemory, 'test context');
    }).not.toThrow();
  });

  test('should throw validation error for invalid memory items', () => {
    const invalidMemory = {
      id: null,
      content: '',
      metadata: null,
    };

    expect(() => {
      RelationshipValidator.validateMemoryItem(invalidMemory as any, 'test context');
    }).toThrow(RelationshipError);
  });

  test('should validate memory arrays', () => {
    const validMemories: MemoryItem[] = [
      {
        id: 'test-id-1',
        content: 'test content 1',
        metadata: { category: 'test', priority: 5, tags: ['test'], source: 'test' },
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
      },
      {
        id: 'test-id-2',
        content: 'test content 2',
        metadata: { category: 'test', priority: 5, tags: ['test'], source: 'test' },
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
      },
    ];

    expect(() => {
      RelationshipValidator.validateMemoryArray(validMemories, 'test context');
    }).not.toThrow();
  });

  test('should throw validation error for empty memory arrays', () => {
    expect(() => {
      RelationshipValidator.validateMemoryArray([], 'test context');
    }).toThrow(RelationshipError);
  });

  test('should validate relationship data', () => {
    const validRelationship = {
      sourceMemoryId: 'source-id',
      targetMemoryId: 'target-id',
      type: 'contextual',
      confidence: 0.8,
    };

    expect(() => {
      RelationshipValidator.validateRelationshipData(validRelationship, 'test context');
    }).not.toThrow();
  });

  test('should throw validation error for invalid confidence', () => {
    const invalidRelationship = {
      sourceMemoryId: 'source-id',
      targetMemoryId: 'target-id',
      type: 'contextual',
      confidence: 1.5, // Invalid confidence > 1
    };

    expect(() => {
      RelationshipValidator.validateRelationshipData(invalidRelationship, 'test context');
    }).toThrow(RelationshipError);
  });
});

describe('RelationshipError', () => {
  test('should create error with proper properties', () => {
    const context = { test: 'data' };
    const error = new RelationshipError(
      RelationshipErrorType.VALIDATION_ERROR,
      'Test error message',
      context,
      false
    );

    expect(error.type).toBe(RelationshipErrorType.VALIDATION_ERROR);
    expect(error.message).toBe('Test error message');
    expect(error.context).toEqual(context);
    expect(error.recoverable).toBe(false);
    expect(error.timestamp).toBeInstanceOf(Date);
  });

  test('should default to recoverable error', () => {
    const error = new RelationshipError(RelationshipErrorType.PROCESSING_ERROR, 'Test error');

    expect(error.recoverable).toBe(true);
  });
});

describe('Global Error Handler', () => {
  test('should provide global error handler instance', () => {
    expect(relationshipErrorHandler).toBeInstanceOf(RelationshipErrorHandler);
  });

  test('should maintain error statistics across calls', async () => {
    const operation = jest.fn(async () => {
      throw new Error('Test error');
    });

    await relationshipErrorHandler.withErrorHandling(operation, {}, null);

    const stats = relationshipErrorHandler.getErrorStats();
    expect(Object.keys(stats).length).toBeGreaterThan(0);
  });
});
