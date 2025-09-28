/**
 * Security Configuration - Default security settings for Epic 2.1
 * Phase 2.1.1: Authentication Foundation
 */

import type { SecurityConfig } from './types.js';

/**
 * Get JWT secret with appropriate warnings for production use
 */
function getJwtSecretWithWarning(): string {
  const devSecret = 'layered-memory-secret-key-change-in-production';

  // Only warn in production-like environments
  if (process.env['NODE_ENV'] === 'production' || process.env['NODE_ENV'] === 'prod') {
    console.error('🚨 CRITICAL SECURITY WARNING: Using default JWT secret in production!');
    console.error('   Set JWT_SECRET environment variable immediately.');
    console.error('   This is a critical security vulnerability that compromises all authentication.');
  } else {
    console.warn('⚠️  Using development JWT secret. Set JWT_SECRET for production.');
  }

  return devSecret;
}

/**
 * Default security configuration
 */
export const defaultSecurityConfig: SecurityConfig = {
  jwt: {
    secret: process.env['JWT_SECRET'] || getJwtSecretWithWarning(),
    expiresIn: process.env['JWT_EXPIRES_IN'] || '1h',
    refreshExpiresIn: process.env['JWT_REFRESH_EXPIRES_IN'] || '7d',
    algorithm: 'HS256',
  },
  password: {
    minLength: parseInt(process.env['PASSWORD_MIN_LENGTH'] || '8', 10),
    requireUppercase: process.env['PASSWORD_REQUIRE_UPPERCASE'] !== 'false',
    requireLowercase: process.env['PASSWORD_REQUIRE_LOWERCASE'] !== 'false',
    requireNumbers: process.env['PASSWORD_REQUIRE_NUMBERS'] !== 'false',
    requireSpecialChars: process.env['PASSWORD_REQUIRE_SPECIAL'] !== 'false',
    saltRounds: parseInt(process.env['BCRYPT_SALT_ROUNDS'] || '12', 10),
  },
  rateLimit: {
    authentication: {
      windowMs: parseInt(process.env['AUTH_RATE_LIMIT_WINDOW'] || '900000', 10), // 15 minutes
      maxRequests: parseInt(process.env['AUTH_RATE_LIMIT_MAX'] || '5', 10), // 5 attempts per window
      skipSuccessfulRequests: true,
      skipFailedRequests: false,
    },
    apiCalls: {
      windowMs: parseInt(process.env['API_RATE_LIMIT_WINDOW'] || '60000', 10), // 1 minute
      maxRequests: parseInt(process.env['API_RATE_LIMIT_MAX'] || '100', 10), // 100 requests per minute
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
    },
    memoryOperations: {
      windowMs: parseInt(process.env['MEMORY_RATE_LIMIT_WINDOW'] || '60000', 10), // 1 minute
      maxRequests: parseInt(process.env['MEMORY_RATE_LIMIT_MAX'] || '50', 10), // 50 memory operations per minute
      skipSuccessfulRequests: false,
      skipFailedRequests: true,
    },
  },
  encryption: {
    algorithm: process.env['ENCRYPTION_ALGORITHM'] || 'aes-256-gcm',
    keyLength: parseInt(process.env['ENCRYPTION_KEY_LENGTH'] || '32', 10),
    ivLength: parseInt(process.env['ENCRYPTION_IV_LENGTH'] || '16', 10),
  },
  audit: {
    enabled: process.env['AUDIT_ENABLED'] !== 'false',
    retentionDays: parseInt(process.env['AUDIT_RETENTION_DAYS'] || '90', 10),
    sensitiveFields: [
      'password',
      'passwordHash',
      'token',
      'refreshToken',
      'secret',
      'apiKey',
      'privateKey',
    ],
  },
};

/**
 * Development security configuration (less strict)
 */
