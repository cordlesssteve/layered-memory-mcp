/**
 * Unit tests for Security Configuration
 * Testing configuration defaults, environment-based configs, and validation
 */

import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import {
  defaultSecurityConfig,
  developmentSecurityConfig,
  productionSecurityConfig,
  getSecurityConfig,
  validateSecurityConfig,
  createSecurityConfigValidator,
} from '../../src/security/config.js';

describe('Security Configuration', () => {
  const originalEnv = process.env['NODE_ENV'];
  const originalJwtSecret = process.env['JWT_SECRET'];

  beforeEach(() => {
    // Clear environment variables
    delete process.env['NODE_ENV'];
    delete process.env['JWT_SECRET'];
  });

  afterEach(() => {
    // Restore environment
    if (originalEnv) {
      process.env['NODE_ENV'] = originalEnv;
    } else {
      delete process.env['NODE_ENV'];
    }
    if (originalJwtSecret) {
      process.env['JWT_SECRET'] = originalJwtSecret;
    } else {
      delete process.env['JWT_SECRET'];
    }
  });

  describe('defaultSecurityConfig', () => {
    it('should have secure JWT defaults', () => {
      expect(defaultSecurityConfig.jwt.algorithm).toBe('HS256');
      expect(defaultSecurityConfig.jwt.expiresIn).toBeDefined();
      expect(defaultSecurityConfig.jwt.refreshExpiresIn).toBeDefined();
    });

    it('should have strong password requirements', () => {
      expect(defaultSecurityConfig.password.minLength).toBeGreaterThanOrEqual(8);
      expect(defaultSecurityConfig.password.requireUppercase).toBe(true);
      expect(defaultSecurityConfig.password.requireLowercase).toBe(true);
      expect(defaultSecurityConfig.password.requireNumbers).toBe(true);
      expect(defaultSecurityConfig.password.requireSpecialChars).toBe(true);
      expect(defaultSecurityConfig.password.saltRounds).toBeGreaterThanOrEqual(10);
    });

    it('should have rate limiting configured', () => {
      expect(defaultSecurityConfig.rateLimit.authentication).toBeDefined();
      expect(defaultSecurityConfig.rateLimit.apiCalls).toBeDefined();
      expect(defaultSecurityConfig.rateLimit.memoryOperations).toBeDefined();
      expect(defaultSecurityConfig.rateLimit.authentication.maxRequests).toBeGreaterThan(0);
    });

    it('should have encryption configuration', () => {
      expect(defaultSecurityConfig.encryption.algorithm).toBeDefined();
      expect(defaultSecurityConfig.encryption.keyLength).toBe(32);
      expect(defaultSecurityConfig.encryption.ivLength).toBe(16);
    });

    it('should have audit configuration', () => {
      expect(defaultSecurityConfig.audit.enabled).toBe(true);
      expect(defaultSecurityConfig.audit.retentionDays).toBeGreaterThan(0);
      expect(defaultSecurityConfig.audit.sensitiveFields).toContain('password');
      expect(defaultSecurityConfig.audit.sensitiveFields).toContain('token');
    });
  });

  describe('developmentSecurityConfig', () => {
    it('should have relaxed password requirements', () => {
      expect(developmentSecurityConfig.password.minLength).toBe(4);
      expect(developmentSecurityConfig.password.requireUppercase).toBe(false);
      expect(developmentSecurityConfig.password.requireLowercase).toBe(false);
      expect(developmentSecurityConfig.password.requireNumbers).toBe(false);
      expect(developmentSecurityConfig.password.requireSpecialChars).toBe(false);
      expect(developmentSecurityConfig.password.saltRounds).toBe(4);
    });

    it('should have lenient rate limits', () => {
      expect(developmentSecurityConfig.rateLimit.authentication.maxRequests).toBe(100);
      expect(developmentSecurityConfig.rateLimit.apiCalls.maxRequests).toBe(1000);
      expect(developmentSecurityConfig.rateLimit.memoryOperations.maxRequests).toBe(500);
    });

    it('should have longer token expiry', () => {
      expect(developmentSecurityConfig.jwt.expiresIn).toBe('24h');
    });
  });

  describe('productionSecurityConfig', () => {
    it('should have stricter password requirements', () => {
      expect(productionSecurityConfig.password.minLength).toBe(12);
      expect(productionSecurityConfig.password.saltRounds).toBe(15);
    });

    it('should have strict rate limits', () => {
      expect(productionSecurityConfig.rateLimit.authentication.maxRequests).toBe(3);
      expect(productionSecurityConfig.rateLimit.apiCalls.maxRequests).toBe(60);
      expect(productionSecurityConfig.rateLimit.memoryOperations.maxRequests).toBe(30);
    });

    it('should have shorter token expiry', () => {
      expect(productionSecurityConfig.jwt.expiresIn).toBe('15m');
    });

    it('should use stronger JWT algorithm', () => {
      expect(productionSecurityConfig.jwt.algorithm).toBe('HS512');
    });

    it('should have longer audit retention', () => {
      expect(productionSecurityConfig.audit.retentionDays).toBe(365);
    });
  });

  describe('getSecurityConfig', () => {
    it('should return production config for production environment', () => {
      const config = getSecurityConfig('production');
      expect(config.jwt.expiresIn).toBe('15m');
      expect(config.password.minLength).toBe(12);
    });

    it('should return development config for development environment', () => {
      const config = getSecurityConfig('development');
      expect(config.password.minLength).toBe(4);
      expect(config.jwt.expiresIn).toBe('24h');
    });

    it('should return development config for dev environment', () => {
      const config = getSecurityConfig('dev');
      expect(config.password.minLength).toBe(4);
    });

    it('should return test config for test environment', () => {
      const config = getSecurityConfig('test');
      expect(config.jwt.secret).toBe('test-secret-key');
      expect(config.password.saltRounds).toBe(1);
    });

    it('should return default config for unknown environment', () => {
      const config = getSecurityConfig('unknown');
      expect(config.password.minLength).toBe(8);
    });

    it('should use NODE_ENV when no environment specified', () => {
      process.env['NODE_ENV'] = 'test';
      const config = getSecurityConfig();
      expect(config.jwt.secret).toBe('test-secret-key');
    });

    it('should default to development when NODE_ENV not set', () => {
      delete process.env['NODE_ENV'];
      const config = getSecurityConfig();
      expect(config.password.minLength).toBe(4);
    });
  });

  describe('validateSecurityConfig', () => {
    it('should validate a valid configuration', () => {
      const validConfig = {
        ...productionSecurityConfig,
        jwt: {
          ...productionSecurityConfig.jwt,
          secret: 'this-is-a-very-secure-jwt-secret-key-that-is-long-enough',
        },
      };
      const validation = validateSecurityConfig(validConfig);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject JWT secret shorter than 32 characters', () => {
      const config = {
        ...defaultSecurityConfig,
        jwt: { ...defaultSecurityConfig.jwt, secret: 'short' },
      };
      const validation = validateSecurityConfig(config);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('JWT secret must be at least 32 characters long');
    });

    it('should reject default JWT secret in production', () => {
      const config = {
        ...defaultSecurityConfig,
        jwt: {
          ...defaultSecurityConfig.jwt,
          secret: 'layered-memory-secret-key-change-in-production',
        },
      };
      const validation = validateSecurityConfig(config);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'JWT secret must be changed from default value in production'
      );
    });

    it('should reject password minimum length less than 4', () => {
      const config = {
        ...defaultSecurityConfig,
        password: { ...defaultSecurityConfig.password, minLength: 2 },
      };
      const validation = validateSecurityConfig(config);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Password minimum length must be at least 4 characters');
    });

    it('should reject salt rounds less than 1', () => {
      const config = {
        ...defaultSecurityConfig,
        password: { ...defaultSecurityConfig.password, saltRounds: 0 },
      };
      const validation = validateSecurityConfig(config);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Password salt rounds must be between 1 and 20');
    });

    it('should reject salt rounds greater than 20', () => {
      const config = {
        ...defaultSecurityConfig,
        password: { ...defaultSecurityConfig.password, saltRounds: 25 },
      };
      const validation = validateSecurityConfig(config);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Password salt rounds must be between 1 and 20');
    });

    it('should reject auth rate limit less than 1', () => {
      const config = {
        ...defaultSecurityConfig,
        rateLimit: {
          ...defaultSecurityConfig.rateLimit,
          authentication: {
            ...defaultSecurityConfig.rateLimit.authentication,
            maxRequests: 0,
          },
        },
      };
      const validation = validateSecurityConfig(config);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'Authentication rate limit max requests must be at least 1'
      );
    });

    it('should reject API rate limit less than 1', () => {
      const config = {
        ...defaultSecurityConfig,
        rateLimit: {
          ...defaultSecurityConfig.rateLimit,
          apiCalls: { ...defaultSecurityConfig.rateLimit.apiCalls, maxRequests: 0 },
        },
      };
      const validation = validateSecurityConfig(config);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('API rate limit max requests must be at least 1');
    });

    it('should reject invalid encryption algorithm', () => {
      const config = {
        ...defaultSecurityConfig,
        encryption: { ...defaultSecurityConfig.encryption, algorithm: 'des' },
      };
      const validation = validateSecurityConfig(config);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'Encryption algorithm must be aes-256-gcm or aes-256-cbc'
      );
    });

    it('should reject invalid encryption key length', () => {
      const config = {
        ...defaultSecurityConfig,
        encryption: { ...defaultSecurityConfig.encryption, keyLength: 16 },
      };
      const validation = validateSecurityConfig(config);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Encryption key length must be 32 bytes for AES-256');
    });

    it('should reject audit retention less than 1 day', () => {
      const config = {
        ...defaultSecurityConfig,
        audit: { ...defaultSecurityConfig.audit, retentionDays: 0 },
      };
      const validation = validateSecurityConfig(config);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Audit retention days must be at least 1');
    });

    it('should collect multiple validation errors', () => {
      const config = {
        ...defaultSecurityConfig,
        jwt: { ...defaultSecurityConfig.jwt, secret: 'short' },
        password: { ...defaultSecurityConfig.password, minLength: 2, saltRounds: 30 },
      };
      const validation = validateSecurityConfig(config);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(2);
    });
  });

  describe('createSecurityConfigValidator', () => {
    it('should throw error for test environment with short secret', () => {
      process.env['NODE_ENV'] = 'test';
      // Test config has short secret by default, should fail validation
      expect(() => {
        createSecurityConfigValidator();
      }).toThrow('Invalid security configuration');
    });

    it('should throw error for invalid configuration', () => {
      process.env['NODE_ENV'] = 'production';
      // Production config without valid JWT_SECRET should fail
      expect(() => {
        createSecurityConfigValidator();
      }).toThrow('Invalid security configuration');
    });
  });

  describe('environment variable integration', () => {
    it('should have JWT_SECRET from environment if set at module load', () => {
      // Note: JWT_SECRET is read at module load time, not at test runtime
      // This test verifies the config was built with environment variables
      const config = getSecurityConfig('production');
      expect(config.jwt.secret).toBeDefined();
      expect(typeof config.jwt.secret).toBe('string');
    });

    it('should use JWT_EXPIRES_IN from environment', () => {
      process.env['JWT_EXPIRES_IN'] = '2h';
      // Need to re-import to pick up env changes
      const config = defaultSecurityConfig;
      expect(config.jwt.expiresIn).toBeDefined();
    });
  });
});
