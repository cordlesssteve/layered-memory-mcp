/**
 * Environment configuration and validation
 */

import { z } from 'zod';
import { randomBytes } from 'crypto';

const environmentSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  logLevel: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),

  // Database configurations
  databaseUrl: z.string().default('sqlite:///app/data/memory.db'),
  redisUrl: z.string().default('redis://localhost:6379'),
  neo4jUri: z.string().default('bolt://localhost:7687'),
  neo4jUser: z.string().default('neo4j'),
  neo4jPassword: z.string().default('development'),
  chromadbHost: z.string().default('localhost'),
  chromadbPort: z.coerce.number().default(8000),

  // Security configurations
  authSecret: z.string().min(32, 'Auth secret must be at least 32 characters').optional(),
  jwtExpiresIn: z.string().default('24h'),
  rateLimitWindowMs: z.coerce.number().default(15 * 60 * 1000), // 15 minutes
  rateLimitMaxRequests: z.coerce.number().default(1000),

  // API configurations
  serverPort: z.coerce.number().default(3000),
  corsOrigins: z.string().default('*'),
  trustProxy: z.boolean().default(false),

  // Monitoring configurations
  telemetryEnabled: z.boolean().default(true),
  metricsRetentionMs: z.coerce.number().default(24 * 60 * 60 * 1000), // 24 hours
  performanceMonitoringEnabled: z.boolean().default(true),
  healthCheckIntervalMs: z.coerce.number().default(30 * 1000), // 30 seconds
  metricsExportEnabled: z.boolean().default(false),
  metricsExportEndpoint: z.string().optional(),

  // Performance thresholds
  slowOperationThresholdMs: z.coerce.number().default(5000),
  highMemoryThresholdMb: z.coerce.number().default(512),
  errorRateThreshold: z.coerce.number().default(5.0),
});

export type Environment = z.infer<typeof environmentSchema>;

/**
 * Setup and validate environment configuration
 */
export function setupEnvironment(): Environment {
  const config = {
    nodeEnv: process.env['NODE_ENV'] as Environment['nodeEnv'],
    logLevel: process.env['LOG_LEVEL'] as Environment['logLevel'],

    // Database configurations
    databaseUrl: process.env['DATABASE_URL'],
    redisUrl: process.env['REDIS_URL'],
    neo4jUri: process.env['NEO4J_URI'],
    neo4jUser: process.env['NEO4J_USER'],
    neo4jPassword: process.env['NEO4J_PASSWORD'],
    chromadbHost: process.env['CHROMADB_HOST'],
    chromadbPort: process.env['CHROMADB_PORT'],

    // Security configurations
    authSecret: process.env['AUTH_SECRET'] || process.env['SIMPLE_AUTH_SECRET'],
    jwtExpiresIn: process.env['JWT_EXPIRES_IN'],
    rateLimitWindowMs: process.env['RATE_LIMIT_WINDOW_MS'],
    rateLimitMaxRequests: process.env['RATE_LIMIT_MAX_REQUESTS'],

    // API configurations
    serverPort: process.env['PORT'] || process.env['SERVER_PORT'],
    corsOrigins: process.env['CORS_ORIGINS'],
    trustProxy: process.env['TRUST_PROXY'],

    // Monitoring configurations
    telemetryEnabled: process.env['TELEMETRY_ENABLED'],
    metricsRetentionMs: process.env['METRICS_RETENTION_MS'],
    performanceMonitoringEnabled: process.env['PERFORMANCE_MONITORING_ENABLED'],
    healthCheckIntervalMs: process.env['HEALTH_CHECK_INTERVAL_MS'],
    metricsExportEnabled: process.env['METRICS_EXPORT_ENABLED'],
    metricsExportEndpoint: process.env['METRICS_EXPORT_ENDPOINT'],

    // Performance thresholds
    slowOperationThresholdMs: process.env['SLOW_OPERATION_THRESHOLD_MS'],
    highMemoryThresholdMb: process.env['HIGH_MEMORY_THRESHOLD_MB'],
    errorRateThreshold: process.env['ERROR_RATE_THRESHOLD'],
  };

  try {
    const validatedConfig = environmentSchema.parse(config);

    // Log configuration (excluding sensitive data)
    const safeConfig = {
      ...validatedConfig,
      neo4jPassword: validatedConfig.neo4jPassword ? '[REDACTED]' : undefined,
      authSecret: validatedConfig.authSecret ? '[REDACTED]' : undefined,
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

/**
 * Get or generate a secure auth secret with proper warnings
 */
export function getAuthSecret(env: Environment): string {
  // Use provided secret if available
  if (env.authSecret) {
    return env.authSecret;
  }

  // Production environment requires explicit secret
  if (env.nodeEnv === 'production') {
    // eslint-disable-next-line no-console
    console.error('🚨 SECURITY CRITICAL: No AUTH_SECRET environment variable set in production!');
    // eslint-disable-next-line no-console
    console.error('   Set AUTH_SECRET to a secure 64+ character random string.');
    // eslint-disable-next-line no-console
    console.error('   Example: openssl rand -hex 32');
    process.exit(1);
  }

  // Generate development secret without warnings for test environment
  if (env.nodeEnv === 'test') {
    return `test-secret-${randomBytes(16).toString('hex')}`;
  }

  // Development environment - generate and warn once
  const devSecret = `dev-secret-${randomBytes(16).toString('hex')}`;

  if (env.logLevel !== 'silent') {
    // eslint-disable-next-line no-console
    console.info('ℹ️  Generated development auth secret. Set AUTH_SECRET for production.');
  }

  return devSecret;
}

/**
 * Generate a cryptographically secure random secret
 */
export function generateSecureSecret(length: number = 64): string {
  return randomBytes(length).toString('hex');
}
