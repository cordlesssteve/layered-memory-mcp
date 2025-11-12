/* global NodeJS */
/**
 * Enhanced Global Layer: BGE + FAISS powered persistent storage
 * Phase 2.1: Enhanced Single Node Architecture
 * - High-performance BGE embeddings (768d)
 * - FAISS vector similarity search
 * - Cross-project knowledge sharing
 */

import { readFile, writeFile, mkdir, access } from 'fs/promises';
import { join, dirname } from 'path';
import { BaseMemoryLayer } from '../base-layer.js';
import { BGEEmbeddingService, bgeEmbeddingService } from '../../embeddings/bge-embedding-service.js';
import { FAISSVectorService } from '../../embeddings/faiss-vector-service.js';
import type { MemoryItem, MemoryLayerConfig, MemoryQuery, MemorySearchResult } from '../types.js';

export class EnhancedGlobalLayer extends BaseMemoryLayer {
  private readonly dataDir: string;
  private persistenceInterval?: NodeJS.Timeout;
  private isDirty = false;
  private embeddingService: BGEEmbeddingService;
  private vectorService: FAISSVectorService;

  constructor(
    config: MemoryLayerConfig = { ttl: undefined },
    dataDir = './data/global-enhanced',
    customEmbeddingService?: BGEEmbeddingService
  ) {
    // Default configuration for enhanced global layer
    const defaultConfig: MemoryLayerConfig = {
      maxItems: config.maxItems ?? 50000, // Increased capacity with FAISS
      maxSizeBytes: config.maxSizeBytes ?? 500 * 1024 * 1024, // 500MB max
      compressionEnabled: config.compressionEnabled ?? true,
      indexingEnabled: config.indexingEnabled ?? true,
      ttl: config.ttl ?? 1000 * 60 * 60 * 24 * 365, // 1 year
    };

    super('global' as any, defaultConfig);

    this.dataDir = dataDir;
    this.embeddingService = customEmbeddingService || bgeEmbeddingService;

    // Initialize FAISS service with BGE Base embeddings
    this.vectorService = new FAISSVectorService(this.embeddingService, {
      dimensions: 768, // BGE-base-en-v1.5 dimensions
      persistencePath: join(dataDir, 'vectors'),
      autoOptimizeThreshold: 5000, // Optimize to IVF after 5k vectors
      nlist: 200, // More clusters for better performance
      nprobe: 20, // Search more clusters for better recall
    });

    // Auto-save every 10 minutes if dirty
    this.setupAutoPersistence();

    this.logger.info('Enhanced Global layer initialized with BGE Large + FAISS', {
      dataDir,
      config: defaultConfig,
      embeddingDimensions: 1024,
      vectorPersistence: join(dataDir, 'vectors'),
    });

    // Load existing data
    this.loadFromDisk().catch(error => {
      this.logger.error('Failed to load enhanced global data', {
        error: error instanceof Error ? error.message : error
      });
    });
  }

  override async store(item: Parameters<BaseMemoryLayer['store']>[0]): Promise<MemoryItem> {
    const result = await super.store(item);

    // Add to FAISS vector index
    await this.vectorService.addVector(result.id, result.content);

    this.markDirty();
    return result;
  }