export const developmentSecurityConfig: SecurityConfig = {
  ...defaultSecurityConfig,
  jwt: {
    ...defaultSecurityConfig.jwt,
    secret: 'development-secret-key',
    expiresIn: '24h', // Longer expiry for development
  },
  password: {
    ...defaultSecurityConfig.password,
    minLength: 4, // Shorter for development
    requireUppercase: false,
    requireLowercase: false,
    requireNumbers: false,
    requireSpecialChars: false,
    saltRounds: 4, // Faster hashing
  },
  rateLimit: {
    authentication: {
      ...defaultSecurityConfig.rateLimit.authentication,
      maxRequests: 100, // More lenient
    },
    apiCalls: {
      ...defaultSecurityConfig.rateLimit.apiCalls,
      maxRequests: 1000, // More lenient
    },
    memoryOperations: {
      ...defaultSecurityConfig.rateLimit.memoryOperations,
      maxRequests: 500, // More lenient
    },
  },
};

/**
 * Production security configuration (more strict)
 */
export const productionSecurityConfig: SecurityConfig = {
  ...defaultSecurityConfig,
  jwt: {
    ...defaultSecurityConfig.jwt,
    expiresIn: '15m', // Shorter expiry for production
    algorithm: 'HS512', // Stronger algorithm
  },
  password: {
    ...defaultSecurityConfig.password,
    minLength: 12, // Longer minimum
    saltRounds: 15, // More secure hashing
  },
  rateLimit: {
    authentication: {
      ...defaultSecurityConfig.rateLimit.authentication,
      windowMs: 1800000, // 30 minutes
      maxRequests: 3, // Stricter limit
    },
    apiCalls: {
      ...defaultSecurityConfig.rateLimit.apiCalls,
      maxRequests: 60, // Stricter limit
    },
    memoryOperations: {
      ...defaultSecurityConfig.rateLimit.memoryOperations,
      maxRequests: 30, // Stricter limit
    },
  },
  audit: {
    ...defaultSecurityConfig.audit,
    enabled: true,
    retentionDays: 365, // Longer retention
  },
};

/**
 * Get security configuration based on environment
 */
export function getSecurityConfig(environment?: string): SecurityConfig {
  const env = environment || process.env['NODE_ENV'] || 'development';

  switch (env) {
    case 'production':
      return productionSecurityConfig;
    case 'development':
    case 'dev':
      return developmentSecurityConfig;
    case 'test':
      return {
        ...developmentSecurityConfig,
        jwt: {
          ...developmentSecurityConfig.jwt,
          secret: 'test-secret-key',
          expiresIn: '1h',
        },
        password: {
          ...developmentSecurityConfig.password,
          saltRounds: 1, // Fastest for tests
        },
      };
    default:
      return defaultSecurityConfig;
  }
}

/**
 * Validate security configuration
 */
export function validateSecurityConfig(config: SecurityConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate JWT configuration
  if (!config.jwt.secret || config.jwt.secret.length < 32) {
    errors.push('JWT secret must be at least 32 characters long');
  }

  if (config.jwt.secret === 'layered-memory-secret-key-change-in-production') {
    errors.push('JWT secret must be changed from default value in production');
  }

  // Validate password requirements
  if (config.password.minLength < 4) {
    errors.push('Password minimum length must be at least 4 characters');
  }

  if (config.password.saltRounds < 1 || config.password.saltRounds > 20) {
    errors.push('Password salt rounds must be between 1 and 20');
  }

  // Validate rate limiting
  if (config.rateLimit.authentication.maxRequests < 1) {
    errors.push('Authentication rate limit max requests must be at least 1');
  }

  if (config.rateLimit.apiCalls.maxRequests < 1) {
    errors.push('API rate limit max requests must be at least 1');
  }

  // Validate encryption
  if (!['aes-256-gcm', 'aes-256-cbc'].includes(config.encryption.algorithm)) {
    errors.push('Encryption algorithm must be aes-256-gcm or aes-256-cbc');
  }

  if (config.encryption.keyLength !== 32) {
    errors.push('Encryption key length must be 32 bytes for AES-256');
  }

  // Validate audit configuration
  if (config.audit.retentionDays < 1) {
    errors.push('Audit retention days must be at least 1');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Security configuration validation middleware
 */
export function createSecurityConfigValidator() {
  const config = getSecurityConfig();
  const validation = validateSecurityConfig(config);

  if (!validation.valid) {
    throw new Error(
      `Invalid security configuration:\n${validation.errors.join('\n')}`
    );
  }

  return config;
}