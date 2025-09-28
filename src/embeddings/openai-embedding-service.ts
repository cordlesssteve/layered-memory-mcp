/**
 * OpenAI Embedding Service - Production-ready text embeddings using OpenAI API
 * Phase 2.1: Enhanced Single Node Architecture
 */

import OpenAI from 'openai';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('openai-embedding-service');

export interface EmbeddingConfig {
  modelName: string;
  dimensions: number;
  maxLength: number;
  batchSize: number;
}

export interface EmbeddingResponse {
  embedding: number[];
  dimensions: number;
  processingTime: number;
}

export interface BatchEmbeddingResponse {
  embeddings: number[][];
  dimensions: number;
  processingTime: number;
  batchSize: number;
}

export class OpenAIEmbeddingService {
  private openai: OpenAI | null = null;
  private isInitialized = false;

  private readonly config: EmbeddingConfig = {
    modelName: 'text-embedding-3-small', // 1536 dimensions, good quality
    dimensions: 1536,
    maxLength: 8192, // OpenAI limit
    batchSize: 100, // OpenAI batch limit
  };

  constructor(customConfig?: Partial<EmbeddingConfig>) {
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }

    logger.info('OpenAI Embedding Service initialized', {
      model: this.config.modelName,
      dimensions: this.config.dimensions,
      maxLength: this.config.maxLength,
    });
  }

  /**
   * Initialize the OpenAI client
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const apiKey = process.env['OPENAI_API_KEY'];
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required');
      }

      this.openai = new OpenAI({
        apiKey,
      });

      this.isInitialized = true;
      logger.info('OpenAI client initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize OpenAI client', {
        error: error instanceof Error ? error.message : error,
      });
      throw new Error(`OpenAI initialization failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<EmbeddingResponse> {
    await this.initialize();

    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    const startTime = Date.now();

    try {
      // Preprocess text
      const processedText = this.preprocessText(text);

      // Generate embedding
      const response = await this.openai.embeddings.create({
        model: this.config.modelName,
        input: processedText,
        encoding_format: 'float',
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('No embedding data returned from OpenAI');
      }

      const embedding = response.data[0]!.embedding;
      const processingTime = Date.now() - startTime;

      // Validate dimensions
      if (embedding.length !== this.config.dimensions) {
        logger.warn('Embedding dimension mismatch', {
          expected: this.config.dimensions,
          actual: embedding.length,
          text: processedText.substring(0, 100),
        });
      }

      logger.debug('Generated OpenAI embedding', {
        textLength: text.length,
        embeddingDimensions: embedding.length,
        processingTime,
      });

      return {
        embedding,
        dimensions: embedding.length,
        processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('OpenAI embedding generation failed', {
        textLength: text.length,
        processingTime,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateBatchEmbeddings(texts: string[]): Promise<BatchEmbeddingResponse> {
    await this.initialize();

    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    const startTime = Date.now();

    try {
      // Process texts in batches to respect API limits
      const batches = this.chunkArray(texts, this.config.batchSize);
      const allEmbeddings: number[][] = [];

      for (const batch of batches) {
        const processedTexts = batch.map(text => this.preprocessText(text));

        const response = await this.openai.embeddings.create({
          model: this.config.modelName,
          input: processedTexts,
          encoding_format: 'float',
        });

        if (!response.data || response.data.length !== processedTexts.length) {
          throw new Error(`Batch embedding mismatch: expected ${processedTexts.length}, got ${response.data?.length || 0}`);
        }

        const batchEmbeddings = response.data.map(item => item.embedding);
        allEmbeddings.push(...batchEmbeddings);

        // Small delay between batches to avoid rate limits
        if (batches.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      const processingTime = Date.now() - startTime;

      logger.debug('Generated batch OpenAI embeddings', {
        textCount: texts.length,
        batchCount: batches.length,
        embeddingDimensions: allEmbeddings[0]?.length || 0,
        processingTime,
      });

      return {
        embeddings: allEmbeddings,
        dimensions: allEmbeddings[0]?.length || this.config.dimensions,
        processingTime,
        batchSize: texts.length,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Batch OpenAI embedding generation failed', {
        textCount: texts.length,
        processingTime,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Calculate similarity between two embeddings using cosine similarity
   */
  calculateSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      throw new Error(`Embedding dimension mismatch: ${embedding1.length} vs ${embedding2.length}`);
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      const val1 = embedding1[i]!;
      const val2 = embedding2[i]!;

      dotProduct += val1 * val2;
      norm1 += val1 * val1;
      norm2 += val2 * val2;
    }

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * Get embedding service statistics
   */
  getStats(): {
    modelName: string;
    dimensions: number;
    isInitialized: boolean;
    config: EmbeddingConfig;
  } {
    return {
      modelName: this.config.modelName,
      dimensions: this.config.dimensions,
      isInitialized: this.isInitialized,
      config: { ...this.config },
    };
  }

  /**
   * Close the embedding service
   */
  async close(): Promise<void> {
    this.openai = null;
    this.isInitialized = false;
    logger.info('OpenAI Embedding Service closed');
  }

  // Private helper methods

  private preprocessText(text: string): string {
    let processedText = text.trim();

    // Truncate to max length if necessary (rough token estimation)
    const maxChars = this.config.maxLength * 4; // Rough character to token ratio
    if (processedText.length > maxChars) {
      processedText = processedText.substring(0, maxChars);
      logger.debug('Text truncated to max length', {
        originalLength: text.length,
        truncatedLength: processedText.length,
      });
    }

    return processedText;
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }
}

// Export singleton instance
export const openaiEmbeddingService = new OpenAIEmbeddingService();