  override async search(query: MemoryQuery): Promise<MemorySearchResult[]> {
    // Combine traditional text search with FAISS vector similarity
    const textResults = await super.search(query);

    try {
      // FAISS vector search
      const vectorResults = await this.vectorService.searchSimilar(
        query.query,
        query.limit || 10,
        0.3 // Minimum similarity threshold
      );

      // Convert FAISS results to MemorySearchResult format
      const vectorMemoryResults: MemorySearchResult[] = [];
      for (const vectorResult of vectorResults) {
        const item = this.items.get(vectorResult.id);
        if (item) {
          vectorMemoryResults.push({
            memory: item,
            score: vectorResult.score,
            source: this.layer,
            explanation: `BGE semantic similarity: ${vectorResult.score.toFixed(3)}`,
          });
        }
      }

      // Merge and deduplicate results
      const resultMap = new Map<string, MemorySearchResult>();

      // Add text search results
      for (const result of textResults) {
        resultMap.set(result.memory.id, result);
      }

      // Add vector search results, combining scores if item already exists
      for (const result of vectorMemoryResults) {
        const existing = resultMap.get(result.memory.id);
        if (existing) {
          // Combine scores with higher weight for vector similarity
          existing.score = (existing.score * 0.3) + (result.score * 0.7);
          existing.explanation += ` + ${result.explanation}`;
        } else {
          resultMap.set(result.memory.id, result);
        }
      }

      // Sort by combined score and return
      const combinedResults = Array.from(resultMap.values())
        .sort((a, b) => b.score - a.score);

      const limit = query.limit ?? 10;
      const offset = query.offset ?? 0;

      const finalResults = combinedResults.slice(offset, offset + limit);

      this.logger.debug('Enhanced global search completed', {
        queryLength: query.query.length,
        textResults: textResults.length,
        vectorResults: vectorMemoryResults.length,
        combinedResults: combinedResults.length,
        finalResults: finalResults.length,
      });

      return finalResults;
    } catch (error) {
      this.logger.warn('FAISS vector search failed, falling back to text search', {
        error: error instanceof Error ? error.message : error,
      });
      return textResults;
    }
  }

