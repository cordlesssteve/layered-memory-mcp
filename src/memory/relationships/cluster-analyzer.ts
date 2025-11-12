/**
 * Memory clustering and analysis system
 */

import { createLogger } from '../../utils/logger.js';
import type { MemoryItem } from '../types.js';
import type { MemoryRelationship, MemoryCluster } from './types.js';
import { TextAnalyzer } from './text-analyzer.js';
import { RelationshipPerformanceOptimizer } from './performance-optimizer.js';
import {
  relationshipErrorHandler,
  RelationshipValidator,
  RelationshipError,
  RelationshipErrorType
} from './error-handling.js';

const logger = createLogger('cluster-analyzer');

export class ClusterAnalyzer {
  private clusters = new Map<string, MemoryCluster>();
  private textAnalyzer = new TextAnalyzer();
  private performanceOptimizer = new RelationshipPerformanceOptimizer({
    enableCaching: true,
    cacheMaxSize: 500,
    batchSize: 100,
    maxProcessingTime: 15000, // 15 seconds max for clustering
    enableParallelProcessing: true,
    maxConcurrentBatches: 3,
    optimizationLevel: 'aggressive',
    enableLazyLoading: true,
    memoryThresholdMB: 256,
  });

  async createClusters(
    memories: MemoryItem[],
    relationships: Map<string, MemoryRelationship>
  ): Promise<MemoryCluster[]> {
    return await relationshipErrorHandler.withErrorHandling(
      async () => {
        // Input validation
        RelationshipValidator.validateMemoryArray(memories, 'in createClusters');

        if (!relationships || typeof relationships.set !== 'function') {
          throw new RelationshipError(
            RelationshipErrorType.VALIDATION_ERROR,
            'Relationships parameter must be a valid Map',
            { relationshipsType: typeof relationships }
          );
        }

        logger.info('Creating memory clusters based on relationships', {
          memoryCount: memories.length,
          relationshipCount: relationships.size
        });

        // Check cache first
        const cacheKey = `clusters:${memories.map(m => m.id).sort().join(',')}:${Array.from(relationships.keys()).sort().join(',')}`;
        const cachedClusters = this.performanceOptimizer.getCachedCluster(cacheKey);
        if (cachedClusters) {
          logger.debug('Cache hit for clusters');
          return [cachedClusters]; // Return as array since we cached a single cluster object
        }

        // Use adaptive filtering for large datasets
        const filteredMemories = this.performanceOptimizer.filterMemoriesAdaptively(
          memories,
          {
            minPriority: 2, // Only cluster memories with priority 2+
            maxResults: 2000, // Limit for clustering performance
          }
        );

        logger.debug(`Filtered ${memories.length} memories to ${filteredMemories.length} for clustering`);

        const processed = new Set<string>();

        // Process memories in batches for large datasets
        const clusterBatches = await this.performanceOptimizer.processBatches(
          filteredMemories,
          async (memoryBatch: MemoryItem[]) => {
            const batchClusters: MemoryCluster[] = [];

            for (const memory of memoryBatch) {
              if (processed.has(memory.id)) continue;

              try {
                const cluster = await this.buildClusterFromSeed(memory, filteredMemories, relationships);
                if (cluster.memoryIds.length > 1) {
                  batchClusters.push(cluster);
                  cluster.memoryIds.forEach(id => processed.add(id));
                  this.clusters.set(cluster.id, cluster);
                } else {
                  processed.add(memory.id);
                }
              } catch (error) {
                logger.warn('Failed to build cluster from seed memory', {
                  memoryId: memory.id,
                  error: error instanceof Error ? error.message : String(error)
                });
                processed.add(memory.id);
                // Continue with next memory
              }
            }

            return batchClusters;
          },
          (results: MemoryCluster[][]) => results.flat()
        );

        // Cache the results if they're significant
        if (clusterBatches.length > 0) {
          // For simplicity, cache the first cluster (in a real implementation, you'd cache all clusters differently)
          const firstCluster = clusterBatches[0];
          if (firstCluster) {
            this.performanceOptimizer.cacheCluster(cacheKey, firstCluster);
          }
        }

        logger.info(`Created ${clusterBatches.length} memory clusters`);
        return clusterBatches;
      },
      {
        operation: 'createClusters',
        memoryCount: memories.length,
        relationshipCount: relationships.size
      },
      [] // Return empty array as fallback
    ) || [];
  }

  async summarizeCluster(memoryIds: string[]): Promise<string> {
    if (memoryIds.length === 0) {
      return 'No memories found for summarization.';
    }

    // For now, return a simple summary
    // In a real implementation, this would fetch the actual memories
    return `Cluster of ${memoryIds.length} related memories. ` +
           `Memory IDs: ${memoryIds.slice(0, 5).join(', ')}${memoryIds.length > 5 ? '...' : ''}`;
  }

  private async buildClusterFromSeed(
    seedMemory: MemoryItem,
    allMemories: MemoryItem[],
    relationships: Map<string, MemoryRelationship>
  ): Promise<MemoryCluster> {
    const clusterMemories = [seedMemory];
    const clusterMemoryIds = new Set([seedMemory.id]); // Performance: Use Set for O(1) lookups
    const seedRelationships = this.getMemoryRelationships(seedMemory.id, relationships);

    // Performance: Create memory lookup map for O(1) access
    const memoryMap = new Map(allMemories.map(m => [m.id, m]));

    // Add related memories to cluster
    for (const rel of seedRelationships) {
      const relatedId =
        rel.sourceMemoryId === seedMemory.id ? rel.targetMemoryId : rel.sourceMemoryId;
      const relatedMemory = memoryMap.get(relatedId); // O(1) lookup instead of O(n) find

      if (relatedMemory && !clusterMemoryIds.has(relatedId) && rel.confidence > 0.6) {
        clusterMemories.push(relatedMemory);
        clusterMemoryIds.add(relatedId);
      }
    }

    // Calculate cluster metrics
    const keywords = this.textAnalyzer.extractKeywords(
      clusterMemories.map(m => m.content).join(' ')
    );
    const commonTags = this.textAnalyzer.findCommonTags(clusterMemories);
    const cohesion = this.textAnalyzer.calculateClusterCohesion(clusterMemories);

    return {
      id: `cluster-${seedMemory.id}`,
      memoryIds: clusterMemories.map(m => m.id),
      centroid: seedMemory.id,
      cohesion,
      keywords: keywords.slice(0, 10),
      commonTags: commonTags.slice(0, 5),
      summary: `Cluster of ${clusterMemories.length} memories focusing on: ${keywords.slice(0, 3).join(', ')}`,
      createdAt: new Date(),
    };
  }

  private getMemoryRelationships(
    memoryId: string,
    relationships: Map<string, MemoryRelationship>
  ): MemoryRelationship[] {
    return Array.from(relationships.values()).filter(
      rel => rel.sourceMemoryId === memoryId || rel.targetMemoryId === memoryId
    );
  }

  get allClusters(): Map<string, MemoryCluster> {
    return new Map(this.clusters);
  }
}