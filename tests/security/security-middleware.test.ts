/**
 * Unit tests for Security Middleware
 */

import { describe, expect, it, beforeEach } from '@jest/globals';
import { SecurityMiddleware } from '../../src/security/security-middleware.js';
import type { Environment } from '../../src/config/environment.js';

const testEnv: Environment = {
  nodeEnv: 'test',
  logLevel: 'silent',
  telemetryEnabled: false,
  performanceMonitoringEnabled: false,
} as Environment;

describe('SecurityMiddleware', () => {
  let middleware: SecurityMiddleware;

  beforeEach(() => {
    middleware = new SecurityMiddleware(testEnv);
  });

  describe('constructor', () => {
    it('should create middleware with default config', () => {
      expect(middleware).toBeDefined();
    });

    it('should create middleware with custom config', () => {
      const customMiddleware = new SecurityMiddleware(testEnv, {
        rateLimiting: { enabled: false },
        validation: { enabled: false, sanitizeContent: false },
        headers: { enabled: false, includeSecurityHeaders: false },
        monitoring: { enabled: false, logFailedAttempts: false, logSuccessfulRequests: false },
      });
      expect(customMiddleware).toBeDefined();
    });
  });

  describe('checkRequest', () => {
    it('should allow request with valid context', async () => {
      const result = await middleware.checkRequest('test_operation', {
        sessionId: 'test-session',
        ip: '127.0.0.1',
      });

      expect(result.allowed).toBe(true);
    });

    it('should include security headers when enabled', async () => {
      const result = await middleware.checkRequest('test_operation', {
        sessionId: 'test-session',
      });

      expect(result.headers).toBeDefined();
      if (result.headers) {
        expect(result.headers['X-Content-Type-Options']).toBeDefined();
        expect(result.headers['X-Frame-Options']).toBeDefined();
      }
    });

    it('should handle request without security headers', async () => {
      const noHeadersMiddleware = new SecurityMiddleware(testEnv, {
        headers: { enabled: false, includeSecurityHeaders: false },
      });

      const result = await noHeadersMiddleware.checkRequest('test_operation', {
        sessionId: 'test-session',
      });

      expect(result.headers).toBeUndefined();
    });

    it('should handle missing context gracefully', async () => {
      const result = await middleware.checkRequest('test_operation', {});
      expect(result).toBeDefined();
      expect(result.allowed).toBeDefined();
    });
  });

  describe('different configurations', () => {
    it('should work with validation enabled', () => {
      const validationMiddleware = new SecurityMiddleware(testEnv, {
        validation: { enabled: true, sanitizeContent: true },
      });

      expect(validationMiddleware).toBeDefined();
    });

    it('should work with validation disabled', () => {
      const noValidationMiddleware = new SecurityMiddleware(testEnv, {
        validation: { enabled: false, sanitizeContent: false },
      });

      expect(noValidationMiddleware).toBeDefined();
    });

    it('should work with all features enabled', () => {
      const fullMiddleware = new SecurityMiddleware(testEnv, {
        rateLimiting: { enabled: true },
        validation: { enabled: true, sanitizeContent: true },
        headers: { enabled: true, includeSecurityHeaders: true },
        monitoring: { enabled: true, logFailedAttempts: true, logSuccessfulRequests: true },
      });

      expect(fullMiddleware).toBeDefined();
    });
  });

  describe('rate limiting', () => {
    it('should work with rate limiting enabled', async () => {
      const strictMiddleware = new SecurityMiddleware(testEnv, {
        rateLimiting: { enabled: true },
      });

      const context = { sessionId: 'rate-limit-test', ip: '192.168.1.1' };

      // Make a few requests
      const result1 = await strictMiddleware.checkRequest('test_op', context);
      const result2 = await strictMiddleware.checkRequest('test_op', context);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });

    it('should skip rate limiting when disabled', async () => {
      const noRateLimitMiddleware = new SecurityMiddleware(testEnv, {
        rateLimiting: { enabled: false },
      });

      const context = { sessionId: 'no-limit-test' };

      // Make a few requests - all should be allowed
      const result1 = await noRateLimitMiddleware.checkRequest('test_op', context);
      const result2 = await noRateLimitMiddleware.checkRequest('test_op', context);

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });
  });

  describe('monitoring', () => {
    it('should work with monitoring disabled', async () => {
      const noMonitorMiddleware = new SecurityMiddleware(testEnv, {
        monitoring: { enabled: false, logFailedAttempts: false, logSuccessfulRequests: false },
      });

      const result = await noMonitorMiddleware.checkRequest('test_op', {
        sessionId: 'no-monitor-test',
      });

      expect(result.allowed).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle invalid data gracefully', async () => {
      const result = await middleware.checkRequest('test_op', {
        sessionId: undefined,
        ip: undefined,
      });

      expect(result).toBeDefined();
      expect(typeof result.allowed).toBe('boolean');
    });
  });
});
