/**
 * Performance Optimizer Tests
 * Sprint 4 - Monitoring & Performance
 * Target: >35% coverage (currently 33.33%)
 */

import { RelationshipPerformanceOptimizer } from '../../../src/memory/relationships/performance-optimizer.js';
import type { MemoryItem } from '../../../src/memory/types.js';
import type { MemoryRelationship } from '../../../src/memory/relationships/types.js';

describe('RelationshipPerformanceOptimizer', () => {
  let optimizer: RelationshipPerformanceOptimizer;

  const createTestMemory = (id: string): MemoryItem => ({
    id,
    content: `Memory ${id}`,
    metadata: { tags: [], category: 'test', priority: 5, source: 'test' },
    createdAt: new Date(),
    updatedAt: new Date(),
    accessCount: 0,
    lastAccessedAt: new Date(),
  });

  const createTestRelationship = (
    id: string,
    source: string,
    target: string
  ): MemoryRelationship => ({
    id,
    sourceMemoryId: source,
    targetMemoryId: target,
    type: 'reference',
    confidence: 0.8,
    weight: 0.8,
    metadata: {
      source: 'auto-detected',
      algorithm: 'test',
      createdAt: new Date(),
    },
  });

  beforeEach(() => {
    optimizer = new RelationshipPerformanceOptimizer({
      enableCaching: true,
      cacheMaxSize: 100,
      batchSize: 10,
      maxProcessingTime: 5000,
      enableParallelProcessing: false,
      maxConcurrentBatches: 2,
      optimizationLevel: 'basic',
      enableLazyLoading: false,
      memoryThresholdMB: 512,
    });
  });

  // ============================================================================
  // MEMORY LOOKUP (2 tests)
  // ============================================================================

  describe('createMemoryLookup', () => {
    test('should create lookup map from memories', () => {
      const memories = [createTestMemory('m1'), createTestMemory('m2'), createTestMemory('m3')];

      const lookup = optimizer.createMemoryLookup(memories);

      expect(lookup.size).toBe(3);
      expect(lookup.get('m1')).toEqual(memories[0]);
      expect(lookup.get('m2')).toEqual(memories[1]);
      expect(lookup.get('m3')).toEqual(memories[2]);
    });

    test('should handle empty memories array', () => {
      const lookup = optimizer.createMemoryLookup([]);
      expect(lookup.size).toBe(0);
    });
  });

  // ============================================================================
  // RELATIONSHIP LOOKUP (3 tests)
  // ============================================================================

  describe('createRelationshipLookup', () => {
    test('should create bidirectional lookup', () => {
      const relationships = new Map([
        ['r1', createTestRelationship('r1', 'm1', 'm2')],
        ['r2', createTestRelationship('r2', 'm2', 'm3')],
      ]);

      const lookup = optimizer.createRelationshipLookup(relationships);

      expect(lookup.get('m1')).toHaveLength(1);
      expect(lookup.get('m2')).toHaveLength(2); // Both source and target
      expect(lookup.get('m3')).toHaveLength(1);
    });

    test('should handle empty relationships', () => {
      const lookup = optimizer.createRelationshipLookup(new Map());
      expect(lookup.size).toBe(0);
    });

    test('should handle multiple relationships for same memory', () => {
      const relationships = new Map([
        ['r1', createTestRelationship('r1', 'm1', 'm2')],
        ['r2', createTestRelationship('r2', 'm1', 'm3')],
        ['r3', createTestRelationship('r3', 'm1', 'm4')],
      ]);

      const lookup = optimizer.createRelationshipLookup(relationships);

      expect(lookup.get('m1')).toHaveLength(3);
    });
  });

  // ============================================================================
  // BATCH PROCESSING (4 tests)
  // ============================================================================

  describe('processBatches', () => {
    test('should process items in batches', async () => {
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const processor = jest.fn(async (batch: number[]) => batch.map(n => n * 2));
      const combiner = (results: number[][]) => results.flat();

      const result = await optimizer.processBatches(items, processor, combiner);

      expect(result).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
      expect(processor).toHaveBeenCalled();
    });

    test('should handle small batches', async () => {
      const items = [1, 2];
      const processor = jest.fn(async (batch: number[]) => batch);
      const combiner = (results: number[][]) => results.flat();

      const result = await optimizer.processBatches(items, processor, combiner);

      expect(result).toEqual([1, 2]);
    });

    test('should handle empty items', async () => {
      const processor = jest.fn(async (batch: any[]) => batch);
      const combiner = (results: any[][]) => results.flat();

      const result = await optimizer.processBatches([], processor, combiner);

      expect(result).toEqual([]);
    });

    test('should use combiner to merge results', async () => {
      const items = [1, 2, 3];
      const processor = jest.fn(async (batch: number[]) => batch);
      const combiner = jest.fn((results: number[][]) => results.flat());

      await optimizer.processBatches(items, processor, combiner);

      expect(combiner).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // CONFIGURATION (2 tests)
  // ============================================================================

  describe('Configuration', () => {
    test('should respect caching configuration', () => {
      const withCache = new RelationshipPerformanceOptimizer({
        enableCaching: true,
        cacheMaxSize: 50,
        batchSize: 5,
        maxProcessingTime: 1000,
        enableParallelProcessing: false,
        maxConcurrentBatches: 1,
        optimizationLevel: 'basic',
        enableLazyLoading: false,
        memoryThresholdMB: 256,
      });

      // Cache is enabled internally
      expect(withCache).toBeDefined();
    });

    test('should accept different optimization levels', () => {
      const aggressive = new RelationshipPerformanceOptimizer({
        enableCaching: true,
        cacheMaxSize: 100,
        batchSize: 20,
        maxProcessingTime: 10000,
        enableParallelProcessing: true,
        maxConcurrentBatches: 4,
        optimizationLevel: 'aggressive',
        enableLazyLoading: true,
        memoryThresholdMB: 1024,
      });

      expect(aggressive).toBeDefined();
    });
  });
});
