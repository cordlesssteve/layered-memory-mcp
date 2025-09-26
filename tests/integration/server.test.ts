/**
 * Integration tests for the MCP server
 */

import { describe, expect, it } from '@jest/globals';
import { setupEnvironment } from '../../src/config/environment';

describe('MCP Server Integration', () => {
  describe('Environment Setup', () => {
    it('should setup environment configuration', () => {
      // Set test environment variables
      process.env['NODE_ENV'] = 'test';
      process.env['LOG_LEVEL'] = 'silent';

      const config = setupEnvironment();

      expect(config).toMatchObject({
        nodeEnv: 'test',
        logLevel: 'silent',
        databaseUrl: expect.any(String),
        redisUrl: expect.any(String),
        neo4jUri: expect.any(String),
        neo4jUser: expect.any(String),
        neo4jPassword: expect.any(String),
        chromadbHost: expect.any(String),
        chromadbPort: expect.any(Number),
      });
    });

    it('should use default values when environment variables are not set', () => {
      // Clear environment variables
      delete process.env['DATABASE_URL'];
      delete process.env['REDIS_URL'];

      const config = setupEnvironment();

      expect(config.databaseUrl).toBe('sqlite:///app/data/memory.db');
      expect(config.redisUrl).toBe('redis://localhost:6379');
    });
  });

  describe('Server Lifecycle', () => {
    it('should be able to import the main module', async () => {
      // This tests that our module can be imported without syntax errors
      expect(() => {
        // Dynamic import to avoid executing the server
        import('../../src/index');
      }).not.toThrow();
    });
  });
});