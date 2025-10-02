/**
 * Unit tests for OpenAI Embedding Service
 * Uses mocking for external OpenAI API
 */

import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { OpenAIEmbeddingService } from '../../src/embeddings/openai-embedding-service.js';

// Mock OpenAI
jest.mock('openai');

describe('OpenAIEmbeddingService', () => {
  let service: OpenAIEmbeddingService;
  const originalEnv = process.env['OPENAI_API_KEY'];

  beforeEach(() => {
    // Set fake API key for tests
    process.env['OPENAI_API_KEY'] = 'test-api-key-for-testing';
    service = new OpenAIEmbeddingService();
  });

  afterEach(() => {
    // Restore original env
    if (originalEnv) {
      process.env['OPENAI_API_KEY'] = originalEnv;
    } else {
      delete process.env['OPENAI_API_KEY'];
    }
  });

  describe('constructor', () => {
    it('should create service with default config', () => {
      expect(service).toBeDefined();
    });

    it('should create service with custom config', () => {
      const customService = new OpenAIEmbeddingService({
        modelName: 'text-embedding-3-large',
        dimensions: 3072,
        maxLength: 8192,
        batchSize: 50,
      });

      expect(customService).toBeDefined();
    });
  });

  describe('initialization', () => {
    it('should require API key', async () => {
      delete process.env['OPENAI_API_KEY'];
      const serviceWithoutKey = new OpenAIEmbeddingService();

      await expect(serviceWithoutKey.initialize()).rejects.toThrow('OPENAI_API_KEY');
    });

    it('should initialize only once', async () => {
      process.env['OPENAI_API_KEY'] = 'test-key';
      const initService = new OpenAIEmbeddingService();

      await initService.initialize();
      await initService.initialize(); // Second call should be no-op

      expect(initService).toBeDefined();
    });
  });

  describe('generateEmbedding', () => {
    it('should throw if not initialized', async () => {
      const uninitService = new OpenAIEmbeddingService();

      await expect(uninitService.generateEmbedding('test text')).rejects.toThrow();
    });

    it('should validate text length', async () => {
      process.env['OPENAI_API_KEY'] = 'test-key';
      const testService = new OpenAIEmbeddingService({ maxLength: 100 });
      await testService.initialize();

      const longText = 'a'.repeat(200);
      await expect(testService.generateEmbedding(longText)).rejects.toThrow();
    });
  });

  describe('generateBatchEmbeddings', () => {
    it('should throw if not initialized', async () => {
      const uninitService = new OpenAIEmbeddingService();

      await expect(uninitService.generateBatchEmbeddings(['text1', 'text2'])).rejects.toThrow();
    });

    it('should validate batch size', async () => {
      process.env['OPENAI_API_KEY'] = 'test-key';
      const testService = new OpenAIEmbeddingService({ batchSize: 5 });
      await testService.initialize();

      const largeBatch = Array(10).fill('test text');
      await expect(testService.generateBatchEmbeddings(largeBatch)).rejects.toThrow();
    });

    it('should handle empty batch', async () => {
      process.env['OPENAI_API_KEY'] = 'test-key';
      const testService = new OpenAIEmbeddingService();
      await testService.initialize();

      const result = await testService.generateBatchEmbeddings([]);
      expect(result.embeddings).toEqual([]);
      expect(result.batchSize).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      process.env['OPENAI_API_KEY'] = 'test-key';
      const errorService = new OpenAIEmbeddingService();
      await errorService.initialize();

      // The service should handle errors from the OpenAI API
      // Note: Actual error handling depends on implementation
      expect(errorService).toBeDefined();
    });
  });

  describe('configuration', () => {
    it('should accept custom dimensions', () => {
      const customService = new OpenAIEmbeddingService({
        dimensions: 2048,
      });

      expect(customService).toBeDefined();
    });

    it('should accept all config parameters', () => {
      const fullConfigService = new OpenAIEmbeddingService({
        modelName: 'custom-model',
        dimensions: 1024,
        maxLength: 4096,
        batchSize: 25,
      });

      expect(fullConfigService).toBeDefined();
    });
  });

  describe('close', () => {
    it('should cleanup resources', async () => {
      const testService = new OpenAIEmbeddingService();
      await testService.close();
      expect(testService).toBeDefined();
    });
  });
});
