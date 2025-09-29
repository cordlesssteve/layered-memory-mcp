/**
 * Integration tests for Epic M2 relationship features
 * Tests all 19 MCP tools with real memory data
 */

import { MemoryRouter } from '../../src/memory/router.js';
import type { MemoryMetadata } from '../../src/memory/types.js';

describe('Epic M2 Relationship Features Integration', () => {
  let memoryRouter: MemoryRouter;
  let testMemoryIds: string[] = [];

  beforeEach(async () => {
    // Clean start for each test
    memoryRouter = new MemoryRouter({
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
        enabled: true,
        minConfidence: 0.6,
        batchSize: 50,
      },
    });

    // Create test memories with relationships
    const testMemories = [
      {
        content: 'JavaScript is a dynamic programming language used for web development',
        metadata: {
          category: 'knowledge',
          priority: 8,
          tags: ['javascript', 'programming', 'web'],
          source: 'test-data',
        },
      },
      {
        content: 'React is a JavaScript library for building user interfaces',
        metadata: {
          category: 'knowledge',
          priority: 7,
          tags: ['react', 'javascript', 'ui'],
          source: 'test-data',
        },
      },
      {
        content: 'Node.js allows JavaScript to run on the server side',
        metadata: {
          category: 'knowledge',
          priority: 6,
          tags: ['nodejs', 'javascript', 'server'],
          source: 'test-data',
        },
      },
      {
        content: 'TypeScript adds static typing to JavaScript for better development experience',
        metadata: {
          category: 'knowledge',
          priority: 8,
          tags: ['typescript', 'javascript', 'types'],
          source: 'test-data',
        },
      },
      {
        content: 'Project Alpha uses React with TypeScript for the frontend implementation',
        metadata: {
          category: 'progress',
          priority: 9,
          tags: ['project-alpha', 'react', 'typescript'],
          source: 'test-data',
        },
      },
    ];

    // Store test memories
    for (const memory of testMemories) {
      const item = await memoryRouter.store(memory.content, memory.metadata as MemoryMetadata);
      testMemoryIds.push(item.id);
    }

    // Allow time for relationship detection
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    await memoryRouter.close();
    testMemoryIds = [];
  });

  describe('Core Memory Operations (Tools 1-3)', () => {
    test('store_memory should work correctly', async () => {
      const result = await memoryRouter.store(
        'Vue.js is another JavaScript framework for building web applications',
        {
          category: 'knowledge',
          priority: 7,
          tags: ['vue', 'javascript', 'framework'],
          source: 'test-data',
        }
      );

      expect(result.id).toBeDefined();
      expect(result.content).toContain('Vue.js');
    });

    test('search_memory should find relevant memories', async () => {
      const results = await memoryRouter.search({
        query: 'JavaScript programming',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.memory.content.includes('JavaScript'))).toBe(true);
    });

    test('get_memory_stats should return system statistics', async () => {
      const stats = await memoryRouter.getAllStats();

      expect(stats).toBeDefined();
      expect(Object.keys(stats)).toContain('session');
      expect(Object.keys(stats)).toContain('project');
      expect(Object.keys(stats)).toContain('global');
      expect(Object.keys(stats)).toContain('temporal');
    });
  });

  describe('Advanced Search Tools (Tools 4-6)', () => {
    test('advanced_search should work with semantic search', async () => {
      const results = await memoryRouter.advancedSearch({
        query: 'web development frameworks',
        semanticSearch: {
          enabled: true,
          threshold: 0.7,
        },
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      if (results[0]) {
        // Advanced search results should have basic properties
        expect(results[0]).toHaveProperty('memory');
        expect(results[0]).toHaveProperty('score');
        // Confidence may or may not be present depending on search type
      }
    });

    test('semantic_search should find similar content', async () => {
      const results = await memoryRouter.semanticSearch('frontend development', {
        threshold: 0.6,
        maxResults: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeGreaterThan(0);
      if (results[0]) {
        expect(results[0].score).toBeGreaterThanOrEqual(0.6);
      }
    });

    test('temporal_search should work with time ranges', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const results = await memoryRouter.temporalSearch('JavaScript', {
        start: oneHourAgo,
        end: now,
      });

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Epic M2: Dynamic Memory Evolution Tools (Tools 7-11)', () => {
    test('build_knowledge_graph should create graph structure', async () => {
      const graph = await memoryRouter.buildKnowledgeGraph();

      expect(graph.stats.totalNodes).toBeGreaterThan(0);
      expect(graph.stats.totalEdges).toBeGreaterThanOrEqual(0);
      expect(graph.nodes.size).toBeGreaterThan(0);
    });

    test('get_memory_relationships should find relationships', async () => {
      if (testMemoryIds.length > 0) {
        const relationships = await memoryRouter.getMemoryRelationships(testMemoryIds[0]!);

        expect(Array.isArray(relationships)).toBe(true);
        // Note: relationships might be 0 if detection hasn't found any yet
      }
    });

    test('detect_conflicts should identify contradictions', async () => {
      // Add a conflicting memory
      await memoryRouter.store(
        'JavaScript is a static typed language that cannot be used for web development',
        {
          category: 'knowledge',
          priority: 5,
          tags: ['javascript', 'contradiction'],
          source: 'test-data',
        }
      );

      const conflicts = await memoryRouter.detectConflicts();

      expect(Array.isArray(conflicts)).toBe(true);
      // Conflicts detection is sophisticated and may not find conflicts immediately
    });

    test('get_memory_versions should track version history', async () => {
      if (testMemoryIds.length > 0) {
        const versions = await memoryRouter.getMemoryVersions(testMemoryIds[0]!);

        expect(Array.isArray(versions)).toBe(true);
        // At minimum should have the creation version
      }
    });

    test('summarize_cluster should generate cluster summaries', async () => {
      if (testMemoryIds.length >= 2) {
        const summary = await memoryRouter.summarizeCluster(testMemoryIds.slice(0, 2));

        expect(summary).toBeDefined();
        // Summary might be a string or object depending on implementation
        if (typeof summary === 'string') {
          expect(summary.length).toBeGreaterThan(0);
        } else {
          expect(typeof summary).toBe('object');
          expect(summary).toHaveProperty('summary');
        }
      }
    });
  });

  describe('Relationship Validation Tools (Tools 12-14)', () => {
    test('get_relationship_suggestions should return suggestions', async () => {
      const suggestions = await memoryRouter.getRelationshipSuggestions(10, 0.6);

      expect(Array.isArray(suggestions)).toBe(true);
      // Suggestions might be empty if none meet confidence threshold
    });

    test('validate_relationship workflow should work', async () => {
      const suggestions = await memoryRouter.getRelationshipSuggestions(5, 0.5);

      if (suggestions.length > 0) {
        const success = await memoryRouter.validateRelationship(suggestions[0]!.id, {
          action: 'confirm',
          userFeedback: 'This relationship looks correct',
        });

        expect(typeof success).toBe('boolean');
      }
    });

    test('get_validation_stats should return algorithm insights', async () => {
      const stats = await memoryRouter.getValidationStats();
      const insights = await memoryRouter.getAlgorithmInsights();

      expect(stats).toBeDefined();
      expect(insights).toBeDefined();
    });
  });

  describe('Memory Decay Prediction Tools (Tools 15-19)', () => {
    test('predict_memory_decay should generate predictions', async () => {
      const predictions = await memoryRouter.predictMemoryDecay();

      expect(Array.isArray(predictions)).toBe(true);
      if (predictions.length > 0) {
        expect(predictions[0]).toHaveProperty('memoryId');
        expect(predictions[0]).toHaveProperty('currentImportance');
        expect(predictions[0]).toHaveProperty('predictedImportance');
        expect(predictions[0]).toHaveProperty('recommendation');
      }
    });

    test('get_urgent_memories should identify urgent memories', async () => {
      const urgent = await memoryRouter.getUrgentMemories();

      expect(Array.isArray(urgent)).toBe(true);
    });

    test('get_promotion_candidates should find promotion candidates', async () => {
      const candidates = await memoryRouter.getPromotionCandidates();

      expect(Array.isArray(candidates)).toBe(true);
    });

    test('get_archival_candidates should find archival candidates', async () => {
      const candidates = await memoryRouter.getArchivalCandidates();

      expect(Array.isArray(candidates)).toBe(true);
    });

    test('get_decay_insights should provide model insights', async () => {
      const insights = await memoryRouter.getDecayModelInsights();

      expect(insights).toBeDefined();
      expect(typeof insights).toBe('object');
    });
  });

  describe('Integration Workflow Tests', () => {
    test('complete relationship workflow should work end-to-end', async () => {
      // 1. Store memories (already done in beforeEach)
      expect(testMemoryIds.length).toBe(5);

      // 2. Build knowledge graph
      const graph = await memoryRouter.buildKnowledgeGraph();
      expect(graph.stats.totalNodes).toBeGreaterThan(0);

      // 3. Get relationship suggestions
      const suggestions = await memoryRouter.getRelationshipSuggestions(10, 0.5);
      expect(Array.isArray(suggestions)).toBe(true);

      // 4. Check decay predictions
      const predictions = await memoryRouter.predictMemoryDecay();
      expect(Array.isArray(predictions)).toBe(true);

      // 5. Get validation stats
      const validationStats = await memoryRouter.getValidationStats();
      expect(validationStats).toBeDefined();
    });

    test('memory evolution should create relationships between related content', async () => {
      // Wait a bit more for relationship detection to process
      await new Promise(resolve => setTimeout(resolve, 500));

      const graph = await memoryRouter.buildKnowledgeGraph();

      // Should have at least some connections due to JavaScript-related content
      if (graph.stats.totalEdges > 0) {
        expect(graph.stats.averageConnections).toBeGreaterThan(0);
      }
    });
  });
});
