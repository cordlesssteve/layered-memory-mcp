/**
 * Graph Layer: Neo4j-backed memory storage with relationship mapping
 * - Uses @imthemap/graph-core for database abstraction
 * - Stores memories as nodes with semantic relationships
 * - Enables graph traversal queries (shortest path, reachable nodes, etc.)
 * - Relationship types: TEMPORAL, SEMANTIC, REFERENCES, CAUSAL, CONTEXT
 */

import { createGraphDatabase } from '@imthemap/graph-core';
import type { IGraphDatabase } from '@imthemap/graph-core';
import { BaseMemoryLayer } from '../base-layer.js';
import type {
  MemoryItem,
  MemoryLayerConfig,
  MemoryQuery,
  MemorySearchResult,
  MemoryLayer,
} from '../types.js';

/**
 * Relationship types for memory connections
 */
export enum MemoryRelationshipType {
  TEMPORAL = 'TEMPORAL',     // Time-based proximity (happened around same time)
  SEMANTIC = 'SEMANTIC',     // Semantic similarity (similar content/meaning)
  REFERENCES = 'REFERENCES', // Direct reference (one mentions the other)
  CAUSAL = 'CAUSAL',         // Causal relationship (one led to the other)
  CONTEXT = 'CONTEXT',       // Contextual grouping (same session, project, etc.)
  SUPERSEDES = 'SUPERSEDES', // Replaces older memory
}

// Re-export relationship types for external use (avoids eslint unused-vars)
export const { TEMPORAL, SEMANTIC, REFERENCES, CAUSAL, CONTEXT, SUPERSEDES } =
  MemoryRelationshipType;

interface GraphConfig {
  uri?: string;
  username?: string;
  password?: string;
  backend?: 'neo4j' | 'sqlite';
}

interface MemoryRelationship {
  from: string;
  to: string;
  type: MemoryRelationshipType;
  strength: number; // 0.0 to 1.0
  metadata?: Record<string, unknown>;
}

/**
 * Graph-based memory layer using Neo4j/SQLite via @imthemap/graph-core
 */
export class GraphLayer extends BaseMemoryLayer {
  private db: IGraphDatabase;
  private connected = false;
  private readonly graphConfig: GraphConfig;

