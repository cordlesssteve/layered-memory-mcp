/**
 * Integration tests for Memory Router
 */

import { MemoryRouter } from '../router.js';
import { createMockMetadata, createTemporaryDirectory } from './test-utils.js';
import type { MemoryEvent } from '../types.js';

describe('MemoryRouter', () => {
  let router: MemoryRouter;
  const testConfig = {
      sessionLayer: {
        maxItems: 20,
        maxSizeBytes: 512 * 1024,
        ttl: undefined,
        compressionEnabled: false,
        indexingEnabled: true,
      },
      projectLayer: {
        maxItems: 100,
        maxSizeBytes: 2 * 1024 * 1024,
        ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
        compressionEnabled: true,
        indexingEnabled: true,
      },
      globalLayer: {
        maxItems: 1000,
        maxSizeBytes: 50 * 1024 * 1024,
        ttl: 365 * 24 * 60 * 60 * 1000, // 1 year
        compressionEnabled: true,
        indexingEnabled: true,
      },
      temporalLayer: {
        maxItems: 10000,
        maxSizeBytes: 100 * 1024 * 1024,
        ttl: undefined, // No expiration
        compressionEnabled: true,
        indexingEnabled: true,
      },
      routing: {
        sessionThreshold: 0.8,
        projectThreshold: 0.6,
        globalThreshold: 0.4,
        temporalFallback: true,
        maxResults: 15,
        scoringWeights: {
          recency: 0.3,
          frequency: 0.2,
          relevance: 0.4,
          priority: 0.1,
        },
      },
    };

  beforeEach(() => {
    createTemporaryDirectory();
    router = new MemoryRouter(testConfig);
  });

  afterEach(async () => {
    await router.close();
  });

  describe('Initialization', () => {
    it('should initialize all layers correctly', () => {
      expect(router.getLayer('session')).toBeDefined();
      expect(router.getLayer('project')).toBeDefined();
      expect(router.getLayer('global')).toBeDefined();
      expect(router.getLayer('temporal')).toBeDefined();
    });

    it('should throw error for invalid layer', () => {
      expect(() => router.getLayer('invalid' as any)).toThrow();
    });
  });

  describe('Intelligent Storage Routing', () => {
    it('should route low priority items to session layer', async () => {
      const item = await router.store('Low priority content', createMockMetadata({
        priority: 3,
        category: 'temporary',
      }));

      expect(item).toBeDefined();
      expect(item.metadata.priority).toBe(3);

      // Should be findable in session layer
      const sessionLayer = router.getLayer('session');
      const retrieved = await sessionLayer.retrieve(item.id);
      expect(retrieved).not.toBeNull();
    });

    it('should route high priority items to global layer', async () => {
      const item = await router.store('High priority content', createMockMetadata({
        priority: 9,
        category: 'important',
      }));

      expect(item).toBeDefined();
      expect(item.metadata.priority).toBe(9);

      // Should be findable in global layer
      const globalLayer = router.getLayer('global');
      const retrieved = await globalLayer.retrieve(item.id);
      expect(retrieved).not.toBeNull();
    });

    it('should route medium priority items to project layer', async () => {
      const item = await router.store('Medium priority content', createMockMetadata({
        priority: 6,
        category: 'project-specific',
        projectId: 'test-project',
      }));

      expect(item).toBeDefined();
      expect(item.metadata.priority).toBe(6);

      // Should be findable in project layer
      const projectLayer = router.getLayer('project');
      const retrieved = await projectLayer.retrieve(item.id);
      expect(retrieved).not.toBeNull();
    });

    it('should route based on content size', async () => {
      const largeContent = 'A'.repeat(10000); // 10KB content

      const item = await router.store(largeContent, createMockMetadata({
        priority: 4, // Would normally go to session
      }));

      // Large content should be routed to persistent layer
      const projectLayer = router.getLayer('project');

      const inProject = await projectLayer.retrieve(item.id);

      // Should be in project layer due to size
      expect(inProject).not.toBeNull();
    });

    it('should route based on tags', async () => {
      const item = await router.store('Important reference material', createMockMetadata({
        priority: 5,
        tags: ['important', 'reference'],
      }));

      // Should be routed to global layer due to tags
      const globalLayer = router.getLayer('global');
      const retrieved = await globalLayer.retrieve(item.id);
      expect(retrieved).not.toBeNull();
    });
  });

  describe('Cross-Layer Search', () => {
    beforeEach(async () => {
      // Populate different layers with test data
      const testData = [
        { content: 'Session memory about current task', metadata: createMockMetadata({ priority: 2, category: 'session' }) },
        { content: 'Project-specific implementation details', metadata: createMockMetadata({ priority: 6, category: 'project', projectId: 'test-project' }) },
        { content: 'Global knowledge about best practices', metadata: createMockMetadata({ priority: 8, category: 'knowledge' }) },
        { content: 'Historical analysis of previous decisions', metadata: createMockMetadata({ priority: 4, category: 'analysis' }) },
      ];

      for (const data of testData) {
        await router.store(data.content, data.metadata);
      }
    });

    it('should search across all layers', async () => {
      const results = await router.search({ query: 'test', limit: 10 });

      expect(results.length).toBeGreaterThan(0);

      // Should have results from multiple layers
      const layers = new Set(results.map(r => r.source));
      expect(layers.size).toBeGreaterThan(1);
    });

    it('should merge and rank results by relevance', async () => {
      const results = await router.search({ query: 'implementation project', limit: 10 });

      expect(results.length).toBeGreaterThan(0);

      // Results should be sorted by score
      for (let i = 1; i < results.length; i++) {
        expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score);
      }
    });

    it('should apply filters across layers', async () => {
      const results = await router.search({
        query: '',
        filters: { category: 'project' },
        limit: 10,
      });

      expect(results.every(r => r.memory.metadata.category === 'project')).toBe(true);
    });

    it('should respect result limits', async () => {
      const results = await router.search({ query: 'test', limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should deduplicate similar results', async () => {
      // Create a fresh router to avoid interference from beforeEach data
      const freshRouter = new MemoryRouter(testConfig);

      // Store identical content in different layers
      const uniqueContent = 'UniqueContentForDeduplicationTestOnly12345';
      await freshRouter.store(uniqueContent, createMockMetadata({ priority: 2 }));
      await freshRouter.store(uniqueContent, createMockMetadata({ priority: 8 }));

      const results = await freshRouter.search({ query: uniqueContent });

      // Should have only one result due to deduplication
      expect(results.length).toBe(1);
      expect(results[0]?.memory.content).toBe(uniqueContent);

      await freshRouter.close();
    });
  });

  describe('Query Analysis', () => {
    it('should analyze simple queries', async () => {
      const analysis = await router.analyze('hello world');

      expect(analysis.queryComplexity).toBe('simple');
      expect(analysis.suggestedLayers).toContain('session');
      expect(analysis.estimatedResults).toBeGreaterThanOrEqual(0);
      expect(analysis.recommendedFilters).toBeDefined();
      expect(Array.isArray(analysis.relatedQueries)).toBe(true);
    });

    it('should analyze complex queries', async () => {
      const complexQuery = 'Find all implementation details related to authentication and security best practices including error handling and validation patterns';

      const analysis = await router.analyze(complexQuery);

      expect(analysis.queryComplexity).toBe('complex');
      expect(analysis.suggestedLayers.length).toBeGreaterThan(2);
      expect(analysis.recommendedFilters).toBeDefined();
    });

    it('should suggest appropriate layers based on keywords', async () => {
      const historicalQuery = 'show me past decisions and history';
      const analysis = await router.analyze(historicalQuery);

      expect(analysis.suggestedLayers).toContain('temporal');
    });
  });

  describe('Statistics and Analytics', () => {
    it('should provide comprehensive statistics', async () => {
      // Add data to different layers
      await router.store('Session data', createMockMetadata({ priority: 2 }));
      await router.store('Project data', createMockMetadata({ priority: 6 }));
      await router.store('Global data', createMockMetadata({ priority: 8 }));

      const stats = await router.getAllStats();

      expect(stats.session).toBeDefined();
      expect(stats.project).toBeDefined();
      expect(stats.global).toBeDefined();
      expect(stats.temporal).toBeDefined();

      expect(stats.session.totalItems).toBeGreaterThanOrEqual(0);
      expect(stats.project.totalItems).toBeGreaterThanOrEqual(0);
      expect(stats.global.totalItems).toBeGreaterThanOrEqual(0);
      expect(stats.temporal.totalItems).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Event System', () => {
    it('should emit events for memory operations', async () => {
      const events: MemoryEvent[] = [];

      router.addEventListener((event) => {
        events.push(event);
      });

      await router.store('Test content', createMockMetadata());
      await router.search({ query: 'test' });

      expect(events.length).toBe(2);
      expect(events[0]!.type).toBe('store');
      expect(events[1]!.type).toBe('search');
    });

    it('should support multiple event listeners', async () => {
      let listener1Called = false;
      let listener2Called = false;

      router.addEventListener(() => { listener1Called = true; });
      router.addEventListener(() => { listener2Called = true; });

      await router.store('Test content', createMockMetadata());

      expect(listener1Called).toBe(true);
      expect(listener2Called).toBe(true);
    });

    it('should support removing event listeners', async () => {
      let called = false;
      const listener = () => { called = true; };

      router.addEventListener(listener);
      router.removeEventListener(listener);

      await router.store('Test content', createMockMetadata());

      expect(called).toBe(false);
    });
  });

  describe('Memory Lifecycle Operations', () => {
    it('should retrieve items from any layer', async () => {
      const sessionItem = await router.store('Session content', createMockMetadata({ priority: 2 }));
      const globalItem = await router.store('Global content', createMockMetadata({ priority: 8 }));

      const retrievedSession = await router.retrieve(sessionItem.id);
      const retrievedGlobal = await router.retrieve(globalItem.id);

      expect(retrievedSession).not.toBeNull();
      expect(retrievedGlobal).not.toBeNull();
      expect(retrievedSession!.content).toBe('Session content');
      expect(retrievedGlobal!.content).toBe('Global content');
    });

    it('should update items across layers', async () => {
      const item = await router.store('Original content', createMockMetadata({ priority: 5 }));

      const updated = await router.update(item.id, {
        content: 'Updated content',
      });

      expect(updated).not.toBeNull();
      expect(updated!.content).toBe('Updated content');
    });

    it('should delete items from any layer', async () => {
      const item = await router.store('To be deleted', createMockMetadata({ priority: 5 }));

      const deleted = await router.delete(item.id);
      expect(deleted).toBe(true);

      const retrieved = await router.retrieve(item.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('Optimization and Maintenance', () => {
    it('should optimize all layers', async () => {
      // Add some data
      for (let i = 0; i < 5; i++) {
        await router.store(`Content ${i}`, createMockMetadata({ priority: i + 3 }));
      }

      // Should not throw
      await router.optimize();
    });

    it('should cleanup expired items across layers', async () => {
      const cleanupResults = await router.cleanup();

      expect(cleanupResults.session).toBeGreaterThanOrEqual(0);
      expect(cleanupResults.project).toBeGreaterThanOrEqual(0);
      expect(cleanupResults.global).toBeGreaterThanOrEqual(0);
      expect(cleanupResults.temporal).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid layer access gracefully', () => {
      expect(() => router.getLayer('invalid' as any)).toThrow('Layer invalid not available');
    });

    it('should handle search errors gracefully', async () => {
      // This should not throw even if some layers have issues
      const results = await router.search({ query: 'test' });
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Resource Management', () => {
    it('should close cleanly', async () => {
      await router.store('Test content', createMockMetadata());

      // Should not throw
      await router.close();
    });

    it('should handle multiple close calls', async () => {
      await router.close();
      await router.close(); // Should not throw
    });
  });
});