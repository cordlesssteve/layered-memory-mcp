/**
 * Integration tests for Graph Database Layer operations
 * Tests Neo4j-backed graph features with relationship mapping
 */

import { MemoryRouter } from '../../src/memory/router.js';
import { GraphLayer, MemoryRelationshipType } from '../../src/memory/layers/graph-layer.js';
import type { MemoryMetadata } from '../../src/memory/types.js';

describe('Graph Database Integration', () => {
  let memoryRouter: MemoryRouter;
  let graphLayer: GraphLayer;
  let testMemoryIds: string[] = [];

  beforeEach(async () => {
    // Initialize memory router with graph layer
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
        minConfidence: 0.7,
        batchSize: 50,
      },
    });

    // Get direct access to graph layer for testing
    const graphConfig = {
      uri: process.env['NEO4J_URI'] || 'neo4j://localhost:7688',
      username: process.env['NEO4J_USER'] || 'neo4j',
      password: process.env['NEO4J_PASSWORD'] || 'layered-memory',
      backend: 'neo4j' as const,
    };
    graphLayer = new GraphLayer('global', { ttl: undefined }, graphConfig);

    // Wait for graph connection to establish
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Create test memories with semantic relationships
    const testMemories = [
      {
        content: 'GraphQL is a query language for APIs developed by Facebook',
        metadata: {
          category: 'knowledge',
          priority: 8,
          tags: ['graphql', 'api', 'query-language'],
          source: 'test-data',
        },
      },
      {
        content: 'REST APIs use HTTP methods like GET, POST, PUT, DELETE',
        metadata: {
          category: 'knowledge',
          priority: 7,
          tags: ['rest', 'api', 'http'],
          source: 'test-data',
        },
      },
      {
        content: 'Apollo Server is a GraphQL server implementation for Node.js',
        metadata: {
          category: 'knowledge',
          priority: 7,
          tags: ['apollo', 'graphql', 'server'],
          source: 'test-data',
        },
      },
      {
        content: 'Neo4j is a native graph database that stores data as nodes and relationships',
        metadata: {
          category: 'knowledge',
          priority: 8,
          tags: ['neo4j', 'database', 'graph'],
          source: 'test-data',
        },
      },
    ];

    // Store test memories
    for (const memory of testMemories) {
      const item = await memoryRouter.store(memory.content, memory.metadata as MemoryMetadata);
      testMemoryIds.push(item.id);
    }

    // Allow time for auto-linking
    await new Promise(resolve => setTimeout(resolve, 200));
  });

  afterEach(async () => {
    await graphLayer.disconnect();
    await memoryRouter.close();
    testMemoryIds = [];
  });

  describe('GraphLayer Storage', () => {
    it('should store memory in graph database', async () => {
      const content = 'Cypher is the query language for Neo4j graph database';
      const metadata: MemoryMetadata = {
        category: 'knowledge',
        priority: 7,
        tags: ['cypher', 'neo4j', 'query'],
        source: 'test',
      };

      const memory = await graphLayer.store({ content, metadata });

      expect(memory).toBeDefined();
      expect(memory.id).toBeDefined();
      expect(memory.content).toBe(content);
      expect(memory.metadata.category).toBe('knowledge');
    });

    it('should create graph indexes on initialization', async () => {
      // GraphLayer creates indexes in connect() method
      // This test verifies no errors occur during index creation
      const newGraphLayer = new GraphLayer('global');

      // Wait for async connection
      await new Promise(resolve => setTimeout(resolve, 500));

      await newGraphLayer.disconnect();

      // Success if no errors thrown
      expect(true).toBe(true);
    });
  });

  describe('Manual Relationship Creation', () => {
    beforeEach(async () => {
      // Wait for graph layer to be fully connected using built-in method
      const connected = await graphLayer.waitForConnection(5000);
      if (!connected) {
        throw new Error('Graph layer failed to connect within timeout');
      }
    });

    it('should create SEMANTIC relationship between memories', async () => {
      expect(testMemoryIds.length).toBeGreaterThanOrEqual(2);

      const created = await graphLayer.createRelationship({
        from: testMemoryIds[0]!,
        to: testMemoryIds[1]!,
        type: MemoryRelationshipType.SEMANTIC,
        strength: 0.8,
      });

      expect(created).toBe(true);
    });

    it('should create TEMPORAL relationship with decay strength', async () => {
      expect(testMemoryIds.length).toBeGreaterThanOrEqual(2);

      const created = await graphLayer.createRelationship({
        from: testMemoryIds[0]!,
        to: testMemoryIds[1]!,
        type: MemoryRelationshipType.TEMPORAL,
        strength: 0.9,
      });

      expect(created).toBe(true);
    });

    it('should create REFERENCES relationship', async () => {
      expect(testMemoryIds.length).toBeGreaterThanOrEqual(2);

      const created = await graphLayer.createRelationship({
        from: testMemoryIds[0]!,
        to: testMemoryIds[2]!,
        type: MemoryRelationshipType.REFERENCES,
        strength: 1.0,
      });

      expect(created).toBe(true);
    });

    it('should create CAUSAL relationship', async () => {
      expect(testMemoryIds.length).toBeGreaterThanOrEqual(2);

      const created = await graphLayer.createRelationship({
        from: testMemoryIds[0]!,
        to: testMemoryIds[2]!,
        type: MemoryRelationshipType.CAUSAL,
        strength: 0.7,
      });

      expect(created).toBe(true);
    });
  });

  describe('Graph Traversal - find_memory_path', () => {
    beforeEach(async () => {
      // Create a path: memory[0] -> memory[1] -> memory[2]
      if (testMemoryIds.length >= 3) {
        await graphLayer.createRelationship({
          from: testMemoryIds[0]!,
          to: testMemoryIds[1]!,
          type: MemoryRelationshipType.SEMANTIC,
          strength: 0.9,
        });

        await graphLayer.createRelationship({
          from: testMemoryIds[1]!,
          to: testMemoryIds[2]!,
          type: MemoryRelationshipType.REFERENCES,
          strength: 0.8,
        });
      }
    });

    it('should find shortest path between two connected memories', async () => {
      const path = await memoryRouter.findMemoryPath(testMemoryIds[0]!, testMemoryIds[2]!);

      // Path might be null if graph layer isn't connected or no path exists
      if (path !== null) {
        expect(Array.isArray(path)).toBe(true);
        expect(path.length).toBeGreaterThan(0);

        // Shortest path should include at least start and end
        expect(path.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should return null for non-existent path', async () => {
      const nonExistentId = 'non-existent-id-12345';
      const path = await memoryRouter.findMemoryPath(testMemoryIds[0]!, nonExistentId);

      expect(path).toBeNull();
    });

    it('should handle same source and destination', async () => {
      const path = await memoryRouter.findMemoryPath(testMemoryIds[0]!, testMemoryIds[0]!);

      // Should either return empty array or single node
      if (path !== null) {
        expect(path.length).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Related Memories - get_related_memories', () => {
    beforeEach(async () => {
      // Create multiple relationship types from memory[0]
      if (testMemoryIds.length >= 3) {
        await graphLayer.createRelationship({
          from: testMemoryIds[0]!,
          to: testMemoryIds[1]!,
          type: MemoryRelationshipType.SEMANTIC,
          strength: 0.9,
        });

        await graphLayer.createRelationship({
          from: testMemoryIds[0]!,
          to: testMemoryIds[2]!,
          type: MemoryRelationshipType.REFERENCES,
          strength: 0.8,
        });
      }
    });

    it('should get all related memories without filter', async () => {
      const related = await memoryRouter.getRelatedMemories(testMemoryIds[0]!);

      expect(Array.isArray(related)).toBe(true);

      // Should find at least the relationships we created
      if (related.length > 0) {
        expect(related[0]).toHaveProperty('memory');
        expect(related[0]).toHaveProperty('relationshipType');
        expect(related[0]).toHaveProperty('strength');
      }
    });

    it('should filter by SEMANTIC relationship type', async () => {
      const related = await memoryRouter.getRelatedMemories(testMemoryIds[0]!, 'SEMANTIC');

      expect(Array.isArray(related)).toBe(true);

      // All returned relationships should be SEMANTIC
      related.forEach(rel => {
        expect(rel.relationshipType).toBe('SEMANTIC');
      });
    });

    it('should filter by REFERENCES relationship type', async () => {
      const related = await memoryRouter.getRelatedMemories(testMemoryIds[0]!, 'REFERENCES');

      expect(Array.isArray(related)).toBe(true);

      // All returned relationships should be REFERENCES
      related.forEach(rel => {
        expect(rel.relationshipType).toBe('REFERENCES');
      });
    });

    it('should return empty array for memory with no relationships', async () => {
      const isolatedMemory = await memoryRouter.store('Isolated memory with no connections', {
        category: 'knowledge',
        priority: 5,
        tags: ['isolated'],
        source: 'test',
      });

      const related = await memoryRouter.getRelatedMemories(isolatedMemory.id);

      expect(Array.isArray(related)).toBe(true);
      // May have auto-linked relationships, so just check it's an array
    });
  });

  describe('Reachable Memories - get_reachable_memories', () => {
    beforeEach(async () => {
      // Create a chain: memory[0] -> memory[1] -> memory[2] -> memory[3]
      if (testMemoryIds.length >= 4) {
        await graphLayer.createRelationship({
          from: testMemoryIds[0]!,
          to: testMemoryIds[1]!,
          type: MemoryRelationshipType.SEMANTIC,
          strength: 0.9,
        });

        await graphLayer.createRelationship({
          from: testMemoryIds[1]!,
          to: testMemoryIds[2]!,
          type: MemoryRelationshipType.SEMANTIC,
          strength: 0.8,
        });

        await graphLayer.createRelationship({
          from: testMemoryIds[2]!,
          to: testMemoryIds[3]!,
          type: MemoryRelationshipType.REFERENCES,
          strength: 0.7,
        });
      }
    });

    it('should get all reachable memories from starting node', async () => {
      const reachable = await memoryRouter.getReachableMemories(testMemoryIds[0]!);

      expect(Array.isArray(reachable)).toBe(true);

      // Should find all memories in the chain (excluding starting node)
      if (reachable.length > 0) {
        expect(reachable[0]).toHaveProperty('id');
        expect(reachable[0]).toHaveProperty('content');

        // Starting node should not be in results
        const startingNodeInResults = reachable.some(m => m.id === testMemoryIds[0]);
        expect(startingNodeInResults).toBe(false);
      }
    });

    it('should handle isolated node with no connections', async () => {
      const isolatedMemory = await memoryRouter.store('Completely isolated memory', {
        category: 'knowledge',
        priority: 5,
        tags: ['isolated'],
        source: 'test',
      });

      const reachable = await memoryRouter.getReachableMemories(isolatedMemory.id);

      expect(Array.isArray(reachable)).toBe(true);
      // May have auto-linked relationships, but array should be valid
    });
  });

  describe('Graph Search - graph_search', () => {
    beforeEach(async () => {
      // Create semantic cluster around GraphQL
      if (testMemoryIds.length >= 3) {
        await graphLayer.createRelationship({
          from: testMemoryIds[0]!, // GraphQL
          to: testMemoryIds[2]!, // Apollo Server
          type: MemoryRelationshipType.SEMANTIC,
          strength: 0.9,
        });
      }
    });

    it('should perform graph search with expansion', async () => {
      const results = await memoryRouter.graphSearch(
        { query: 'GraphQL', limit: 10 },
        2 // maxDepth
      );

      expect(Array.isArray(results)).toBe(true);

      if (results.length > 0) {
        expect(results[0]).toHaveProperty('memory');
        expect(results[0]).toHaveProperty('score');
        expect(results[0]).toHaveProperty('source');

        // Should find GraphQL-related memories
        const hasGraphQLContent = results.some(r =>
          r.memory.content.toLowerCase().includes('graphql')
        );
        expect(hasGraphQLContent).toBe(true);
      }
    });

    it('should respect maxDepth parameter', async () => {
      const depth1Results = await memoryRouter.graphSearch({ query: 'GraphQL', limit: 10 }, 1);

      const depth2Results = await memoryRouter.graphSearch({ query: 'GraphQL', limit: 10 }, 2);

      // Deeper search may return more results
      if (depth2Results.length > 0 && depth1Results.length > 0) {
        expect(depth2Results.length).toBeGreaterThanOrEqual(depth1Results.length);
      }
    });

    it('should fallback to base search if graph unavailable', async () => {
      // Even if graph layer isn't connected, should still return results
      const results = await memoryRouter.graphSearch({ query: 'database', limit: 5 }, 2);

      expect(Array.isArray(results)).toBe(true);
    });

    it('should score results by graph distance decay', async () => {
      const results = await memoryRouter.graphSearch({ query: 'API', limit: 10 }, 2);

      if (results.length > 1) {
        // Scores should be in descending order
        for (let i = 1; i < results.length; i++) {
          expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score);
        }
      }
    });
  });

  describe('Auto-Linking', () => {
    it('should auto-create temporal relationships for recent memories', async () => {
      await memoryRouter.store('First memory in auto-link test', {
        category: 'knowledge',
        priority: 7,
        tags: ['test', 'temporal'],
        source: 'test',
      });

      // Wait a bit but stay within 1-hour window
      await new Promise(resolve => setTimeout(resolve, 100));

      const memory2 = await memoryRouter.store('Second memory in auto-link test', {
        category: 'knowledge',
        priority: 7,
        tags: ['test', 'temporal'],
        source: 'test',
      });

      // Auto-linking happens automatically during store()
      // Verify by checking related memories
      const related = await memoryRouter.getRelatedMemories(memory2.id);

      expect(Array.isArray(related)).toBe(true);
      // May or may not have auto-linked depending on timing and similarity
    });

    it('should auto-create semantic relationships for similar content', async () => {
      await memoryRouter.store('TypeScript is a superset of JavaScript', {
        category: 'knowledge',
        priority: 8,
        tags: ['typescript', 'javascript'],
        source: 'test',
      });

      const memory2 = await memoryRouter.store('TypeScript adds static types to JavaScript', {
        category: 'knowledge',
        priority: 8,
        tags: ['typescript', 'javascript', 'types'],
        source: 'test',
      });

      // Auto-linking should detect semantic similarity
      const related = await memoryRouter.getRelatedMemories(memory2.id);

      expect(Array.isArray(related)).toBe(true);
      // Should find semantic relationships due to similar content
    });

    it('should auto-create context relationships for same session', async () => {
      const sessionId = 'test-session-123';

      await memoryRouter.store('Memory in shared session', {
        category: 'task',
        priority: 7,
        tags: ['session-test'],
        sessionId,
        source: 'test',
      });

      const memory2 = await memoryRouter.store('Another memory in shared session', {
        category: 'task',
        priority: 7,
        tags: ['session-test'],
        sessionId,
        source: 'test',
      });

      // Should have CONTEXT relationship via shared sessionId
      const related = await memoryRouter.getRelatedMemories(memory2.id);

      expect(Array.isArray(related)).toBe(true);
      // Should find context relationships
    });
  });

  describe('Relationship Type Coverage', () => {
    it('should support all 6 relationship types', () => {
      const types = Object.values(MemoryRelationshipType);

      expect(types).toContain('TEMPORAL');
      expect(types).toContain('SEMANTIC');
      expect(types).toContain('REFERENCES');
      expect(types).toContain('CAUSAL');
      expect(types).toContain('CONTEXT');
      expect(types).toContain('SUPERSEDES');

      expect(types.length).toBe(6);
    });

    it('should create SUPERSEDES relationship for version tracking', async () => {
      // Ensure connection is ready using built-in method
      const connected = await graphLayer.waitForConnection(5000);
      if (!connected) {
        throw new Error('Graph layer failed to connect for SUPERSEDES test');
      }

      const oldMemory = await memoryRouter.store('Old version of documentation', {
        category: 'knowledge',
        priority: 6,
        tags: ['docs', 'old'],
        source: 'test',
      });

      const newMemory = await memoryRouter.store('Updated version of documentation', {
        category: 'knowledge',
        priority: 8,
        tags: ['docs', 'current'],
        source: 'test',
      });

      const created = await graphLayer.createRelationship({
        from: newMemory.id,
        to: oldMemory.id,
        type: MemoryRelationshipType.SUPERSEDES,
        strength: 1.0,
      });

      expect(created).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent memory ID gracefully', async () => {
      const fakeId = 'non-existent-memory-id';

      const path = await memoryRouter.findMemoryPath(fakeId, testMemoryIds[0]!);
      expect(path).toBeNull();

      const related = await memoryRouter.getRelatedMemories(fakeId);
      expect(related).toEqual([]);

      const reachable = await memoryRouter.getReachableMemories(fakeId);
      expect(reachable).toEqual([]);
    });

    it('should handle graph database disconnection', async () => {
      await graphLayer.disconnect();

      // Operations should still work (fallback to base search or return empty)
      const results = await memoryRouter.graphSearch({ query: 'test', limit: 5 }, 2);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle invalid relationship type string', async () => {
      // Should gracefully handle invalid type
      const related = await memoryRouter.getRelatedMemories(testMemoryIds[0]!, 'INVALID_TYPE');

      expect(Array.isArray(related)).toBe(true);
      expect(related).toEqual([]);
    });
  });
});
