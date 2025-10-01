#!/usr/bin/env node
/**
 * Layered Memory MCP Server
 * Entry point for the hierarchical memory management system
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { setupEnvironment } from './config/environment.js';
import { createLogger } from './utils/logger.js';
import { setupGracefulShutdown } from './utils/shutdown.js';
import { MonitoredMemoryRouter } from './memory/monitored-router.js';
import type { MemoryMetadata } from './memory/index.js';
import type { KnowledgeGraph } from './memory/relationships/types.js';

/**
 * Main entry point for the Layered Memory MCP Server
 */
async function main(): Promise<void> {
  const logger = createLogger('main');

  try {
    // Setup environment and configuration
    const config = setupEnvironment();
    logger.info('Starting Layered Memory MCP Server', {
      version: process.env['npm_package_version'] || '0.1.0',
      nodeVersion: process.version,
      environment: config.nodeEnv,
    });

    // Initialize monitored memory router with telemetry and security
    const memoryRouter = new MonitoredMemoryRouter({
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
        enabled: true, // Enable automatic relationship detection
        minConfidence: 0.7, // Higher confidence threshold for production
        batchSize: 50, // Smaller batch size for better performance
      },
      monitoring: {
        enabled: config.telemetryEnabled !== false, // Enable monitoring unless explicitly disabled
        metricsRetentionMs: config.metricsRetentionMs || 3600000, // 1 hour
        slowOperationMs: config.slowOperationThresholdMs || 1000, // 1 second
      },
      security: {
        rateLimiting: {
          enabled: true, // Enabled by default
          windowMs: config.rateLimitWindowMs, // From environment
          maxRequests: config.rateLimitMaxRequests, // From environment
        },
        requestValidation: {
          enabled: true, // Enabled by default
        },
      },
    });

    logger.info('Memory router initialized with monitoring and security', {
      telemetryEnabled: config.telemetryEnabled !== false,
      rateLimitingEnabled: true,
      requestValidationEnabled: true,
    });

    // Create MCP server instance
    const server = new Server(
      {
        name: 'layered-memory-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Setup tool handlers
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'store_memory',
            description: 'Store a new memory item in the hierarchical memory system',
            inputSchema: {
              type: 'object',
              properties: {
                content: {
                  type: 'string',
                  description: 'The content to store as memory',
                },
                category: {
                  type: 'string',
                  description: 'Memory category (task, decision, progress, knowledge, system)',
                  default: 'knowledge',
                },
                priority: {
                  type: 'number',
                  description: 'Priority score (1-10, higher = more important)',
                  minimum: 1,
                  maximum: 10,
                  default: 5,
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Tags for categorization and retrieval',
                  default: [],
                },
                projectId: {
                  type: 'string',
                  description: 'Project identifier for scoping',
                },
                sessionId: {
                  type: 'string',
                  description: 'Session identifier for context',
                },
              },
              required: ['content'],
            },
          },
          {
            name: 'search_memory',
            description: 'Search memories across all layers using intelligent routing',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query text',
                },
                projectId: {
                  type: 'string',
                  description: 'Filter by specific project',
                },
                sessionId: {
                  type: 'string',
                  description: 'Filter by specific session',
                },
                category: {
                  type: 'string',
                  description: 'Filter by memory category',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by tags',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results',
                  default: 10,
                  minimum: 1,
                  maximum: 50,
                },
                layers: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['session', 'project', 'global', 'temporal'],
                  },
                  description: 'Specific layers to search (optional)',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'get_memory_stats',
            description: 'Get statistics about the memory system',
            inputSchema: {
              type: 'object',
              properties: {
                projectId: {
                  type: 'string',
                  description: 'Get stats for specific project',
                },
              },
            },
          },
          {
            name: 'advanced_search',
            description:
              'Perform advanced hybrid search with semantic, temporal, and relationship capabilities',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query text',
                },
                semanticSearch: {
                  type: 'object',
                  properties: {
                    enabled: { type: 'boolean', default: true },
                    threshold: { type: 'number', minimum: 0, maximum: 1, default: 0.7 },
                    includeEmbeddings: { type: 'boolean', default: false },
                  },
                  description: 'Semantic similarity search configuration',
                },
                temporalPatterns: {
                  type: 'object',
                  properties: {
                    enabled: { type: 'boolean', default: false },
                    timeRange: {
                      type: 'object',
                      properties: {
                        start: { type: 'string', format: 'date-time' },
                        end: { type: 'string', format: 'date-time' },
                      },
                    },
                    includeSequences: { type: 'boolean', default: true },
                    sequenceWindow: { type: 'string', default: '1h' },
                  },
                  description: 'Temporal pattern analysis configuration',
                },
                relationships: {
                  type: 'object',
                  properties: {
                    enabled: { type: 'boolean', default: false },
                    types: {
                      type: 'array',
                      items: { type: 'string' },
                      default: ['reference', 'dependency', 'similarity'],
                    },
                    maxDepth: { type: 'number', minimum: 1, maximum: 5, default: 2 },
                  },
                  description: 'Relationship mapping configuration',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results',
                  default: 20,
                  minimum: 1,
                  maximum: 100,
                },
                filters: {
                  type: 'object',
                  properties: {
                    tags: { type: 'array', items: { type: 'string' } },
                    category: { type: 'string' },
                    priority: {
                      type: 'object',
                      properties: {
                        min: { type: 'number' },
                        max: { type: 'number' },
                      },
                    },
                    projectId: { type: 'string' },
                    sessionId: { type: 'string' },
                  },
                  description: 'Additional filters to apply',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'semantic_search',
            description: 'Perform semantic similarity search across memory layers',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query for semantic matching',
                },
                threshold: {
                  type: 'number',
                  description: 'Similarity threshold (0-1)',
                  minimum: 0,
                  maximum: 1,
                  default: 0.7,
                },
                maxResults: {
                  type: 'number',
                  description: 'Maximum number of results',
                  minimum: 1,
                  maximum: 50,
                  default: 20,
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'temporal_search',
            description: 'Search memories with temporal pattern analysis',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query text',
                },
                timeRange: {
                  type: 'object',
                  properties: {
                    start: { type: 'string', format: 'date-time' },
                    end: { type: 'string', format: 'date-time' },
                  },
                  description: 'Time range for temporal analysis',
                },
              },
              required: ['query'],
            },
          },
          // Epic M2: Dynamic Memory Evolution tools
          {
            name: 'build_knowledge_graph',
            description:
              'Build a knowledge graph from all memories showing relationships and clusters',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
          {
            name: 'get_memory_relationships',
            description: 'Get all relationships for a specific memory',
            inputSchema: {
              type: 'object',
              properties: {
                memoryId: {
                  type: 'string',
                  description: 'ID of the memory to get relationships for',
                },
              },
              required: ['memoryId'],
              additionalProperties: false,
            },
          },
          {
            name: 'detect_conflicts',
            description: 'Detect potential conflicts between memories',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
          {
            name: 'get_memory_versions',
            description: 'Get version history for a memory',
            inputSchema: {
              type: 'object',
              properties: {
                memoryId: {
                  type: 'string',
                  description: 'ID of the memory to get versions for',
                },
              },
              required: ['memoryId'],
              additionalProperties: false,
            },
          },
          {
            name: 'summarize_cluster',
            description: 'Generate a summary for a cluster of related memories',
            inputSchema: {
              type: 'object',
              properties: {
                memoryIds: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Array of memory IDs to summarize as a cluster',
                },
              },
              required: ['memoryIds'],
              additionalProperties: false,
            },
          },
          // Relationship Validation Tools
          {
            name: 'get_relationship_suggestions',
            description: 'Get pending relationship suggestions for user validation',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Maximum number of suggestions to return',
                  default: 10,
                  minimum: 1,
                  maximum: 50,
                },
                minConfidence: {
                  type: 'number',
                  description: 'Minimum confidence threshold',
                  default: 0.6,
                  minimum: 0,
                  maximum: 1,
                },
              },
              additionalProperties: false,
            },
          },
          {
            name: 'validate_relationship',
            description: 'Confirm, reject, or modify a relationship suggestion',
            inputSchema: {
              type: 'object',
              properties: {
                suggestionId: {
                  type: 'string',
                  description: 'ID of the suggestion to validate',
                },
                action: {
                  type: 'string',
                  enum: ['confirm', 'reject', 'modify'],
                  description: 'Validation action to take',
                },
                userFeedback: {
                  type: 'string',
                  description: 'Optional user feedback about the relationship',
                },
                modifiedType: {
                  type: 'string',
                  description: 'New relationship type (only for modify action)',
                },
                modifiedConfidence: {
                  type: 'number',
                  description: 'New confidence score (only for modify action)',
                  minimum: 0,
                  maximum: 1,
                },
              },
              required: ['suggestionId', 'action'],
              additionalProperties: false,
            },
          },
          {
            name: 'get_validation_stats',
            description: 'Get validation statistics and algorithm performance insights',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
          // Memory Decay Prediction Tools
          {
            name: 'predict_memory_decay',
            description: 'Predict which memories will become important or obsolete over time',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
          {
            name: 'get_urgent_memories',
            description: 'Get memories that need immediate attention (risk of obsolescence)',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
          {
            name: 'get_promotion_candidates',
            description: 'Get memories that are becoming more important and should be promoted',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
          {
            name: 'get_archival_candidates',
            description: 'Get memories that are becoming less important and should be archived',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
          {
            name: 'get_decay_insights',
            description: 'Get insights and performance metrics from the memory decay model',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
          {
            name: 'get_monitoring_stats',
            description: 'Get telemetry and performance monitoring statistics',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
        ],
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'store_memory': {
            const {
              content,
              category = 'knowledge',
              priority = 5,
              tags = [],
              projectId,
              sessionId,
            } = args as {
              content: string;
              category?: string;
              priority?: number;
              tags?: string[];
              projectId?: string;
              sessionId?: string;
            };

            const metadata: MemoryMetadata = {
              tags,
              category,
              priority,
              source: 'mcp-tool',
              ...(projectId && { projectId }),
              ...(sessionId && { sessionId }),
            };

            const item = await memoryRouter.store(content, metadata);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      id: item.id,
                      layer: 'determined by router',
                      metadata: {
                        category: item.metadata.category,
                        priority: item.metadata.priority,
                        tags: item.metadata.tags,
                        createdAt: item.createdAt.toISOString(),
                      },
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'search_memory': {
            const {
              query,
              projectId,
              sessionId,
              category,
              tags,
              limit = 10,
            } = args as {
              query: string;
              projectId?: string;
              sessionId?: string;
              category?: string;
              tags?: string[];
              limit?: number;
            };

            const searchQuery = {
              query,
              limit,
              filters: {
                ...(projectId && { projectId }),
                ...(sessionId && { sessionId }),
                ...(category && { category }),
                ...(tags && tags.length > 0 && { tags }),
              },
            };

            const results = await memoryRouter.search(searchQuery);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      query,
                      resultCount: results.length,
                      results: results.map(result => ({
                        id: result.memory.id,
                        content: result.memory.content,
                        score: result.score,
                        layer: result.source,
                        explanation: result.explanation,
                        metadata: {
                          category: result.memory.metadata.category,
                          priority: result.memory.metadata.priority,
                          tags: result.memory.metadata.tags,
                          createdAt: result.memory.createdAt.toISOString(),
                          lastAccessedAt: result.memory.lastAccessedAt.toISOString(),
                          accessCount: result.memory.accessCount,
                        },
                      })),
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'get_memory_stats': {
            const stats = await memoryRouter.getAllStats();

            const totalMemories = Object.values(stats).reduce(
              (sum, layerStats) => sum + layerStats.totalItems,
              0
            );
            const totalSize = Object.values(stats).reduce(
              (sum, layerStats) => sum + layerStats.totalSize,
              0
            );

            const formatSize = (bytes: number): string => {
              if (bytes < 1024) return `${bytes} B`;
              if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
              if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
              return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
            };

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      totalMemories,
                      totalSize: formatSize(totalSize),
                      layers: {
                        session: {
                          count: stats.session?.totalItems || 0,
                          size: formatSize(stats.session?.totalSize || 0),
                          averageAccess: stats.session?.averageAccessCount || 0,
                          categories: stats.session?.categoryCounts || {},
                        },
                        project: {
                          count: stats.project?.totalItems || 0,
                          size: formatSize(stats.project?.totalSize || 0),
                          averageAccess: stats.project?.averageAccessCount || 0,
                          categories: stats.project?.categoryCounts || {},
                        },
                        global: {
                          count: stats.global?.totalItems || 0,
                          size: formatSize(stats.global?.totalSize || 0),
                          averageAccess: stats.global?.averageAccessCount || 0,
                          categories: stats.global?.categoryCounts || {},
                        },
                        temporal: {
                          count: stats.temporal?.totalItems || 0,
                          size: formatSize(stats.temporal?.totalSize || 0),
                          averageAccess: stats.temporal?.averageAccessCount || 0,
                          categories: stats.temporal?.categoryCounts || {},
                        },
                      },
                      lastUpdated: new Date().toISOString(),
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'advanced_search': {
            const {
              query,
              semanticSearch,
              temporalPatterns,
              relationships,
              limit = 20,
              filters,
            } = args as {
              query: string;
              semanticSearch?: {
                enabled?: boolean;
                threshold?: number;
                includeEmbeddings?: boolean;
              };
              temporalPatterns?: {
                enabled?: boolean;
                timeRange?: { start?: string; end?: string };
                includeSequences?: boolean;
                sequenceWindow?: string;
              };
              relationships?: {
                enabled?: boolean;
                types?: string[];
                maxDepth?: number;
              };
              limit?: number;
              filters?: any;
            };

            const advancedQuery = {
              query,
              limit,
              filters,
              semanticSearch: {
                enabled: semanticSearch?.enabled !== false,
                threshold: semanticSearch?.threshold || 0.7,
                includeEmbeddings: semanticSearch?.includeEmbeddings || false,
              },
              temporalPatterns: {
                enabled: temporalPatterns?.enabled || false,
                timeRange: temporalPatterns?.timeRange
                  ? {
                      start: temporalPatterns.timeRange.start
                        ? new Date(temporalPatterns.timeRange.start)
                        : undefined,
                      end: temporalPatterns.timeRange.end
                        ? new Date(temporalPatterns.timeRange.end)
                        : undefined,
                    }
                  : undefined,
                includeSequences: temporalPatterns?.includeSequences !== false,
                sequenceWindow: temporalPatterns?.sequenceWindow || '1h',
              },
              relationships: {
                enabled: relationships?.enabled || false,
                types: relationships?.types || ['reference', 'dependency', 'similarity'],
                maxDepth: relationships?.maxDepth || 2,
              },
            };

            const results = await memoryRouter.advancedSearch(advancedQuery);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      query,
                      searchType: 'advanced',
                      resultCount: results.length,
                      features: {
                        semantic: advancedQuery.semanticSearch.enabled,
                        temporal: advancedQuery.temporalPatterns.enabled,
                        relationships: advancedQuery.relationships.enabled,
                      },
                      results: results.map(result => ({
                        id: result.memory.id,
                        content: result.memory.content,
                        score: result.score,
                        confidence: result.confidence,
                        layer: result.source,
                        explanation: result.explanation,
                        relevanceFactors: result.relevanceFactors,
                        metadata: {
                          category: result.memory.metadata.category,
                          priority: result.memory.metadata.priority,
                          tags: result.memory.metadata.tags,
                          createdAt: result.memory.createdAt.toISOString(),
                          lastAccessedAt: result.memory.lastAccessedAt.toISOString(),
                          accessCount: result.memory.accessCount,
                        },
                      })),
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'semantic_search': {
            const {
              query,
              threshold = 0.7,
              maxResults = 20,
            } = args as {
              query: string;
              threshold?: number;
              maxResults?: number;
            };

            const results = await memoryRouter.semanticSearch(query, { threshold, maxResults });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      query,
                      searchType: 'semantic',
                      threshold,
                      resultCount: results.length,
                      results: results.map(result => ({
                        id: result.memory.id,
                        content: result.memory.content,
                        score: result.score,
                        confidence: result.confidence,
                        layer: result.source,
                        explanation: result.explanation,
                        metadata: {
                          category: result.memory.metadata.category,
                          priority: result.memory.metadata.priority,
                          tags: result.memory.metadata.tags,
                          createdAt: result.memory.createdAt.toISOString(),
                          lastAccessedAt: result.memory.lastAccessedAt.toISOString(),
                          accessCount: result.memory.accessCount,
                        },
                      })),
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'temporal_search': {
            const { query, timeRange } = args as {
              query: string;
              timeRange?: { start?: string; end?: string };
            };

            const parsedTimeRange = timeRange
              ? (Object.fromEntries(
                  Object.entries({
                    start: timeRange.start ? new Date(timeRange.start) : undefined,
                    end: timeRange.end ? new Date(timeRange.end) : undefined,
                  }).filter(([_, value]) => value !== undefined)
                ) as { start?: Date; end?: Date })
              : undefined;

            const results = await memoryRouter.temporalSearch(query, parsedTimeRange);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      query,
                      searchType: 'temporal',
                      timeRange: parsedTimeRange,
                      resultCount: results.length,
                      results: results.map(result => ({
                        id: result.memory.id,
                        content: result.memory.content,
                        score: result.score,
                        confidence: result.confidence,
                        layer: result.source,
                        explanation: result.explanation,
                        metadata: {
                          category: result.memory.metadata.category,
                          priority: result.memory.metadata.priority,
                          tags: result.memory.metadata.tags,
                          createdAt: result.memory.createdAt.toISOString(),
                          lastAccessedAt: result.memory.lastAccessedAt.toISOString(),
                          accessCount: result.memory.accessCount,
                        },
                      })),
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          // Epic M2: Dynamic Memory Evolution handlers
          case 'build_knowledge_graph': {
            const graph = (await memoryRouter.buildKnowledgeGraph()) as KnowledgeGraph;

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      knowledgeGraph: {
                        nodeCount: graph.stats.totalNodes,
                        edgeCount: graph.stats.totalEdges,
                        averageConnections: graph.stats.averageConnections,
                        topCentralNodes: graph.stats.topCentralNodes,
                        nodes: Array.from(graph.nodes.values()).map(node => ({
                          memoryId: node.memoryId,
                          centrality: node.centrality,
                          importance: node.importance,
                          connectionCount: node.connections.length,
                          cluster: node.cluster,
                          content: `${node.memory.content.substring(0, 100)}...`,
                          metadata: {
                            category: node.memory.metadata.category,
                            priority: node.memory.metadata.priority,
                            tags: node.memory.metadata.tags,
                          },
                        })),
                        relationships: Array.from(graph.edges.values()).map(rel => ({
                          id: rel.id,
                          type: rel.type,
                          confidence: rel.confidence,
                          weight: rel.weight,
                          source: rel.sourceMemoryId,
                          target: rel.targetMemoryId,
                          algorithm: rel.metadata.algorithm,
                        })),
                      },
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'get_memory_relationships': {
            const { memoryId } = args as { memoryId: string };
            const relationships = await memoryRouter.getMemoryRelationships(memoryId);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      memoryId,
                      relationshipCount: relationships.length,
                      relationships: relationships.map(rel => ({
                        id: rel.id,
                        type: rel.type,
                        confidence: rel.confidence,
                        weight: rel.weight,
                        relatedMemoryId:
                          rel.sourceMemoryId === memoryId ? rel.targetMemoryId : rel.sourceMemoryId,
                        direction: rel.sourceMemoryId === memoryId ? 'outgoing' : 'incoming',
                        metadata: {
                          source: rel.metadata.source,
                          algorithm: rel.metadata.algorithm,
                          createdAt: rel.metadata.createdAt.toISOString(),
                          validatedBy: rel.metadata.validatedBy,
                        },
                      })),
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'detect_conflicts': {
            const conflicts = await memoryRouter.detectConflicts();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      conflictCount: conflicts.length,
                      conflicts: conflicts.map(conflict => ({
                        id: conflict.id,
                        type: conflict.conflictType,
                        confidence: conflict.confidence,
                        suggestedResolution: conflict.suggestedResolution,
                        conflictingMemories: conflict.conflictingMemoryIds,
                        detectedAt: conflict.metadata.detectedAt.toISOString(),
                        algorithm: conflict.metadata.algorithm,
                        resolved: !!conflict.metadata.resolvedAt,
                      })),
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'get_memory_versions': {
            const { memoryId } = args as { memoryId: string };
            const versions = await memoryRouter.getMemoryVersions(memoryId);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      memoryId,
                      versionCount: versions.length,
                      versions: versions.map(version => ({
                        id: version.id,
                        version: version.version,
                        changeType: version.changeType,
                        parentVersionId: version.parentVersionId,
                        createdAt: version.createdAt.toISOString(),
                        createdBy: version.createdBy,
                        hasContentChanges: !!version.changes.content,
                        hasMetadataChanges: !!version.changes.metadata,
                      })),
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'summarize_cluster': {
            const { memoryIds } = args as { memoryIds: string[] };
            const summary = await memoryRouter.summarizeCluster(memoryIds);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      clusterSize: memoryIds.length,
                      memoryIds,
                      summary,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          // Relationship Validation Tools
          case 'get_relationship_suggestions': {
            const { limit = 10, minConfidence = 0.6 } = args as {
              limit?: number;
              minConfidence?: number;
            };

            const suggestions = await memoryRouter.getRelationshipSuggestions(limit, minConfidence);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      suggestionCount: suggestions.length,
                      suggestions: suggestions.map(suggestion => ({
                        id: suggestion.id,
                        relationshipType: suggestion.relationship.type,
                        confidence: suggestion.confidence,
                        algorithm: suggestion.algorithm,
                        sourceContent: `${suggestion.sourceMemoryContent.substring(0, 100)}...`,
                        targetContent: `${suggestion.targetMemoryContent.substring(0, 100)}...`,
                        suggestedAt: suggestion.suggestedAt.toISOString(),
                        status: suggestion.status,
                      })),
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'validate_relationship': {
            const { suggestionId, action, userFeedback, modifiedType, modifiedConfidence } =
              args as {
                suggestionId: string;
                action: 'confirm' | 'reject' | 'modify';
                userFeedback?: string;
                modifiedType?: string;
                modifiedConfidence?: number;
              };

            const options: {
              action: 'confirm' | 'reject' | 'modify';
              userFeedback?: string;
              modifiedType?: string;
              modifiedConfidence?: number;
            } = { action };

            if (userFeedback !== undefined) options.userFeedback = userFeedback;
            if (modifiedType !== undefined) options.modifiedType = modifiedType;
            if (modifiedConfidence !== undefined) options.modifiedConfidence = modifiedConfidence;

            const success = await memoryRouter.validateRelationship(suggestionId, options);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success,
                      suggestionId,
                      action,
                      message: success
                        ? `Relationship suggestion ${action}ed successfully`
                        : `Failed to ${action} relationship suggestion`,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'get_validation_stats': {
            const stats = await memoryRouter.getValidationStats();
            const insights = await memoryRouter.getAlgorithmInsights();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      validationStats: stats,
                      algorithmInsights: insights,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          // Memory Decay Prediction Tools
          case 'predict_memory_decay': {
            const predictions = await memoryRouter.predictMemoryDecay();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      predictionCount: predictions.length,
                      predictions: predictions.map(pred => ({
                        memoryId: pred.memoryId,
                        currentImportance: pred.currentImportance,
                        predictedImportance: pred.predictedImportance,
                        decayRate: pred.decayRate,
                        timeToObsolescence: pred.timeToObsolescence,
                        confidenceScore: pred.confidenceScore,
                        recommendation: pred.recommendation,
                        factors: pred.factors,
                      })),
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'get_urgent_memories': {
            const urgentMemories = await memoryRouter.getUrgentMemories();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      urgentCount: urgentMemories.length,
                      urgentMemories: urgentMemories.map(pred => ({
                        memoryId: pred.memoryId,
                        timeToObsolescence: pred.timeToObsolescence,
                        currentImportance: pred.currentImportance,
                        confidenceScore: pred.confidenceScore,
                        recommendation: pred.recommendation,
                      })),
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'get_promotion_candidates': {
            const promotionCandidates = await memoryRouter.getPromotionCandidates();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      candidateCount: promotionCandidates.length,
                      promotionCandidates: promotionCandidates.map(pred => ({
                        memoryId: pred.memoryId,
                        currentImportance: pred.currentImportance,
                        predictedImportance: pred.predictedImportance,
                        improvementFactor: pred.predictedImportance / pred.currentImportance,
                        confidenceScore: pred.confidenceScore,
                      })),
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'get_archival_candidates': {
            const archivalCandidates = await memoryRouter.getArchivalCandidates();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      candidateCount: archivalCandidates.length,
                      archivalCandidates: archivalCandidates.map(pred => ({
                        memoryId: pred.memoryId,
                        currentImportance: pred.currentImportance,
                        predictedImportance: pred.predictedImportance,
                        timeToObsolescence: pred.timeToObsolescence,
                        recommendation: pred.recommendation,
                        confidenceScore: pred.confidenceScore,
                      })),
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'get_decay_insights': {
            const insights = await memoryRouter.getDecayModelInsights();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      modelInsights: insights,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          case 'get_monitoring_stats': {
            const monitoringStats = memoryRouter.getMonitoringStats();

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
                    {
                      success: true,
                      monitoring: {
                        enabled: monitoringStats.enabled,
                        telemetry: monitoringStats.telemetry,
                        performance: monitoringStats.performance,
                      },
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        logger.error('Tool execution error', {
          tool: name,
          args,
          error: error instanceof Error ? error.message : String(error),
        });

        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    // Setup transport and start server
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Setup graceful shutdown with memory router cleanup
    setupGracefulShutdown(server, logger);

    // Setup memory router cleanup on shutdown
    const originalProcessExit = process.exit;
    process.exit = ((code?: number) => {
      memoryRouter
        .close()
        .catch(error => {
          logger.error('Failed to close memory router', {
            error: error instanceof Error ? error.message : error,
          });
        })
        .finally(() => {
          originalProcessExit(code);
        });
    }) as typeof process.exit;

    logger.info('Layered Memory MCP Server started successfully');
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  const logger = createLogger('unhandledRejection');
  logger.error('Unhandled promise rejection', { reason, promise });
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', error => {
  const logger = createLogger('uncaughtException');
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Start the server
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
