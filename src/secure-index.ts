#!/usr/bin/env node
/**
 * Secure Layered Memory MCP Server
 * Entry point with authentication and security features
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
import { SimpleSecureRouter, type SecureMemoryMetadata } from './memory/simple-secure-router.js';
import type { MemoryMetadata } from './memory/index.js';

const logger = createLogger('secure-main');


/**
 * Main entry point for the Secure Layered Memory MCP Server
 */
async function main(): Promise<void> {
  try {
    // Setup environment and configuration
    const config = setupEnvironment();
    logger.info('Starting Secure Layered Memory MCP Server', {
      version: process.env['npm_package_version'] || '0.1.0',
      nodeVersion: process.version,
      environment: config.nodeEnv,
    });

    // Initialize secure memory router
    const secureRouter = new SimpleSecureRouter({
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

    const authService = secureRouter.getAuthService();

    // Create MCP server instance
    const server = new Server(
      {
        name: 'layered-memory-mcp-secure',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Add authentication tools
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'auth_login',
            description: 'Authenticate user and get access token',
            inputSchema: {
              type: 'object',
              properties: {
                username: {
                  type: 'string',
                  description: 'Username',
                },
                password: {
                  type: 'string',
                  description: 'Password',
                },
              },
              required: ['username', 'password'],
            },
          },
          {
            name: 'store_memory',
            description: 'Store a new memory item in the hierarchical memory system (requires authentication)',
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
                authToken: {
                  type: 'string',
                  description: 'Authentication token from login',
                },
              },
              required: ['content', 'authToken'],
            },
          },
          {
            name: 'search_memory',
            description: 'Search memories across all layers (requires authentication)',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query text',
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results',
                  default: 10,
                  minimum: 1,
                  maximum: 50,
                },
                authToken: {
                  type: 'string',
                  description: 'Authentication token from login',
                },
              },
              required: ['query', 'authToken'],
            },
          },
          {
            name: 'get_memory_stats',
            description: 'Get statistics about the memory system (requires authentication)',
            inputSchema: {
              type: 'object',
              properties: {
                authToken: {
                  type: 'string',
                  description: 'Authentication token from login',
                },
              },
              required: ['authToken'],
            },
          },
        ],
      };
    });

    // Setup tool handlers
    server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'auth_login': {
            const { username, password } = args as { username: string; password: string };

            const result = await authService.login({ username, password });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case 'store_memory': {
            const {
              content,
              category = 'knowledge',
              priority = 5,
              tags = [],
              authToken,
            } = args as {
              content: string;
              category?: string;
              priority?: number;
              tags?: string[];
              authToken: string;
            };

            // Verify authentication
            const authContext = await authService.verifyToken(authToken);
            if (!authContext) {
              throw new McpError(ErrorCode.InvalidRequest, 'Invalid or expired authentication token');
            }

            if (!authService.hasPermission(authContext, 'create', 'memory')) {
              throw new McpError(ErrorCode.InvalidRequest, 'Insufficient permissions');
            }

            const metadata: MemoryMetadata = {
              tags,
              category,
              priority,
              source: 'mcp-tool-secure',
            };

            const item = await secureRouter.store(content, metadata, authContext);

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
                        tenantId: (item.metadata as SecureMemoryMetadata).tenantId,
                        createdBy: (item.metadata as SecureMemoryMetadata).createdBy,
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
            const { query, limit = 10, authToken } = args as {
              query: string;
              limit?: number;
              authToken: string;
            };

            // Verify authentication
            const authContext = await authService.verifyToken(authToken);
            if (!authContext) {
              throw new McpError(ErrorCode.InvalidRequest, 'Invalid or expired authentication token');
            }

            if (!authService.hasPermission(authContext, 'read', 'memory')) {
              throw new McpError(ErrorCode.InvalidRequest, 'Insufficient permissions');
            }

            const results = await secureRouter.search({ query, limit }, authContext);

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
                          tenantId: (result.memory.metadata as SecureMemoryMetadata).tenantId,
                          createdBy: (result.memory.metadata as SecureMemoryMetadata).createdBy,
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
            const { authToken } = args as { authToken: string };

            // Verify authentication
            const authContext = await authService.verifyToken(authToken);
            if (!authContext) {
              throw new McpError(ErrorCode.InvalidRequest, 'Invalid or expired authentication token');
            }

            if (!authService.hasPermission(authContext, 'read', 'memory')) {
              throw new McpError(ErrorCode.InvalidRequest, 'Insufficient permissions');
            }

            const stats = await secureRouter.getAllStats();

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
                      tenantId: authContext.tenantId,
                      userId: authContext.userId,
                      layers: {
                        session: {
                          count: stats.session?.totalItems || 0,
                          size: formatSize(stats.session?.totalSize || 0),
                        },
                        project: {
                          count: stats.project?.totalItems || 0,
                          size: formatSize(stats.project?.totalSize || 0),
                        },
                        global: {
                          count: stats.global?.totalItems || 0,
                          size: formatSize(stats.global?.totalSize || 0),
                        },
                        temporal: {
                          count: stats.temporal?.totalItems || 0,
                          size: formatSize(stats.temporal?.totalSize || 0),
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

    // Setup graceful shutdown
    setupGracefulShutdown(server, logger);

    // Setup memory router cleanup on shutdown
    const originalProcessExit = process.exit;
    process.exit = ((code?: number) => {
      secureRouter
        .close()
        .catch(error => {
          logger.error('Failed to close secure memory router', {
            error: error instanceof Error ? error.message : error,
          });
        })
        .finally(() => {
          originalProcessExit(code);
        });
    }) as typeof process.exit;

    logger.info('Secure Layered Memory MCP Server started successfully', {
      authEnabled: true,
      defaultCredentials: {
        admin: { username: 'admin', password: 'admin123' },
        user: { username: 'user', password: 'user123' },
      },
    });
  } catch (error) {
    logger.error('Failed to start secure server', {
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