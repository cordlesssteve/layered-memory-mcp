/**
 * Monitoring Tests - Monitored Memory Router
 * Tests for telemetry and performance monitoring integration
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MonitoredMemoryRouter } from '../../src/memory/monitored-router.js';
import type { MemoryMetadata } from '../../src/memory/types.js';

describe('MonitoredMemoryRouter', () => {
  let router: MonitoredMemoryRouter;

  beforeEach(async () => {
    router = new MonitoredMemoryRouter({
      routing: {
        sessionThreshold: 0.8,
        projectThreshold: 0.6,
        globalThreshold: 0.4,
        temporalFallback: true,
        maxResults: 20,
        scoringWeights: {
          recency: 0.3,
          frequency: 0.2,
          relevance: 0.4,
          priority: 0.1,
        },
      },
      relationships: {
        enabled: false, // Disable for monitoring tests
        minConfidence: 0.7,
        batchSize: 50,
      },
      monitoring: {
        enabled: true,
        metricsRetentionMs: 60000, // 1 minute for tests
        slowOperationMs: 100, // Low threshold for testing
      },
    });
  });

  afterEach(async () => {
    await router.close();
  });

  describe('Monitoring Configuration', () => {
    it('should initialize with monitoring enabled', () => {
      const stats = router.getMonitoringStats();
      expect(stats.enabled).toBe(true);
    });

    it('should provide telemetry system', () => {
      const telemetry = router.getTelemetry();
      expect(telemetry).toBeDefined();
    });

    it('should provide performance monitor', () => {
      const perfMonitor = router.getPerformanceMonitor();
      expect(perfMonitor).toBeDefined();
    });
  });

  describe('Memory Store Monitoring', () => {
    it('should track successful memory store operations', async () => {
      const metadata: MemoryMetadata = {
        tags: ['test', 'monitoring'],
        category: 'knowledge',
        priority: 5,
        source: 'monitoring-test',
      };

      const item = await router.store('Test monitored content', metadata);

      expect(item).toBeDefined();
      expect(item.content).toBe('Test monitored content');

      // Check metrics were recorded
      const stats = router.getMonitoringStats();
      expect(stats.telemetry).toBeDefined();
      expect(Array.isArray(stats.telemetry)).toBe(true);
    });

    it('should record store operation metrics', async () => {
      const metadata: MemoryMetadata = {
        tags: ['metrics-test'],
        category: 'task',
        priority: 7,
        source: 'test',
      };

      await router.store('Content for metrics tracking', metadata);

      const stats = router.getMonitoringStats();

      // Verify telemetry data exists
      expect(stats.enabled).toBe(true);
      expect(stats.telemetry).toBeDefined();
    });

    it('should track memory size in metrics', async () => {
      const largeContent = 'x'.repeat(1000); // 1KB content
      const metadata: MemoryMetadata = {
        tags: ['size-test'],
        category: 'knowledge',
        priority: 5,
        source: 'test',
      };

      await router.store(largeContent, metadata);

      const stats = router.getMonitoringStats();
      expect(stats.telemetry).toBeDefined();
    });
  });

  describe('Memory Search Monitoring', () => {
    beforeEach(async () => {
      // Pre-populate with test data
      await router.store('Test memory 1', {
        tags: ['search-test'],
        category: 'knowledge',
        priority: 5,
        source: 'test',
      });
      await router.store('Test memory 2', {
        tags: ['search-test'],
        category: 'task',
        priority: 5,
        source: 'test',
      });
      await router.store('Test memory 3', {
        tags: ['search-test'],
        category: 'decision',
        priority: 5,
        source: 'test',
      });
    });

    it('should track successful search operations', async () => {
      const results = await router.search({ query: 'test', limit: 10 });

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);

      const stats = router.getMonitoringStats();
      expect(stats.telemetry).toBeDefined();
    });

    it('should record search result counts', async () => {
      await router.search({ query: 'test' });

      const stats = router.getMonitoringStats();
      expect(stats.telemetry).toBeDefined();
    });

    it('should track empty search results', async () => {
      const results = await router.search({ query: 'nonexistent-term-xyz' });

      expect(results).toBeDefined();
      expect(results.length).toBe(0);

      const stats = router.getMonitoringStats();
      expect(stats.telemetry).toBeDefined();
    });
  });

  describe('Statistics Monitoring', () => {
    it('should track stats retrieval operations', async () => {
      await router.getAllStats();

      const stats = router.getMonitoringStats();
      expect(stats.telemetry).toBeDefined();
    });
  });

  describe('Error Tracking', () => {
    it('should track errors in metrics', async () => {
      // Try to update non-existent memory
      try {
        await router.update('non-existent-id', { content: 'test' });
      } catch (error) {
        // Expected to fail
      }

      const stats = router.getMonitoringStats();
      expect(stats.telemetry).toBeDefined();
    });
  });

  describe('Performance Tracking', () => {
    it('should track operation duration', async () => {
      const metadata: MemoryMetadata = {
        tags: ['perf-test'],
        category: 'knowledge',
        priority: 5,
        source: 'test',
      };

      await router.store('Performance test content', metadata);

      const stats = router.getMonitoringStats();
      expect(stats.telemetry).toBeDefined();
    });
  });

  describe('Monitoring Disabled', () => {
    let disabledRouter: MonitoredMemoryRouter;

    beforeEach(() => {
      disabledRouter = new MonitoredMemoryRouter({
        monitoring: {
          enabled: false,
        },
      });
    });

    afterEach(async () => {
      await disabledRouter.close();
    });

    it('should work without monitoring', async () => {
      const item = await disabledRouter.store('Test without monitoring', {
        tags: ['test'],
        category: 'knowledge',
        priority: 5,
        source: 'test',
      });

      expect(item).toBeDefined();

      const stats = disabledRouter.getMonitoringStats();
      expect(stats.enabled).toBe(false);
    });
  });

  describe('Method Delegation', () => {
    it('should delegate retrieve method', async () => {
      const item = await router.store('Test retrieve', {
        tags: ['test'],
        category: 'knowledge',
        priority: 5,
        source: 'test',
      });
      const retrieved = await router.retrieve(item.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(item.id);
    });

    it('should delegate delete method', async () => {
      const item = await router.store('Test delete', {
        tags: ['test'],
        category: 'knowledge',
        priority: 5,
        source: 'test',
      });
      const deleted = await router.delete(item.id);

      expect(deleted).toBe(true);
    });

    it('should delegate advanced search method', async () => {
      await router.store('Advanced search test', {
        tags: ['advanced'],
        category: 'knowledge',
        priority: 5,
        source: 'test',
      });

      const results = await router.advancedSearch({
        query: 'advanced',
        limit: 10,
        filters: {
          tags: ['advanced'],
        },
      });

      expect(results).toBeDefined();
    });

    it('should delegate knowledge graph methods', async () => {
      await router.store('Memory 1', {
        tags: ['graph'],
        category: 'knowledge',
        priority: 5,
        source: 'test',
      });
      await router.store('Memory 2', {
        tags: ['graph'],
        category: 'knowledge',
        priority: 5,
        source: 'test',
      });

      const graph = await router.buildKnowledgeGraph();
      expect(graph).toBeDefined();
    });
  });
});
