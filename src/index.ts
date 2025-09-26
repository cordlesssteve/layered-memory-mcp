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
import { MemoryRouter } from './memory/index.js';
import type { MemoryMetadata } from './memory/index.js';

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

    // Initialize memory router
    const memoryRouter = new MemoryRouter({
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
                    enum: ['session', 'project', 'global', 'temporal']
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
            description: 'Perform advanced hybrid search with semantic, temporal, and relationship capabilities',
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
        ],
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'store_memory': {
            const { content, category = 'knowledge', priority = 5, tags = [], projectId, sessionId } = args as {
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
                  text: JSON.stringify({
                    success: true,
                    id: item.id,
                    layer: 'determined by router',
                    metadata: {
                      category: item.metadata.category,
                      priority: item.metadata.priority,
                      tags: item.metadata.tags,
                      createdAt: item.createdAt.toISOString(),
                    },
                  }, null, 2),
                },
              ],
            };
          }

          case 'search_memory': {
            const { query, projectId, sessionId, category, tags, limit = 10 } = args as {
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
                  text: JSON.stringify({
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
                  }, null, 2),
                },
              ],
            };
          }

          case 'get_memory_stats': {
            const stats = await memoryRouter.getAllStats();

            const totalMemories = Object.values(stats).reduce((sum, layerStats) => sum + layerStats.totalItems, 0);
            const totalSize = Object.values(stats).reduce((sum, layerStats) => sum + layerStats.totalSize, 0);

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
                  text: JSON.stringify({
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
                  }, null, 2),
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
              filters
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
                timeRange: temporalPatterns?.timeRange ? {
                  start: temporalPatterns.timeRange.start ? new Date(temporalPatterns.timeRange.start) : undefined,
                  end: temporalPatterns.timeRange.end ? new Date(temporalPatterns.timeRange.end) : undefined,
                } : undefined,
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
                  text: JSON.stringify({
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
                  }, null, 2),
                },
              ],
            };
          }

          case 'semantic_search': {
            const { query, threshold = 0.7, maxResults = 20 } = args as {
              query: string;
              threshold?: number;
              maxResults?: number;
            };

            const results = await memoryRouter.semanticSearch(query, { threshold, maxResults });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
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
                  }, null, 2),
                },
              ],
            };
          }

          case 'temporal_search': {
            const { query, timeRange } = args as {
              query: string;
              timeRange?: { start?: string; end?: string };
            };

            const parsedTimeRange = timeRange ? Object.fromEntries(
              Object.entries({
                start: timeRange.start ? new Date(timeRange.start) : undefined,
                end: timeRange.end ? new Date(timeRange.end) : undefined,
              }).filter(([_, value]) => value !== undefined)
            ) as { start?: Date; end?: Date } : undefined;

            const results = await memoryRouter.temporalSearch(query, parsedTimeRange);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
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
                  }, null, 2),
                },
              ],
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
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
      memoryRouter.close().catch(error => {
        logger.error('Failed to close memory router', { error: error instanceof Error ? error.message : error });
      }).finally(() => {
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
process.on('uncaughtException', (error) => {
  const logger = createLogger('uncaughtException');
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}