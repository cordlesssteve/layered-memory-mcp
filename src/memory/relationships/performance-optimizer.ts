/**
 * Performance optimization utilities for relationship and clustering operations
 */

import type { MemoryItem } from '../types.js';
import type { KnowledgeGraph, MemoryCluster, MemoryRelationship } from './types.js';

export interface PerformanceConfig {
  enableCaching: boolean;
  cacheMaxSize: number;
  batchSize: number;
  maxProcessingTime: number; // milliseconds
  enableParallelProcessing: boolean;
  maxConcurrentBatches: number;
  optimizationLevel: 'basic' | 'aggressive' | 'maximum';
  enableLazyLoading: boolean;
  memoryThresholdMB: number;
}

export interface ProcessingMetrics {
  totalMemories: number;
  processingTime: number;
  cacheHits: number;
  cacheMisses: number;
  batchesProcessed: number;
  parallelBatches: number;
  memoryUsageMB: number;
  optimizationLevel: string;
  averageBatchTime: number;
}

/**
 * Performance optimizer for memory relationship and clustering operations
 */
export class RelationshipPerformanceOptimizer {
  private relationshipCache = new Map<string, MemoryRelationship[]>();
  private clusterCache = new Map<string, MemoryCluster>();
  private graphCache = new Map<string, KnowledgeGraph>();
  private metrics: ProcessingMetrics = {
    totalMemories: 0,
    processingTime: 0,
    cacheHits: 0,
    cacheMisses: 0,
    batchesProcessed: 0,
    parallelBatches: 0,
    memoryUsageMB: 0,
    optimizationLevel: 'basic',
    averageBatchTime: 0,
  };

  private batchTimes: number[] = [];

  constructor(private config: PerformanceConfig) {}

  /**
   * Create optimized memory lookup structure
   */
  createMemoryLookup(memories: MemoryItem[]): Map<string, MemoryItem> {
    return new Map(memories.map(m => [m.id, m]));
  }

  /**
   * Create optimized relationship lookup by memory ID
   */
  createRelationshipLookup(relationships: Map<string, MemoryRelationship>): Map<string, MemoryRelationship[]> {
    const lookup = new Map<string, MemoryRelationship[]>();

    for (const rel of relationships.values()) {
      // Add to source memory
      if (!lookup.has(rel.sourceMemoryId)) {
        lookup.set(rel.sourceMemoryId, []);
      }
      lookup.get(rel.sourceMemoryId)!.push(rel);

      // Add to target memory
      if (!lookup.has(rel.targetMemoryId)) {
        lookup.set(rel.targetMemoryId, []);
      }
      lookup.get(rel.targetMemoryId)!.push(rel);
    }

    return lookup;
  }

  /**
   * Process memories in optimized batches with parallel processing support
   */
  async processBatches<T, R>(
    items: T[],
    processor: (batch: T[]) => Promise<R[]>,
    combiner: (results: R[][]) => R[]
  ): Promise<R[]> {
    const startTime = Date.now();
    const batchSize = this.getBatchSize(items.length);

    if (this.config.enableParallelProcessing && items.length > batchSize * 2) {
      return this.processParallelBatches(items, processor, combiner, startTime);
    } else {
      return this.processSequentialBatches(items, processor, combiner, startTime, batchSize);
    }
  }

  /**
   * Process batches in parallel for large datasets
   */
  private async processParallelBatches<T, R>(
    items: T[],
    processor: (batch: T[]) => Promise<R[]>,
    combiner: (results: R[][]) => R[],
    startTime: number
  ): Promise<R[]> {
    const batchSize = this.getBatchSize(items.length);
    const maxConcurrent = this.config.maxConcurrentBatches;
    const batches: T[][] = [];

    // Create batches
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }

    const results: R[][] = [];