  override async update(id: string, updates: Parameters<BaseMemoryLayer['update']>[1]): Promise<MemoryItem | null> {
    const result = await super.update(id, updates);

    if (result && updates.content) {
      // Update vector in FAISS index
      try {
        await this.vectorService.addVector(id, result.content);
      } catch (error) {
        this.logger.error('Failed to update vector in FAISS index', {
          id,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    if (result) {
      this.markDirty();
    }

    return result;
  }

  override async delete(id: string): Promise<boolean> {
    const result = await super.delete(id);

    if (result) {
      // Remove from FAISS index
      try {
        await this.vectorService.removeVector(id);
      } catch (error) {
        this.logger.error('Failed to remove vector from FAISS index', {
          id,
          error: error instanceof Error ? error.message : error,
        });
      }
      this.markDirty();
    }

    return result;
  }

  override async bulkStore(
    items: Omit<MemoryItem, 'id' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt'>[]
  ): Promise<MemoryItem[]> {
    const results = await super.bulkStore(items);

    // Add to FAISS in batch for efficiency
    try {
      const vectorItems = results.map(item => ({
        id: item.id,
        text: item.content,
      }));

      await this.vectorService.addVectorsBatch(vectorItems);

      this.logger.info('Bulk stored items with FAISS vectors', {
        itemCount: results.length,
      });
    } catch (error) {
      this.logger.error('Failed to bulk add vectors to FAISS index', {
        itemCount: results.length,
        error: error instanceof Error ? error.message : error,
      });
    }

    this.markDirty();
    return results;
  }

  override async optimize(): Promise<void> {
    // Clean up first
    await this.cleanup();

    // Rebuild text index
    this.index.clear();
    for (const [id, item] of this.items) {
      this.updateIndex(id, item);
    }

    // Optimize FAISS index
    try {
      await this.vectorService.optimize();
    } catch (error) {
      this.logger.error('Failed to optimize FAISS index', {
        error: error instanceof Error ? error.message : error,
      });
    }

    // Archive old items if enabled
    if (this.config.compressionEnabled) {
      await this.archiveOldItems();
    }

    // Persist optimized data
    await this.saveToDisk();

    this.logger.info('Enhanced global layer optimized', {
      itemCount: this.items.size,
      indexSize: this.index.size,
      vectorStats: this.vectorService.getStats(),
    });
  }

  override async backup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `enhanced-global-${timestamp}`;
    const backupPath = join(this.dataDir, 'backups', `${backupId}.json`);

    await this.ensureDirectoryExists(dirname(backupPath));

    const backupData = {
      timestamp: new Date().toISOString(),
      items: await this.export(),
      vectorStats: this.vectorService.getStats(),
      metadata: {
        version: '2.0',
        layerType: 'enhanced-global',
        totalItems: this.items.size,
        embeddingModel: 'BGE-base-en-v1.5',
        vectorDimensions: 768,
      },
    };

    await writeFile(backupPath, JSON.stringify(backupData, null, 2));

    // Also backup FAISS index
    await this.vectorService.saveIndex();

    this.logger.info('Enhanced global layer backup created', {
      backupId,
      backupPath,
      itemCount: backupData.items.length,
      vectorStats: backupData.vectorStats,
    });

    return backupId;
  }

  override async restore(backupId: string): Promise<boolean> {
    try {
      const backupPath = join(this.dataDir, 'backups', `${backupId}.json`);
      const backupData = JSON.parse(await readFile(backupPath, 'utf-8'));

      // Clear current data
      this.items.clear();
      this.index.clear();

      // Import backup data
      const importedCount = await this.import(backupData.items);

      // Rebuild FAISS index from restored items
      try {
        const vectorItems = Array.from(this.items.values()).map(item => ({
          id: item.id,
          text: item.content,
        }));

        if (vectorItems.length > 0) {
          await this.vectorService.addVectorsBatch(vectorItems);
        }
      } catch (error) {
        this.logger.error('Failed to rebuild FAISS index during restore', {
          error: error instanceof Error ? error.message : error,
        });
      }

      // Save restored data
      await this.saveToDisk();

      this.logger.info('Enhanced global layer restored from backup', {
        backupId,
        importedCount,
        vectorStats: this.vectorService.getStats(),
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to restore from backup', {
        backupId,
        error: error instanceof Error ? error.message : error,
      });
      return false;
    }
  }

  /**
   * Get enhanced global layer statistics with vector insights
   */
  async getEnhancedStats(): Promise<{
    projectDistribution: Record<string, number>;
    topCategories: Array<{ category: string; count: number }>;
    topTags: Array<{ tag: string; count: number }>;
    vectorStats: ReturnType<FAISSVectorService['getStats']>;
    embeddingStats: ReturnType<BGEEmbeddingService['getStats']>;
    growthRate: { daily: number; weekly: number; monthly: number };
  }> {
    const baseStats = await this.getStats();
    const items = Array.from(this.items.values());

    // Project distribution
    const projectDistribution: Record<string, number> = {};
    for (const item of items) {
      const projectId = item.metadata.projectId || 'unknown';
      projectDistribution[projectId] = (projectDistribution[projectId] || 0) + 1;
    }

    // Top categories
    const topCategories = Object.entries(baseStats.categoryCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Top tags
    const topTags = Object.entries(baseStats.tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // Growth rate analysis
    const growthRate = this.calculateGrowthRate(items);

    return {
      projectDistribution,
      topCategories,
      topTags,
      vectorStats: this.vectorService.getStats(),
      embeddingStats: this.embeddingService.getStats(),
      growthRate,
    };
  }

  /**
   * Find semantically similar memories using BGE + FAISS
   */
  async findSemanticallySimilar(content: string, limit = 5, threshold = 0.5): Promise<MemorySearchResult[]> {
    try {
      const vectorResults = await this.vectorService.searchSimilar(content, limit, threshold);

      const results: MemorySearchResult[] = [];
      for (const vectorResult of vectorResults) {
        const item = this.items.get(vectorResult.id);
        if (item) {
          results.push({
            memory: item,
            score: vectorResult.score,
            source: this.layer,
            explanation: `BGE semantic similarity: ${vectorResult.score.toFixed(3)}`,
          });
        }
      }

      return results;
    } catch (error) {
      this.logger.error('Semantic similarity search failed', {
        contentLength: content.length,
        error: error instanceof Error ? error.message : error,
      });
      return [];
    }
  }

  /**
   * Close the enhanced global layer
   */
  async close(): Promise<void> {
    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
    }

    if (this.isDirty) {
      await this.saveToDisk();
    }

    // Close vector service
    await this.vectorService.close();

    this.logger.info('Enhanced global layer closed');
  }

  // Private helper methods

  private calculateGrowthRate(items: MemoryItem[]): { daily: number; weekly: number; monthly: number } {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    const oneMonth = 30 * oneDay;

    const dailyItems = items.filter(item => (now - item.createdAt.getTime()) < oneDay).length;
    const weeklyItems = items.filter(item => (now - item.createdAt.getTime()) < oneWeek).length;
    const monthlyItems = items.filter(item => (now - item.createdAt.getTime()) < oneMonth).length;

    return {
      daily: dailyItems,
      weekly: weeklyItems / 7,
      monthly: monthlyItems / 30,
    };
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const itemsPath = join(this.dataDir, 'items.json');

      // Load items
      try {
        await access(itemsPath);
        const itemsData = JSON.parse(await readFile(itemsPath, 'utf-8'));
        await this.import(itemsData.items || []);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      // FAISS index will be loaded automatically by the vector service
      this.isDirty = false;

      this.logger.info('Enhanced global data loaded from disk', {
        itemCount: this.items.size,
        vectorStats: this.vectorService.getStats(),
      });
    } catch (error) {
      this.logger.error('Failed to load enhanced global data', {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  private async saveToDisk(): Promise<void> {
    try {
      await this.ensureDirectoryExists(this.dataDir);

      const itemsPath = join(this.dataDir, 'items.json');

      // Save items
      const itemsData = {
        version: '2.0',
        savedAt: new Date().toISOString(),
        items: await this.export(),
        embeddingModel: 'BGE-base-en-v1.5',
        vectorDimensions: 768,
      };
      await writeFile(itemsPath, JSON.stringify(itemsData, null, 2));

      // Save FAISS index
      await this.vectorService.saveIndex();

      this.isDirty = false;

      this.logger.debug('Enhanced global data saved to disk', {
        itemCount: itemsData.items.length,
        vectorStats: this.vectorService.getStats(),
      });
    } catch (error) {
      this.logger.error('Failed to save enhanced global data', {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  private async ensureDirectoryExists(dir: string): Promise<void> {
    try {
      await access(dir);
    } catch {
      await mkdir(dir, { recursive: true });
    }
  }

  private markDirty(): void {
    this.isDirty = true;
  }

  private setupAutoPersistence(): void {
    this.persistenceInterval = setInterval(async () => {
      if (this.isDirty) {
        try {
          await this.saveToDisk();
        } catch (error) {
          this.logger.error('Auto-persistence failed', {
            error: error instanceof Error ? error.message : error,
          });
        }
      }
    }, 10 * 60 * 1000); // 10 minutes
  }

  private async archiveOldItems(): Promise<void> {
    // Archive items older than 6 months with low access
    const sixMonthsAgo = Date.now() - (6 * 30 * 24 * 60 * 60 * 1000);
    const archiveCandidates: MemoryItem[] = [];

    for (const item of this.items.values()) {
      if (
        item.createdAt.getTime() < sixMonthsAgo &&
        item.accessCount < 2 &&
        item.lastAccessedAt.getTime() < sixMonthsAgo
      ) {
        archiveCandidates.push(item);
      }
    }

    if (archiveCandidates.length > 0) {
      // Save to archive
      const archivePath = join(this.dataDir, 'archive', `archive-${Date.now()}.json`);
      await this.ensureDirectoryExists(dirname(archivePath));

      await writeFile(archivePath, JSON.stringify({
        archivedAt: new Date().toISOString(),
        items: archiveCandidates,
      }, null, 2));

      // Remove from active storage
      for (const item of archiveCandidates) {
        await this.delete(item.id);
      }

      this.logger.info('Archived old items', {
        archivedCount: archiveCandidates.length,
        archivePath,
      });
    }
  }
}