/**
 * FAISS Vector Search Service - High-performance similarity search with BGE embeddings
 * Phase 2.1: Enhanced Single Node Architecture
 */

import faissNode from 'faiss-node';
const { IndexFlatIP, MetricType } = faissNode;
import { createLogger } from '../utils/logger.js';
import { BGEEmbeddingService } from './bge-embedding-service.js';
import { readFile, writeFile, access, mkdir } from 'fs/promises';
import { join } from 'path';

const logger = createLogger('faiss-vector-service');

export interface VectorSearchResult {
  id: string;
  score: number;
  embedding?: number[];
}

export interface VectorIndexStats {
  totalVectors: number;
  dimensions: number;
  indexType: string;
  memoryUsage: number;
  lastOptimized?: Date | undefined;
}

export interface FAISSConfig {
  dimensions: number;
  metricType: any;
  useIVFIndex: boolean;
  nlist: number; // Number of clusters for IVF
  nprobe: number; // Number of clusters to search
  persistencePath: string;
  autoOptimizeThreshold: number; // Vectors count to trigger IVF optimization
}

export class FAISSVectorService {
  private index: any | null = null;
  private embeddingService: BGEEmbeddingService;
  private vectorToIdMap = new Map<number, string>(); // Maps vector position to ID
  private idToVectorMap = new Map<string, number>(); // Maps ID to vector position
  private isInitialized = false;
  private vectorCount = 0;

  private readonly config: FAISSConfig = {
    dimensions: 768, // BGE-base-en-v1.5 embedding dimensions
    metricType: MetricType.METRIC_INNER_PRODUCT,
    useIVFIndex: false, // Using flat index only for now
    nlist: 100,
    nprobe: 10,
    persistencePath: './data/faiss',
    autoOptimizeThreshold: 10000, // Higher threshold since no IVF available
  };

  constructor(embeddingService: BGEEmbeddingService, customConfig?: Partial<FAISSConfig>) {
    this.embeddingService = embeddingService;

    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }

