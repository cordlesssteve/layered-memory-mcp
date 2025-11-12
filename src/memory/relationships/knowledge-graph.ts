/**
 * Knowledge Graph construction and analysis engine
 */

import { createLogger } from '../../utils/logger.js';
import type { MemoryItem } from '../types.js';
import type { MemoryRelationship, KnowledgeGraph, GraphNode } from './types.js';
import { RelationshipPerformanceOptimizer } from './performance-optimizer.js';
// import { TextAnalyzer } from './text-analyzer.js'; // Temporarily commented out

const logger = createLogger('knowledge-graph');

export class KnowledgeGraphEngine {
  // private textAnalyzer = new TextAnalyzer(); // Temporarily commented out to resolve unused variable
  private performanceOptimizer = new RelationshipPerformanceOptimizer({
    enableCaching: true,
    cacheMaxSize: 100,
    batchSize: 200,
    maxProcessingTime: 20000, // 20 seconds max for graph construction
    enableParallelProcessing: true,
    maxConcurrentBatches: 2,
    optimizationLevel: 'aggressive',
    enableLazyLoading: true,
    memoryThresholdMB: 512,
  });

  private graphCache = new Map<string, KnowledgeGraph>();

  async buildKnowledgeGraph(
    memories: MemoryItem[],
    relationships: Map<string, MemoryRelationship>
  ): Promise<KnowledgeGraph> {
    logger.info('Building knowledge graph from memories and relationships');

    // Check cache first
    const cacheKey = `graph:${memories.map(m => m.id).sort().join(',')}:${Array.from(relationships.keys()).sort().join(',')}`;
    const cachedGraph = this.graphCache.get(cacheKey);
    if (cachedGraph) {
      logger.debug('Cache hit for knowledge graph');
      return cachedGraph;
    }

    // Use adaptive filtering for large datasets
    const filteredMemories = this.performanceOptimizer.filterMemoriesAdaptively(
      memories,
      {
        minPriority: 1, // Include most memories for graph construction
        maxResults: 5000, // Limit for graph performance
      }
    );

    logger.debug(`Filtered ${memories.length} memories to ${filteredMemories.length} for graph construction`);

    const graph: KnowledgeGraph = {
      nodes: new Map(),
      edges: new Map(),
      stats: { totalNodes: 0, totalEdges: 0, averageConnections: 0, topCentralNodes: [] }
    };

    // Create nodes in batches for large datasets
    await this.performanceOptimizer.processBatches(
      filteredMemories,
      async (memoryBatch: MemoryItem[]) => {
        for (const memory of memoryBatch) {
          const node: GraphNode = {
            memoryId: memory.id,
            memory,
            connections: [],
            centrality: 0,
            importance: 0,
          };
          graph.nodes.set(memory.id, node);
        }
        return []; // No return needed for node creation
      },
      () => [] // No combining needed
    );

    // Add edges from relationships
    for (const relationship of relationships.values()) {
      const sourceNode = graph.nodes.get(relationship.sourceMemoryId);
      const targetNode = graph.nodes.get(relationship.targetMemoryId);

      if (sourceNode && targetNode) {
        sourceNode.connections.push(relationship.id);
        targetNode.connections.push(relationship.id);
        graph.edges.set(relationship.id, relationship);
      }
    }

    // Calculate node metrics
    await this.calculateNodeMetrics(graph);

    // Update graph statistics
    this.updateGraphStats(graph);

    logger.info('Knowledge graph built', {
      nodes: graph.stats.totalNodes,
      edges: graph.stats.totalEdges,
      avgConnections: graph.stats.averageConnections,
    });

    // Cache the completed graph
    this.graphCache.set(cacheKey, graph);

    // Manage cache size
    if (this.graphCache.size > 50) { // Keep cache reasonable
      const firstKey = this.graphCache.keys().next().value;
      if (firstKey) {
        this.graphCache.delete(firstKey);
      }
    }

    return graph;
  }

  private async calculateNodeMetrics(graph: KnowledgeGraph): Promise<void> {
    // Performance: Batch process recency scores to avoid repeated calculations
    const now = new Date();

    for (const node of graph.nodes.values()) {
      // Performance: Pre-calculate connection count for faster centrality computation
      const connectionCount = node.connections.length;

      // Calculate centrality based on connection count (simplified for performance)
      node.centrality = Math.min(1, connectionCount / 10); // Normalize to 0-1

      // Performance: Simplified importance calculation to reduce computation
      const priority = node.memory.metadata.priority / 10; // Normalize to 0-1
      const accessFrequency = Math.min(1, node.memory.accessCount / 100); // Normalize
      const relationshipScore = node.centrality;

      // Performance: Optimized recency calculation with proper date handling
      const lastAccessDate = node.memory.lastAccessedAt instanceof Date
        ? node.memory.lastAccessedAt
        : new Date(node.memory.lastAccessedAt);
      const daysSinceAccess = (now.getTime() - lastAccessDate.getTime()) / (1000 * 60 * 60 * 24);
      const recencyScore = Math.max(0, Math.min(1, 1 - daysSinceAccess / 30)); // 30-day decay

      node.importance =
        priority * 0.3 + accessFrequency * 0.2 + relationshipScore * 0.3 + recencyScore * 0.2;
    }
  }

  private updateGraphStats(graph: KnowledgeGraph): void {
    graph.stats.totalNodes = graph.nodes.size;
    graph.stats.totalEdges = graph.edges.size;

    if (graph.stats.totalNodes > 0) {
      graph.stats.averageConnections =
        Array.from(graph.nodes.values()).reduce(
          (sum, node) => sum + node.connections.length,
          0
        ) / graph.stats.totalNodes;
    }

    // Find top central nodes
    graph.stats.topCentralNodes = Array.from(graph.nodes.values())
      .sort((a, b) => b.centrality - a.centrality)
      .slice(0, 5)
      .map(node => node.memoryId);
  }

  getNodesByImportance(graph: KnowledgeGraph, limit: number = 10): GraphNode[] {
    return Array.from(graph.nodes.values())
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }

  getNodesByCentrality(graph: KnowledgeGraph, limit: number = 10): GraphNode[] {
    return Array.from(graph.nodes.values())
      .sort((a, b) => b.centrality - a.centrality)
      .slice(0, limit);
  }

  findConnectedComponents(graph: KnowledgeGraph): string[][] {
    const visited = new Set<string>();
    const components: string[][] = [];

    for (const nodeId of graph.nodes.keys()) {
      if (!visited.has(nodeId)) {
        const component = this.dfsComponent(graph, nodeId, visited);
        if (component.length > 1) {
          components.push(component);
        }
      }
    }

    return components;
  }

  private dfsComponent(graph: KnowledgeGraph, nodeId: string, visited: Set<string>): string[] {
    const component: string[] = [];
    const stack = [nodeId];

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      if (visited.has(currentId)) continue;

      visited.add(currentId);
      component.push(currentId);

      const node = graph.nodes.get(currentId);
      if (node) {
        // Add connected nodes to stack
        for (const relationshipId of node.connections) {
          const relationship = graph.edges.get(relationshipId);
          if (relationship) {
            const connectedId = relationship.sourceMemoryId === currentId
              ? relationship.targetMemoryId
              : relationship.sourceMemoryId;

            if (!visited.has(connectedId)) {
              stack.push(connectedId);
            }
          }
        }
      }
    }

    return component;
  }
}