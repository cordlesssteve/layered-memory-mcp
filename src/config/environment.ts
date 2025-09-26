/**
 * Environment configuration and validation
 */

import { z } from 'zod';

const environmentSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  databaseUrl: z.string().default('sqlite:///app/data/memory.db'),
  redisUrl: z.string().default('redis://localhost:6379'),
  neo4jUri: z.string().default('bolt://localhost:7687'),
  neo4jUser: z.string().default('neo4j'),
  neo4jPassword: z.string().default('development'),
  chromadbHost: z.string().default('localhost'),
  chromadbPort: z.coerce.number().default(8000),
});

export type Environment = z.infer<typeof environmentSchema>;

/**
 * Setup and validate environment configuration
 */
export function setupEnvironment(): Environment {
  const config = {
    nodeEnv: process.env['NODE_ENV'] as Environment['nodeEnv'],
    logLevel: process.env['LOG_LEVEL'] as Environment['logLevel'],
    databaseUrl: process.env['DATABASE_URL'],
    redisUrl: process.env['REDIS_URL'],
    neo4jUri: process.env['NEO4J_URI'],
    neo4jUser: process.env['NEO4J_USER'],
    neo4jPassword: process.env['NEO4J_PASSWORD'],
    chromadbHost: process.env['CHROMADB_HOST'],
    chromadbPort: process.env['CHROMADB_PORT'],
  };

  try {
    const validatedConfig = environmentSchema.parse(config);

    // Log configuration (excluding sensitive data)
    const safeConfig = {
      ...validatedConfig,
      neo4jPassword: validatedConfig.neo4jPassword ? '[REDACTED]' : undefined,
    };

    if (validatedConfig.nodeEnv !== 'test') {
      // eslint-disable-next-line no-console
      console.log('Environment configuration:', JSON.stringify(safeConfig, null, 2));
    }

    return validatedConfig;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Environment configuration validation failed:', error);
    process.exit(1);
  }
}
