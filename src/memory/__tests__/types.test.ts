/**
 * Tests for memory system types and interfaces
 */

import type {
  MemoryQuery,
  MemorySearchResult,
  MemoryStats,
  MemoryLayer,
  MemoryLayerConfig,
} from '../types.js';
import { createMockMemoryItem, createMockMetadata } from './test-utils.js';

describe('Memory Types', () => {
  describe('MemoryItem', () => {
    it('should have all required properties', () => {
      const item = createMockMemoryItem();

      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('content');
      expect(item).toHaveProperty('metadata');
      expect(item).toHaveProperty('createdAt');
      expect(item).toHaveProperty('updatedAt');
      expect(item).toHaveProperty('accessCount');
      expect(item).toHaveProperty('lastAccessedAt');

      expect(typeof item.id).toBe('string');
      expect(typeof item.content).toBe('string');
      expect(typeof item.metadata).toBe('object');
      expect(item.createdAt).toBeInstanceOf(Date);
      expect(item.updatedAt).toBeInstanceOf(Date);
      expect(item.lastAccessedAt).toBeInstanceOf(Date);
      expect(typeof item.accessCount).toBe('number');
    });

    it('should support custom validation with toBeValidMemoryItem matcher', () => {
      const item = createMockMemoryItem();
      expect(item).toBeValidMemoryItem();
    });

    it('should allow partial overrides in test creation', () => {
      const customContent = 'Custom test content';
      const customPriority = 9;

      const item = createMockMemoryItem({
        content: customContent,
        metadata: createMockMetadata({ priority: customPriority }),
      });

      expect(item.content).toBe(customContent);
      expect(item.metadata.priority).toBe(customPriority);
    });
  });

  describe('MemoryMetadata', () => {
    it('should have all required properties', () => {
      const metadata = createMockMetadata();

      expect(metadata).toHaveProperty('tags');
      expect(metadata).toHaveProperty('category');
      expect(metadata).toHaveProperty('priority');
      expect(metadata).toHaveProperty('source');

      expect(Array.isArray(metadata.tags)).toBe(true);
      expect(typeof metadata.category).toBe('string');
      expect(typeof metadata.priority).toBe('number');
      expect(typeof metadata.source).toBe('string');
    });

    it('should support optional properties', () => {
      const metadata = createMockMetadata({
        projectId: 'test-project',
        sessionId: 'test-session',
        userId: 'test-user',
        expiresAt: new Date(),
      });

      expect(metadata.projectId).toBe('test-project');
      expect(metadata.sessionId).toBe('test-session');
      expect(metadata.userId).toBe('test-user');
      expect(metadata.expiresAt).toBeInstanceOf(Date);
    });

    it('should support custom properties', () => {
      const metadata = createMockMetadata({
        customProperty: 'custom-value',
        numericProperty: 42,
      } as any);

      expect((metadata as any).customProperty).toBe('custom-value');
      expect((metadata as any).numericProperty).toBe(42);
    });
  });

  describe('MemoryQuery', () => {
    it('should require query string', () => {
      const query: MemoryQuery = {
        query: 'test search',
      };

      expect(query.query).toBe('test search');
    });

    it('should support optional parameters', () => {
      const query: MemoryQuery = {
        query: 'test search',
        limit: 20,
        offset: 10,
        filters: {
          tags: ['important'],
          category: 'task',
          priority: { min: 5, max: 10 },
        },
        similarity: {
          threshold: 0.8,
          algorithm: 'cosine',
          includeMetadata: true,
        },
      };

      expect(query.limit).toBe(20);
      expect(query.offset).toBe(10);
      expect(query.filters?.tags).toEqual(['important']);
      expect(query.filters?.category).toBe('task');
      expect(query.filters?.priority?.min).toBe(5);
      expect(query.similarity?.threshold).toBe(0.8);
      expect(query.similarity?.algorithm).toBe('cosine');
    });
  });

  describe('MemorySearchResult', () => {
    it('should contain memory item with score and source', () => {
      const memory = createMockMemoryItem();
      const result: MemorySearchResult = {
        memory,
        score: 0.85,
        source: 'session' as MemoryLayer,
        explanation: 'High relevance match',
      };

      expect(result.memory).toBe(memory);
      expect(result.score).toBe(0.85);
      expect(result.source).toBe('session');
      expect(result.explanation).toBe('High relevance match');
    });

    it('should support custom validation with toBeValidMemoryResult matcher', () => {
      const result: MemorySearchResult = {
        memory: createMockMemoryItem(),
        score: 0.75,
        source: 'global' as MemoryLayer,
      };

      expect(result).toBeValidMemoryResult();
    });
  });

  describe('MemoryStats', () => {
    it('should have all required numeric properties', () => {
      const stats: MemoryStats = {
        totalItems: 10,
        totalSize: 1024,
        averageAccessCount: 2.5,
        lastAccessed: new Date(),
        oldestItem: new Date(Date.now() - 86400000), // 1 day ago
        newestItem: new Date(),
        categoryCounts: { task: 5, knowledge: 5 },
        tagCounts: { important: 3, urgent: 2 },
      };

      expect(stats.totalItems).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty stats', () => {
      const stats: MemoryStats = {
        totalItems: 0,
        totalSize: 0,
        averageAccessCount: 0,
        lastAccessed: undefined,
        oldestItem: undefined,
        newestItem: undefined,
        categoryCounts: {},
        tagCounts: {},
      };

      expect(stats.totalItems).toBeGreaterThanOrEqual(0);
    });
  });

  describe('MemoryLayerConfig', () => {
    it('should support all configuration options', () => {
      const config: MemoryLayerConfig = {
        maxItems: 1000,
        maxSizeBytes: 10 * 1024 * 1024,
        ttl: 24 * 60 * 60 * 1000, // 24 hours
        compressionEnabled: true,
        indexingEnabled: true,
      };

      expect(config.maxItems).toBe(1000);
      expect(config.maxSizeBytes).toBe(10 * 1024 * 1024);
      expect(config.ttl).toBe(24 * 60 * 60 * 1000);
      expect(config.compressionEnabled).toBe(true);
      expect(config.indexingEnabled).toBe(true);
    });

    it('should support minimal configuration', () => {
      const config: MemoryLayerConfig = {
        ttl: undefined,
      };

      expect(config.ttl).toBeUndefined();
    });
  });

  describe('MemoryLayer enum', () => {
    it('should include all expected layer types', () => {
      const layers: MemoryLayer[] = ['session', 'project', 'global', 'temporal'];

      for (const layer of layers) {
        expect(['session', 'project', 'global', 'temporal']).toContain(layer);
      }
    });
  });
});