    logger.info('FAISS Vector Service initialized', {
      dimensions: this.config.dimensions,
      metricType: this.config.metricType,
      useIVFIndex: this.config.useIVFIndex,
      persistencePath: this.config.persistencePath,
    });
  }

  /**
   * Initialize the FAISS index
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.ensureDirectoryExists(this.config.persistencePath);

      // Try to load existing index
      const loaded = await this.loadIndex();
      if (!loaded) {
        // Create new index
        await this.createIndex();
      }

      this.isInitialized = true;
      logger.info('FAISS index initialized', {
        vectorCount: this.vectorCount,
        indexType: this.index?.constructor.name,
        dimensions: this.config.dimensions,
      });
    } catch (error) {
      logger.error('Failed to initialize FAISS index', {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Add a single vector to the index
   */
  async addVector(id: string, text: string): Promise<void> {
    await this.initialize();

    if (!this.index) {
      throw new Error('FAISS index not initialized');
    }

    try {
      // Generate embedding
      const embeddingResponse = await this.embeddingService.generateEmbedding(text);
      const { embedding } = embeddingResponse;

      // Validate dimensions
      if (embedding.length !== this.config.dimensions) {
        throw new Error(
          `Embedding dimension mismatch: expected ${this.config.dimensions}, got ${embedding.length}`
        );
      }

      // Check if ID already exists
      if (this.idToVectorMap.has(id)) {
        await this.removeVector(id);
      }

      // Add to index
      const position = this.vectorCount;
      this.index.add(embedding);

      // Update mappings
      this.vectorToIdMap.set(position, id);
      this.idToVectorMap.set(id, position);
      this.vectorCount++;

      // Note: Using flat index only for this implementation

      logger.debug('Vector added to FAISS index', {
        id,
        position,
        vectorCount: this.vectorCount,
        textLength: text.length,
        embeddingDimensions: embedding.length,
      });
    } catch (error) {
      logger.error('Failed to add vector to FAISS index', {
        id,
        textLength: text.length,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Add multiple vectors in batch
   */
  async addVectorsBatch(items: Array<{ id: string; text: string }>): Promise<void> {
    await this.initialize();

    if (!this.index) {
      throw new Error('FAISS index not initialized');
    }

    try {
      // Generate embeddings in batch
      const texts = items.map(item => item.text);
      const batchResponse = await this.embeddingService.generateBatchEmbeddings(texts);
      const { embeddings } = batchResponse;

      if (embeddings.length !== items.length) {
        throw new Error('Batch embedding count mismatch');
      }

      // Add all vectors to index
      const embeddingsArray = new Float32Array(embeddings.length * this.config.dimensions);
      const startPosition = this.vectorCount;

      for (let i = 0; i < embeddings.length; i++) {
        const embedding = embeddings[i]!;
        const item = items[i]!;

        // Validate dimensions
        if (embedding.length !== this.config.dimensions) {
          throw new Error(
            `Embedding dimension mismatch for ${item.id}: expected ${this.config.dimensions}, got ${embedding.length}`
          );
        }

        // Remove existing if present
        if (this.idToVectorMap.has(item.id)) {
          await this.removeVector(item.id);
        }

        // Copy embedding to batch array
        for (let j = 0; j < this.config.dimensions; j++) {
          embeddingsArray[i * this.config.dimensions + j] = embedding[j]!;
        }

        // Update mappings
        const position = startPosition + i;
        this.vectorToIdMap.set(position, item.id);
        this.idToVectorMap.set(item.id, position);
      }

      // Add batch to index
      this.index.add(Array.from(embeddingsArray));
      this.vectorCount += embeddings.length;

      // Note: Using flat index only for this implementation

      logger.info('Batch vectors added to FAISS index', {
        batchSize: items.length,
        vectorCount: this.vectorCount,
        processingTime: batchResponse.processingTime,
      });
    } catch (error) {
      logger.error('Failed to add batch vectors to FAISS index', {
        batchSize: items.length,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Search for similar vectors
   */
  async searchSimilar(text: string, topK = 10, threshold = 0.0): Promise<VectorSearchResult[]> {
    await this.initialize();

    if (!this.index) {
      throw new Error('FAISS index not initialized');
    }

    if (this.vectorCount === 0) {
      return [];
    }

    try {
      // Generate query embedding
      const embeddingResponse = await this.embeddingService.generateEmbedding(text);
      const queryEmbedding = embeddingResponse.embedding;

      // Validate dimensions
      if (queryEmbedding.length !== this.config.dimensions) {
        throw new Error(
          `Query embedding dimension mismatch: expected ${this.config.dimensions}, got ${queryEmbedding.length}`
        );
      }

      // Search index
      const searchResults = this.index.search(queryEmbedding, topK);

      // Convert results
      const results: VectorSearchResult[] = [];
      for (let i = 0; i < searchResults.labels.length; i++) {
        const position = searchResults.labels[i]!;
        const score = searchResults.distances[i]!;

        // Apply threshold filter
        if (score < threshold) {
          continue;
        }

        const id = this.vectorToIdMap.get(position);
        if (id) {
          results.push({
            id,
            score,
          });
        }
      }

      logger.debug('FAISS similarity search completed', {
        queryTextLength: text.length,
        topK,
        threshold,
        resultsFound: results.length,
        embeddingTime: embeddingResponse.processingTime,
      });

      return results;
    } catch (error) {
      logger.error('FAISS similarity search failed', {
        queryTextLength: text.length,
        topK,
        threshold,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Remove a vector from the index
   */
  async removeVector(id: string): Promise<boolean> {
    await this.initialize();

    const position = this.idToVectorMap.get(id);
    if (position === undefined) {
      return false;
    }

    // Remove from mappings
    this.vectorToIdMap.delete(position);
    this.idToVectorMap.delete(id);

    logger.debug('Vector removed from FAISS index', { id, position });
    return true;
  }

  /**
   * Get index statistics
   */
  getStats(): VectorIndexStats {
    const memoryUsage = this.estimateMemoryUsage();

    return {
      totalVectors: this.vectorCount,
      dimensions: this.config.dimensions,
      indexType: this.index?.constructor.name || 'None',
      memoryUsage,
      lastOptimized: undefined,
    };
  }

  /**
   * Optimize index (no-op for flat index)
   */
  async optimize(): Promise<void> {
    // Flat index doesn't need optimization
    logger.debug('Index optimization skipped (flat index)');
  }

  /**
   * Save index to disk
   */
  async saveIndex(): Promise<void> {
    if (!this.index || !this.isInitialized) {
      return;
    }

    try {
      await this.ensureDirectoryExists(this.config.persistencePath);

      const indexPath = join(this.config.persistencePath, 'faiss.index');
      const mappingPath = join(this.config.persistencePath, 'mappings.json');

      // Save FAISS index
      this.index.write(indexPath);

      // Save mappings
      const mappings = {
        vectorToId: Object.fromEntries(this.vectorToIdMap),
        idToVector: Object.fromEntries(this.idToVectorMap),
        vectorCount: this.vectorCount,
        config: this.config,
        savedAt: new Date().toISOString(),
      };

      await writeFile(mappingPath, JSON.stringify(mappings, null, 2));

      logger.info('FAISS index saved to disk', {
        indexPath,
        mappingPath,
        vectorCount: this.vectorCount,
      });
    } catch (error) {
      logger.error('Failed to save FAISS index', {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Close the service and save index
   */
  async close(): Promise<void> {
    if (this.isInitialized) {
      await this.saveIndex();
    }

    this.index = null;
    this.vectorToIdMap.clear();
    this.idToVectorMap.clear();
    this.isInitialized = false;
    this.vectorCount = 0;

    logger.info('FAISS Vector Service closed');
  }

  // Private helper methods

  private async createIndex(): Promise<void> {
    this.index = new IndexFlatIP(this.config.dimensions);
    logger.info('Created Flat FAISS index', {
      dimensions: this.config.dimensions,
    });
  }

  private async loadIndex(): Promise<boolean> {
    try {
      const indexPath = join(this.config.persistencePath, 'faiss.index');
      const mappingPath = join(this.config.persistencePath, 'mappings.json');

      // Check if files exist
      await access(indexPath);
      await access(mappingPath);

      // Load mappings
      const mappingsData = JSON.parse(await readFile(mappingPath, 'utf-8'));

      // Load FAISS index
      this.index = IndexFlatIP.read(indexPath);

      // Restore mappings
      this.vectorToIdMap = new Map(
        Object.entries(mappingsData.vectorToId).map(([k, v]) => [parseInt(k), v as string])
      );
      this.idToVectorMap = new Map(
        Object.entries(mappingsData.idToVector).map(([k, v]) => [k, v as number])
      );
      this.vectorCount = mappingsData.vectorCount || 0;

      logger.info('FAISS index loaded from disk', {
        indexPath,
        vectorCount: this.vectorCount,
        indexType: this.index.constructor.name,
      });

      return true;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        logger.debug('No existing FAISS index found, will create new');
        return false;
      }

      logger.error('Failed to load FAISS index', {
        error: error instanceof Error ? error.message : error,
      });
      return false;
    }
  }

  private estimateMemoryUsage(): number {
    if (!this.index) return 0;

    // Rough estimation: vectors + mappings + index overhead
    const vectorsMemory = this.vectorCount * this.config.dimensions * 4; // 4 bytes per float
    const mappingsMemory = (this.vectorToIdMap.size + this.idToVectorMap.size) * 100; // Rough estimate
    const indexOverhead = this.config.useIVFIndex
      ? this.config.nlist * this.config.dimensions * 4
      : 0;

    return vectorsMemory + mappingsMemory + indexOverhead;
  }

  private async ensureDirectoryExists(dir: string): Promise<void> {
    try {
      await access(dir);
    } catch {
      await mkdir(dir, { recursive: true });
    }
  }
}
