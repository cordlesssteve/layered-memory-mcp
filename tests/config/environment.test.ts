/**
 * Unit tests for Environment Configuration
 */

import { describe, expect, it } from '@jest/globals';
import { getAuthSecret, generateSecureSecret } from '../../src/config/environment.js';
import type { Environment } from '../../src/config/environment.js';

describe('Environment Configuration', () => {
  describe('getAuthSecret', () => {
    it('should return provided auth secret when available', () => {
      const env: Environment = {
        nodeEnv: 'development',
        logLevel: 'info',
        authSecret: 'my-custom-secret-that-is-at-least-32-characters-long',
      } as Environment;

      const secret = getAuthSecret(env);
      expect(secret).toBe('my-custom-secret-that-is-at-least-32-characters-long');
    });

    it('should generate test secret for test environment', () => {
      const env: Environment = {
        nodeEnv: 'test',
        logLevel: 'silent',
      } as Environment;

      const secret = getAuthSecret(env);
      expect(secret).toMatch(/^test-secret-[a-f0-9]{32}$/);
    });

    it('should generate development secret for development environment', () => {
      const env: Environment = {
        nodeEnv: 'development',
        logLevel: 'silent',
      } as Environment;

      const secret = getAuthSecret(env);
      expect(secret).toMatch(/^dev-secret-[a-f0-9]{32}$/);
    });
  });

  describe('generateSecureSecret', () => {
    it('should generate secret with default length', () => {
      const secret = generateSecureSecret();
      expect(secret).toBeDefined();
      expect(typeof secret).toBe('string');
      expect(secret.length).toBe(128); // 64 bytes = 128 hex characters
    });

    it('should generate secret with custom length', () => {
      const secret = generateSecureSecret(32);
      expect(secret).toBeDefined();
      expect(typeof secret).toBe('string');
      expect(secret.length).toBe(64); // 32 bytes = 64 hex characters
    });

    it('should generate different secrets on each call', () => {
      const secret1 = generateSecureSecret(16);
      const secret2 = generateSecureSecret(16);
      expect(secret1).not.toBe(secret2);
    });

    it('should only contain hexadecimal characters', () => {
      const secret = generateSecureSecret(16);
      expect(secret).toMatch(/^[a-f0-9]+$/);
    });
  });
});