    // Process batches in chunks to control concurrency
    for (let i = 0; i < batches.length; i += maxConcurrent) {
      const batchChunk = batches.slice(i, i + maxConcurrent);

      const chunkPromises = batchChunk.map(async (batch, index) => {
        const batchStartTime = Date.now();
        try {
          const result = await processor(batch);
          const batchTime = Date.now() - batchStartTime;
          this.batchTimes.push(batchTime);
          this.metrics.batchesProcessed++;
          this.metrics.parallelBatches++;
          return { index: i + index, result };
        } catch (error) {
          console.warn(`Batch processing failed for chunk ${i + index}:`, error);
          return { index: i + index, result: [] as R[] };
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      chunkResults.forEach(({ result }) => results.push(result));

      // Check if we're exceeding processing time limits
      if (Date.now() - startTime > this.config.maxProcessingTime) {
        console.warn('Processing time limit exceeded, returning partial results');
        break;
      }
    }

    this.metrics.processingTime += Date.now() - startTime;
    this.updateAverageBatchTime();
    return combiner(results);
  }

  /**
   * Process batches sequentially for smaller datasets
   */
  private async processSequentialBatches<T, R>(
    items: T[],
    processor: (batch: T[]) => Promise<R[]>,
    combiner: (results: R[][]) => R[],
    startTime: number,
    batchSize: number
  ): Promise<R[]> {
    const results: R[][] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batchStartTime = Date.now();
      const batch = items.slice(i, i + batchSize);

      try {
        const batchResults = await processor(batch);
        results.push(batchResults);

        const batchTime = Date.now() - batchStartTime;
        this.batchTimes.push(batchTime);
        this.metrics.batchesProcessed++;
      } catch (error) {
        console.warn(`Sequential batch processing failed for batch starting at ${i}:`, error);
      }

      // Check if we're exceeding processing time limits
      if (Date.now() - startTime > this.config.maxProcessingTime) {
        console.warn('Processing time limit exceeded, returning partial results');
        break;
      }
    }

    this.metrics.processingTime += Date.now() - startTime;
    this.updateAverageBatchTime();
    return combiner(results);
  }

  /**
   * Cache relationship results for faster subsequent access
   */
  cacheRelationships(key: string, relationships: MemoryRelationship[]): void {
    if (!this.config.enableCaching) return;

    if (this.relationshipCache.size >= this.config.cacheMaxSize) {
      // Remove oldest entry (simple LRU approximation)
      const firstKey = this.relationshipCache.keys().next().value;
      if (firstKey) {
        this.relationshipCache.delete(firstKey);
      }
    }

    this.relationshipCache.set(key, relationships);
  }

  /**
   * Get cached relationships
   */
  getCachedRelationships(key: string): MemoryRelationship[] | null {
    if (!this.config.enableCaching) return null;

    const cached = this.relationshipCache.get(key);
    if (cached) {
      this.metrics.cacheHits++;
      return cached;
    }

    this.metrics.cacheMisses++;
    return null;
  }

  /**
   * Cache cluster results
   */
  cacheCluster(key: string, cluster: MemoryCluster): void {
    if (!this.config.enableCaching) return;

    if (this.clusterCache.size >= this.config.cacheMaxSize) {
      const firstKey = this.clusterCache.keys().next().value;
      if (firstKey) {
        this.clusterCache.delete(firstKey);
      }
    }

    this.clusterCache.set(key, cluster);
  }

  /**
   * Get cached cluster
   */
  getCachedCluster(key: string): MemoryCluster | null {
    if (!this.config.enableCaching) return null;

    const cached = this.clusterCache.get(key);
    if (cached) {
      this.metrics.cacheHits++;
      return cached;
    }

    this.metrics.cacheMisses++;
    return null;
  }

  /**
   * Create efficient similarity matrix for clustering
   */
  createSimilarityMatrix(
    memories: MemoryItem[],
    relationships: Map<string, MemoryRelationship>
  ): Map<string, Map<string, number>> {
    const matrix = new Map<string, Map<string, number>>();

    // Initialize matrix
    memories.forEach(memory => {
      matrix.set(memory.id, new Map());
    });

    // Populate matrix with relationship weights
    for (const rel of relationships.values()) {
      const sourceRow = matrix.get(rel.sourceMemoryId);
      const targetRow = matrix.get(rel.targetMemoryId);

      if (sourceRow && targetRow) {
        sourceRow.set(rel.targetMemoryId, rel.weight);
        targetRow.set(rel.sourceMemoryId, rel.weight);
      }
    }

    return matrix;
  }

  /**
   * Optimize memory filtering for large datasets
   */
  filterMemoriesEfficiently(
    memories: MemoryItem[],
    filters: {
      minPriority?: number;
      categories?: string[];
      tags?: string[];
      dateRange?: { start: Date; end: Date };
    }
  ): MemoryItem[] {
    return memories.filter(memory => {
      // Priority filter
      if (filters.minPriority && memory.metadata.priority < filters.minPriority) {
        return false;
      }

      // Category filter
      if (filters.categories && !filters.categories.includes(memory.metadata.category)) {
        return false;
      }

      // Tags filter (at least one tag must match)
      if (filters.tags && !filters.tags.some(tag => memory.metadata.tags.includes(tag))) {
        return false;
      }

      // Date range filter
      if (filters.dateRange) {
        const memoryDate = memory.createdAt;
        if (memoryDate < filters.dateRange.start || memoryDate > filters.dateRange.end) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Get performance metrics
   */
  getMetrics(): ProcessingMetrics {
    return { ...this.metrics };
  }


  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.relationshipCache.clear();
    this.clusterCache.clear();
    this.graphCache.clear();
  }

  /**
   * Get cache efficiency ratio
   */
  getCacheEfficiency(): number {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    return total > 0 ? this.metrics.cacheHits / total : 0;
  }

  /**
   * Get optimal batch size based on dataset size and optimization level
   */
  private getBatchSize(datasetSize: number): number {
    let baseBatchSize = this.config.batchSize;

    switch (this.config.optimizationLevel) {
      case 'aggressive':
        baseBatchSize = Math.min(this.config.batchSize * 2, 200);
        break;
      case 'maximum':
        baseBatchSize = Math.min(this.config.batchSize * 3, 500);
        break;
    }

    // Adjust batch size based on dataset size
    if (datasetSize > 10000) {
      return Math.min(baseBatchSize * 2, 1000);
    } else if (datasetSize > 1000) {
      return Math.min(baseBatchSize * 1.5, 300);
    }

    return baseBatchSize;
  }

  /**
   * Update average batch processing time
   */
  private updateAverageBatchTime(): void {
    if (this.batchTimes.length > 0) {
      const total = this.batchTimes.reduce((sum, time) => sum + time, 0);
      this.metrics.averageBatchTime = total / this.batchTimes.length;

      // Keep only recent batch times to prevent memory growth
      if (this.batchTimes.length > 100) {
        this.batchTimes = this.batchTimes.slice(-50);
      }
    }
  }

  /**
   * Estimate memory usage and adjust processing if needed
   */
  private estimateMemoryUsage(): number {
    const process = globalThis.process;
    if (process && process.memoryUsage) {
      const usage = process.memoryUsage();
      const usageMB = usage.heapUsed / (1024 * 1024);
      this.metrics.memoryUsageMB = usageMB;
      return usageMB;
    }
    return 0;
  }

  /**
   * Check if memory usage is within safe limits
   */
  isMemoryUsageSafe(): boolean {
    const currentUsage = this.estimateMemoryUsage();
    return currentUsage < this.config.memoryThresholdMB;
  }

  /**
   * Adaptive filtering based on dataset size and performance constraints
   */
  filterMemoriesAdaptively(
    memories: MemoryItem[],
    filters: {
      minPriority?: number;
      categories?: string[];
      tags?: string[];
      dateRange?: { start: Date; end: Date };
      maxResults?: number;
    }
  ): MemoryItem[] {
    let filteredMemories = this.filterMemoriesEfficiently(memories, filters);

    // If dataset is still large, apply additional optimizations
    if (filteredMemories.length > 5000 && this.config.optimizationLevel === 'maximum') {
      // Sort by priority and take top results
      filteredMemories = filteredMemories
        .sort((a, b) => b.metadata.priority - a.metadata.priority)
        .slice(0, filters.maxResults || 2000);
    } else if (filteredMemories.length > 1000 && this.config.optimizationLevel === 'aggressive') {
      filteredMemories = filteredMemories
        .sort((a, b) => b.metadata.priority - a.metadata.priority)
        .slice(0, filters.maxResults || 1000);
    }

    return filteredMemories;
  }

  /**
   * Reset performance metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalMemories: 0,
      processingTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      batchesProcessed: 0,
      parallelBatches: 0,
      memoryUsageMB: 0,
      optimizationLevel: this.config.optimizationLevel,
      averageBatchTime: 0,
    };
    this.batchTimes = [];
  }

  /**
   * Get performance recommendations based on current metrics
   */
  getPerformanceRecommendations(): string[] {
    const recommendations: string[] = [];
    const efficiency = this.getCacheEfficiency();

    if (efficiency < 0.3) {
      recommendations.push('Consider increasing cache size - low cache hit ratio');
    }

    if (this.metrics.averageBatchTime > 1000) {
      recommendations.push('Consider reducing batch size - batches taking too long');
    }

    if (this.metrics.memoryUsageMB > this.config.memoryThresholdMB * 0.8) {
      recommendations.push('High memory usage - consider enabling more aggressive filtering');
    }

    if (this.metrics.parallelBatches === 0 && this.metrics.totalMemories > 1000) {
      recommendations.push('Enable parallel processing for better performance on large datasets');
    }

    return recommendations;
  }
}