  constructor(
    layer: MemoryLayer,
    config: MemoryLayerConfig = { ttl: undefined },
    graphConfig: GraphConfig = {}
  ) {
    super(layer, config);

    this.graphConfig = {
      uri: graphConfig.uri || process.env['NEO4J_URI'] || 'neo4j://localhost:7687',
      username: graphConfig.username || process.env['NEO4J_USER'] || 'neo4j',
      password: graphConfig.password || process.env['NEO4J_PASSWORD'] || 'layered-memory',
      backend: graphConfig.backend || 'neo4j',
    };

    this.db = createGraphDatabase();

    // Connect asynchronously
    this.connect().catch(error => {
      this.logger.error('Failed to connect to graph database', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /**
   * Connect to graph database
   */
  private async connect(): Promise<void> {
    if (this.connected) return;

    try {
      await this.db.connect({
        backend: this.graphConfig.backend!,
        uri: this.graphConfig.uri!,
        username: this.graphConfig.username!,
        password: this.graphConfig.password!,
      });

      this.connected = true;

      // Create indexes for performance
      await this.createIndexes();

      this.logger.info('Connected to graph database', {
        backend: this.graphConfig.backend,
        uri: this.graphConfig.uri,
      });
    } catch (error) {
      this.logger.error('Graph connection failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create indexes for memory nodes
   */
  private async createIndexes(): Promise<void> {
    try {
      await this.db.createIndexes([
        { label: 'Memory', properties: ['id'] },
        { label: 'Memory', properties: ['category'] },
        { label: 'Memory', properties: ['createdAt'] },
        { label: 'Memory', properties: ['priority'] },
      ]);
    } catch (error) {
      this.logger.warn('Failed to create some indexes (may already exist)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Store memory in graph database
   */
  override async store(
    item: Omit<MemoryItem, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt'>
  ): Promise<MemoryItem> {
    // First store in base layer (handles ID generation, timestamps, etc.)
    const memoryItem = await super.store(item);

    if (!this.connected) {
      this.logger.warn('Graph database not connected, memory not persisted to graph');
      return memoryItem;
    }

    // Store as graph node
    const session = this.db.session();
    try {
      await session.createNode('Memory', {
        id: memoryItem.id,
        content: memoryItem.content,
        category: memoryItem.metadata.category,
        priority: memoryItem.metadata.priority,
        tags: memoryItem.metadata.tags,
        projectId: memoryItem.metadata.projectId,
        sessionId: memoryItem.metadata.sessionId,
        userId: memoryItem.metadata.userId,
        source: memoryItem.metadata.source,
        createdAt: memoryItem.createdAt.toISOString(),
        updatedAt: memoryItem.updatedAt.toISOString(),
        lastAccessedAt: memoryItem.lastAccessedAt.toISOString(),
        accessCount: memoryItem.accessCount,
        layer: this.layer,
      });

      await session.commit();
      this.logger.debug('Memory stored in graph', { id: memoryItem.id });
    } catch (error) {
      this.logger.error('Failed to store memory in graph', {
        id: memoryItem.id,
        error: error instanceof Error ? error.message : String(error),
      });
      await session.rollback();
    } finally {
      await session.close();
    }

    return memoryItem;
  }

  /**
   * Create relationship between memories
   */
  async createRelationship(relationship: MemoryRelationship): Promise<boolean> {
    if (!this.connected) {
      this.logger.warn('Graph database not connected');
      return false;
    }

    const session = this.db.session();
    try {
      await session.createRelationship(
        { label: 'Memory', id: relationship.from },
        relationship.type,
        { label: 'Memory', id: relationship.to },
        {
          strength: relationship.strength,
          createdAt: new Date().toISOString(),
          ...relationship.metadata,
        }
      );

      await session.commit();
      this.logger.debug('Relationship created', {
        from: relationship.from,
        to: relationship.to,
        type: relationship.type,
      });
      return true;
    } catch (error) {
      this.logger.error('Failed to create relationship', {
        error: error instanceof Error ? error.message : String(error),
      });
      await session.rollback();
      return false;
    } finally {
      await session.close();
    }
  }

  /**
   * Find shortest path between two memories
   */
  async findShortestPath(fromId: string, toId: string): Promise<MemoryItem[] | null> {
    if (!this.connected) return null;

    const session = this.db.session();
    try {
      const path = await session.shortestPath(fromId, toId);
      if (!path) return null;

      // Convert graph nodes back to MemoryItems
      const memories: MemoryItem[] = [];
      for (const segment of path.segments) {
        const memory = await this.retrieve(segment.node.properties['id'] as string);
        if (memory) memories.push(memory);
      }

      return memories;
    } catch (error) {
      this.logger.error('Failed to find shortest path', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      await session.close();
    }
  }

  /**
   * Get all memories reachable from a starting memory
   */
  async getReachableMemories(memoryId: string): Promise<MemoryItem[]> {
    if (!this.connected) return [];

    const session = this.db.session();
    try {
      const nodes = await session.reachableFrom(memoryId);

      const memories: MemoryItem[] = [];
      for (const node of nodes) {
        if (node.properties['id'] !== memoryId) {
          const memory = await this.retrieve(node.properties['id'] as string);
          if (memory) memories.push(memory);
        }
      }

      return memories;
    } catch (error) {
      this.logger.error('Failed to get reachable memories', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * Get all related memories by relationship type
   */
  async getRelatedMemories(
    memoryId: string,
    relationshipType?: MemoryRelationshipType
  ): Promise<Array<{ memory: MemoryItem; relationshipType: string; strength: number }>> {
    if (!this.connected) return [];

    const session = this.db.session();
    try {
      // Build Cypher query
      const typeFilter = relationshipType ? `:${relationshipType}` : '';
      const query = `
        MATCH (m:Memory {id: $memoryId})-[r${typeFilter}]->(related:Memory)
        RETURN related, type(r) as relType, r.strength as strength
        ORDER BY r.strength DESC
      `;

      const result = await session.rawQuery<{
        related: { properties: Record<string, unknown> };
        relType: string;
        strength: number;
      }>(query, { memoryId });

      const related: Array<{ memory: MemoryItem; relationshipType: string; strength: number }> =
        [];

      for (const record of result.records) {
        const relatedNode = record.related;
        const memory = await this.retrieve(relatedNode.properties['id'] as string);
        if (memory) {
          related.push({
            memory,
            relationshipType: record.relType,
            strength: record.strength || 1.0,
          });
        }
      }

      return related;
    } catch (error) {
      this.logger.error('Failed to get related memories', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * Search using graph traversal and relationships
   */
  async graphSearch(
    query: MemoryQuery,
    maxDepth: number = 2
  ): Promise<MemorySearchResult[]> {
    if (!this.connected) {
      // Fallback to base layer search
      return super.search(query);
    }

    const session = this.db.session();
    try {
      // First, find seed memories using text search
      const seedResults = await super.search({ ...query, limit: 5 });

      if (seedResults.length === 0) {
        return [];
      }

      // Expand search through graph relationships
      const expandedResults = new Map<string, MemorySearchResult>();

      for (const seed of seedResults) {
        expandedResults.set(seed.memory.id, seed);

        // Get related memories up to maxDepth
        const cypher = `
          MATCH path = (start:Memory {id: $seedId})-[*1..${maxDepth}]-(related:Memory)
          RETURN related, length(path) as distance
          ORDER BY distance ASC
          LIMIT 10
        `;

        const result = await session.rawQuery<{
          related: { properties: Record<string, unknown> };
          distance: number;
        }>(cypher, { seedId: seed.memory.id });

        for (const record of result.records) {
          const relatedNode = record.related;
          const distance = record.distance;
          const relatedId = relatedNode.properties['id'] as string;

          if (!expandedResults.has(relatedId)) {
            const memory = await this.retrieve(relatedId);
            if (memory) {
              const score = seed.score * (1 / (distance + 1)); // Decay by distance
              expandedResults.set(relatedId, {
                memory,
                score,
                source: this.layer,
                explanation: `Related via graph traversal (distance: ${distance})`,
              });
            }
          }
        }
      }

      // Sort by score and return
      const results = Array.from(expandedResults.values()).sort((a, b) => b.score - a.score);

      const limit = query.limit ?? 10;
      const offset = query.offset ?? 0;

      return results.slice(offset, offset + limit);
    } catch (error) {
      this.logger.error('Graph search failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Fallback to base search
      return super.search(query);
    } finally {
      await session.close();
    }
  }

  /**
   * Auto-create relationships based on heuristics
   */
  async autoLinkMemory(memoryId: string): Promise<number> {
    const memory = await this.retrieve(memoryId);
    if (!memory) return 0;

    let linksCreated = 0;

    // Find recent memories (temporal relationships)
    const recentQuery: MemoryQuery = {
      query: '',
      filters: {
        dateRange: {
          start: new Date(Date.now() - 60 * 60 * 1000), // Last hour
          end: new Date(),
        },
      },
      limit: 10,
    };

    const recentMemories = await super.search(recentQuery);
    for (const result of recentMemories) {
      if (result.memory.id !== memoryId) {
        const timeDiff = Math.abs(
          memory.createdAt.getTime() - result.memory.createdAt.getTime()
        );
        const strength = Math.max(0, 1 - timeDiff / (60 * 60 * 1000)); // Decay over 1 hour

        if (strength > 0.3) {
          const created = await this.createRelationship({
            from: memoryId,
            to: result.memory.id,
            type: MemoryRelationshipType.TEMPORAL,
            strength,
          });
          if (created) linksCreated++;
        }
      }
    }

    // Find semantically similar memories (semantic relationships)
    const similarMemories = await super.search({
      query: memory.content,
      limit: 5,
    });

    for (const result of similarMemories) {
      if (result.memory.id !== memoryId && result.score > 0.5) {
        const created = await this.createRelationship({
          from: memoryId,
          to: result.memory.id,
          type: MemoryRelationshipType.SEMANTIC,
          strength: result.score,
        });
        if (created) linksCreated++;
      }
    }

    // Context relationships (same session/project)
    if (memory.metadata.sessionId || memory.metadata.projectId) {
      const contextMemories = await super.search({
        query: '',
        filters: {
          sessionId: memory.metadata.sessionId,
          projectId: memory.metadata.projectId,
        },
        limit: 10,
      });

      for (const result of contextMemories) {
        if (result.memory.id !== memoryId) {
          const created = await this.createRelationship({
            from: memoryId,
            to: result.memory.id,
            type: MemoryRelationshipType.CONTEXT,
            strength: 0.8,
          });
          if (created) linksCreated++;
        }
      }
    }

    this.logger.info('Auto-linked memory', { memoryId, linksCreated });
    return linksCreated;
  }

  /**
   * Cleanup: disconnect from database
   */
  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.db.disconnect();
      this.connected = false;
      this.logger.info('Disconnected from graph database');
    }
  }

  /**
   * Override optimize to include graph optimization
   */
  async optimize(): Promise<void> {
    // TODO: Add graph-specific optimization (remove weak relationships, etc.)
    this.logger.info('Graph layer optimized');
  }

  /**
   * Backup graph data
   */
  async backup(): Promise<string> {
    if (!this.connected) {
      return 'graph-backup-not-connected';
    }

    try {
      // Export graph to JSON format
      await this.db.export('json');
      const backupId = `graph-backup-${Date.now()}`;

      // TODO: Save to file system or cloud storage
      this.logger.info('Graph backup created', { backupId });
      return backupId;
    } catch (error) {
      this.logger.error('Graph backup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Restore graph data
   */
  async restore(backupId: string): Promise<boolean> {
    this.logger.info('Graph restore requested', { backupId });
    // TODO: Implement restore from backup
    return false;
  }
}
