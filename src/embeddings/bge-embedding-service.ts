/**
 * BGE Base Embedding Service - High quality text embeddings
 * Phase 2.1: Enhanced Single Node Architecture
 * Using BGE-base-en-v1.5 for excellent semantic understanding with good performance
 */

import { pipeline } from '@xenova/transformers';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('bge-base-service');

export interface EmbeddingConfig {
  modelName: string;
  dimensions: number;
  maxLength: number;
  normalize: boolean;
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

export class BGEEmbeddingService {
  private pipeline: any | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;

  private readonly config: EmbeddingConfig = {
    modelName: 'Xenova/bge-base-en-v1.5', // BGE base model - good quality/performance balance
    dimensions: 768, // BGE-base-en-v1.5 dimensions
    maxLength: 512,
    normalize: true,
    batchSize: 16, // Good batch size for base model
  };

  constructor(customConfig?: Partial<EmbeddingConfig>) {
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }

    logger.info('BGE Base Embedding Service initialized', {
      model: this.config.modelName,
      dimensions: this.config.dimensions,
      maxLength: this.config.maxLength,
    });
  }

  /**
   * Initialize the BGE model pipeline
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._initializeModel();
    return this.initializationPromise;
  }

  private async _initializeModel(): Promise<void> {
    try {
      logger.info('Loading BGE Large model...', { model: this.config.modelName });

      this.pipeline = await pipeline(
        'feature-extraction',
        this.config.modelName,
        {
          quantized: false, // Use non-quantized model since quantized not available
          local_files_only: false, // Allow downloading if not cached
        }
      );

      this.isInitialized = true;
      logger.info('BGE Large model loaded successfully', {
        model: this.config.modelName,
        dimensions: this.config.dimensions,
      });
    } catch (error) {
      logger.error('Failed to load BGE Large model', {
        model: this.config.modelName,
        error: error instanceof Error ? error.message : error,
      });
      throw new Error(`BGE Large model initialization failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<EmbeddingResponse> {
    await this.initialize();

    if (!this.pipeline) {
      throw new Error('BGE pipeline not initialized');
    }

    const startTime = Date.now();

    try {
      // Preprocess text
      const processedText = this.preprocessText(text);

      // Generate embedding
      const result = await this.pipeline(processedText, {
        pooling: 'mean',
        normalize: this.config.normalize,
      });

      // Extract embedding array
      let embedding: number[];
      if (Array.isArray(result) && result.length > 0) {
        embedding = Array.from(result[0] as number[]);
      } else if (result && typeof result === 'object' && 'data' in result) {
        embedding = Array.from((result as any).data as number[]);
      } else {
        throw new Error('Unexpected embedding format from BGE model');
      }

      // Validate dimensions
      if (embedding.length !== this.config.dimensions) {
        logger.warn('Embedding dimension mismatch', {
          expected: this.config.dimensions,
          actual: embedding.length,
          text: processedText.substring(0, 100),
        });
      }

      const processingTime = Date.now() - startTime;

      logger.debug('Generated embedding', {
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
      logger.error('Embedding generation failed', {
        textLength: text.length,
        processingTime,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   * Note: Xenova transformers work better with individual calls for now
   */
  async generateBatchEmbeddings(texts: string[]): Promise<BatchEmbeddingResponse> {
    await this.initialize();

    if (!this.pipeline) {
      throw new Error('Pipeline not initialized');
    }

    const startTime = Date.now();

    try {
      // Process each text individually for Xenova compatibility
      const allEmbeddings: number[][] = [];

      for (const text of texts) {
        const result = await this.generateEmbedding(text);
        allEmbeddings.push(result.embedding);
      }

      const processingTime = Date.now() - startTime;

      logger.debug('Generated batch embeddings', {
        textCount: texts.length,
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
      logger.error('Batch embedding generation failed', {
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
   * Close the embedding service and free resources
   */
  async close(): Promise<void> {
    if (this.pipeline) {
      // Dispose of the pipeline if it has a dispose method
      if ('dispose' in this.pipeline && typeof this.pipeline.dispose === 'function') {
        await (this.pipeline as any).dispose();
      }
      this.pipeline = null;
    }

    this.isInitialized = false;
    this.initializationPromise = null;

    logger.info('BGE Large Embedding Service closed');
  }

  // Private helper methods

  private preprocessText(text: string): string {
    // BGE models work best with the "Represent this sentence for searching relevant passages:" prefix
    // for query texts, but for general embeddings we use the text as-is
    let processedText = text.trim();

    // Truncate to max length if necessary
    if (processedText.length > this.config.maxLength * 4) { // Rough character to token ratio
      processedText = processedText.substring(0, this.config.maxLength * 4);
      logger.debug('Text truncated to max length', {
        originalLength: text.length,
        truncatedLength: processedText.length,
      });
    }

    return processedText;
  }

}

// Export singleton instance
export const bgeEmbeddingService = new BGEEmbeddingService();