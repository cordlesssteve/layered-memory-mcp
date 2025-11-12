/**
 * Refactored Memory Relationship Engine - Main orchestrator
 *
 * This is the simplified main engine that coordinates all relationship subsystems.
 * The original 852-line file has been split into focused modules.
 */

import { createLogger } from '../../utils/logger.js';
import type { MemoryItem } from '../types.js';
import type {
  MemoryRelationship,
  KnowledgeGraph,
  MemoryCluster,
  ConflictResolution,
  MemoryVersion
} from './types.js';
import { RelationshipDetectors } from './detectors.js';
import { KnowledgeGraphEngine } from './knowledge-graph.js';
import { ConflictDetector } from './conflict-detector.js';
import { ClusterAnalyzer } from './cluster-analyzer.js';
import { VersionTracker } from './version-tracker.js';
import { MemoryDecayModeler, type DecayPrediction } from './decay-modeler.js';
import { RelationshipPerformanceOptimizer, type ProcessingMetrics } from './performance-optimizer.js';
import { RelationshipValidationInterface, type RelationshipSuggestion } from './validation-interface.js';
import { EnhancedValidationInterface, type UserPreferences, type LearningInsights, type SuggestionPriority } from './enhanced-validation.js';
import {
  relationshipErrorHandler,
  RelationshipValidator
} from './error-handling.js';

const logger = createLogger('memory-relationships');

export class MemoryRelationshipEngine {
  private relationships = new Map<string, MemoryRelationship>();
  private detectors = new RelationshipDetectors();
  private graphEngine = new KnowledgeGraphEngine();
  private conflictDetector = new ConflictDetector();
  private clusterAnalyzer = new ClusterAnalyzer();
  private versionTracker = new VersionTracker();
  private decayModeler = new MemoryDecayModeler();

  // Validation interfaces
  private validationInterface = new RelationshipValidationInterface();
  private enhancedValidation = new EnhancedValidationInterface();

  // Performance optimization
  private performanceOptimizer = new RelationshipPerformanceOptimizer({
    enableCaching: true,
    cacheMaxSize: 2000,
    batchSize: 100,
    maxProcessingTime: 10000, // 10 seconds max
    enableParallelProcessing: true,
    maxConcurrentBatches: 4,
    optimizationLevel: 'aggressive',
    enableLazyLoading: true,
    memoryThresholdMB: 512,
  });

  /**
   * Detect relationships between a new memory and existing memories
   */
  async detectRelationships(
    newMemory: MemoryItem,
    existingMemories: MemoryItem[]
  ): Promise<MemoryRelationship[]> {
    return await relationshipErrorHandler.withErrorHandling(
      async () => {
        // Input validation
        RelationshipValidator.validateMemoryItem(newMemory, 'in detectRelationships (newMemory)');
        RelationshipValidator.validateMemoryArray(existingMemories, 'in detectRelationships (existingMemories)');

        const minConfidenceThreshold = 0.6; // Only keep high-confidence relationships
        const maxRelationshipsPerMemory = 10; // Limit to prevent explosion

        // Use performance optimizer for efficient filtering and processing
        const filteredMemories = this.performanceOptimizer.filterMemoriesAdaptively(
          existingMemories.filter(m => m.id !== newMemory.id),
          {
            minPriority: 3, // Only consider memories with priority 3+
            maxResults: 100, // Limit candidates for performance
          }
        );

        logger.debug(`Filtered ${existingMemories.length} memories to ${filteredMemories.length} candidates`);

        // Check cache first
        const cacheKey = `relationships:${newMemory.id}:${filteredMemories.map(m => m.id).sort().join(',')}`;
        const cachedRelationships = this.performanceOptimizer.getCachedRelationships(cacheKey);
        if (cachedRelationships) {
          logger.debug(`Cache hit for relationships for memory ${newMemory.id}`);
          return cachedRelationships.filter(rel => rel.confidence >= minConfidenceThreshold);
        }

        // Process memories in optimized batches
        const relationshipBatches = await this.performanceOptimizer.processBatches(
          filteredMemories,
          async (memoryBatch: MemoryItem[]) => {
            const batchRelationships: MemoryRelationship[] = [];

            for (const existing of memoryBatch) {
              try {
                // Detect various relationship types using the detectors module
                const detectedRelationships = await Promise.all([
                  this.detectors.detectReferenceRelationship(newMemory, existing),
                  this.detectors.detectContextualRelationship(newMemory, existing),
                  this.detectors.detectCausalRelationship(newMemory, existing),
                  this.detectors.detectTemporalRelationship(newMemory, existing),
                  this.detectors.detectHierarchicalRelationship(newMemory, existing),
                  this.detectors.detectContradictionRelationship(newMemory, existing),
                  this.detectors.detectConfirmationRelationship(newMemory, existing),
                  this.detectors.detectEvolutionRelationship(newMemory, existing),
                ]);

                // Filter out null relationships and low-confidence ones
                const validRelationships = detectedRelationships
                  .filter((rel): rel is MemoryRelationship =>
                    rel !== null && rel.confidence >= minConfidenceThreshold
                  );

                // Validate detected relationships
                for (const rel of validRelationships) {
                  RelationshipValidator.validateRelationshipData(rel, `detected between ${newMemory.id} and ${existing.id}`);
                }

                batchRelationships.push(...validRelationships);

                // Stop batch processing if we've reached max relationships for this memory
                if (batchRelationships.length >= maxRelationshipsPerMemory) {
                  break;
                }
              } catch (error) {
                logger.warn('Failed to detect relationships for memory pair', {
                  newMemoryId: newMemory.id,
                  existingMemoryId: existing.id,
                  error: error instanceof Error ? error.message : String(error)
                });
                // Continue processing other memories in batch
                continue;
              }
            }

            return batchRelationships;
          },
          (results: MemoryRelationship[][]) => results.flat()
        );

        // Sort by confidence and keep only the best relationships
        const bestRelationships = relationshipBatches
          .sort((a, b) => b.confidence - a.confidence)
          .slice(0, maxRelationshipsPerMemory);

        // Cache the results for future use
        this.performanceOptimizer.cacheRelationships(cacheKey, bestRelationships);

        // Store detected relationships
        for (const relationship of bestRelationships) {
          try {
            this.relationships.set(relationship.id, relationship);
          } catch (error) {
            logger.error('Failed to store relationship', {
              relationshipId: relationship.id,
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }

        logger.info(`Detected ${bestRelationships.length} high-quality relationships for memory ${newMemory.id}`);
        return bestRelationships;
      },
      {
        operation: 'detectRelationships',
        memoryId: newMemory.id,
        existingMemoryCount: existingMemories.length
      },
      [] // Return empty array as fallback
    ) || [];
  }

  /**
   * Build knowledge graph from current memories and relationships
   */
  async buildKnowledgeGraph(memories: MemoryItem[]): Promise<KnowledgeGraph> {
    return await relationshipErrorHandler.withErrorHandling(
      async () => {
        // Input validation
        RelationshipValidator.validateMemoryArray(memories, 'in buildKnowledgeGraph');

        logger.info('Building knowledge graph', { memoryCount: memories.length });

        // Detect relationships between all memories if not already done
        for (const memory of memories) {
          try {
            const otherMemories = memories.filter(m => m.id !== memory.id);
            await this.detectRelationships(memory, otherMemories);
          } catch (error) {
            logger.warn('Failed to detect relationships for memory in graph building', {
              memoryId: memory.id,
              error: error instanceof Error ? error.message : String(error)
            });
            // Continue with other memories
          }
        }

        // Build and return the knowledge graph using the graph engine
        const graph = await this.graphEngine.buildKnowledgeGraph(memories, this.relationships);

        logger.info('Knowledge graph built successfully', {
          nodeCount: graph.nodes.size,
          edgeCount: graph.edges.size
        });

        return graph;
      },
      {
        operation: 'buildKnowledgeGraph',
        memoryCount: memories.length
      },
      {
        nodes: new Map(),
        edges: new Map(),
        stats: {
          totalNodes: 0,
          totalEdges: 0,
          averageConnections: 0,
          topCentralNodes: []
        }
      } // Fallback empty graph
    ) || {
      nodes: new Map(),
      edges: new Map(),
      stats: {
        totalNodes: 0,
        totalEdges: 0,
        averageConnections: 0,
        topCentralNodes: []
      }
    };
  }

  /**
   * Get all relationships for a specific memory
   */
  getMemoryRelationships(memoryId: string): MemoryRelationship[] {
    return Array.from(this.relationships.values()).filter(
      rel => rel.sourceMemoryId === memoryId || rel.targetMemoryId === memoryId
    );
  }

  /**
   * Detect potential conflicts between memories
   */
  async detectConflicts(memories: MemoryItem[]): Promise<ConflictResolution[]> {
    return await relationshipErrorHandler.withErrorHandling(
      async () => {
        RelationshipValidator.validateMemoryArray(memories, 'in detectConflicts');
        return await this.conflictDetector.detectConflicts(memories);
      },
      {
        operation: 'detectConflicts',
        memoryCount: memories.length
      },
      [] // Return empty array as fallback
    ) || [];
  }

  /**
   * Create memory clusters based on relationships
   */
  async createClusters(memories: MemoryItem[]): Promise<MemoryCluster[]> {
    return await relationshipErrorHandler.withErrorHandling(
      async () => {
        RelationshipValidator.validateMemoryArray(memories, 'in createClusters');
        return await this.clusterAnalyzer.createClusters(memories, this.relationships);
      },
      {
        operation: 'createClusters',
        memoryCount: memories.length,
        relationshipCount: this.relationships.size
      },
      [] // Return empty array as fallback
    ) || [];
  }

  /**
   * Generate summary for a cluster of memories
   */
  async summarizeCluster(memoryIds: string[]): Promise<string> {
    return await this.clusterAnalyzer.summarizeCluster(memoryIds);
  }

  /**
   * Predict memory decay for intelligent archival and promotion
   */
  async predictMemoryDecay(memories: MemoryItem[]): Promise<DecayPrediction[]> {
    // Calculate relationship counts for each memory
    const relationshipCounts = new Map<string, number>();
    for (const relationship of this.relationships.values()) {
      const sourceCount = relationshipCounts.get(relationship.sourceMemoryId) || 0;
      const targetCount = relationshipCounts.get(relationship.targetMemoryId) || 0;

      relationshipCounts.set(relationship.sourceMemoryId, sourceCount + 1);
      relationshipCounts.set(relationship.targetMemoryId, targetCount + 1);
    }

    // TODO: In future, integrate with validation interface for validation scores
    // For now, use default scores
    const validationScores = new Map<string, number>();
    const relevanceScores = new Map<string, number>();

    return this.decayModeler.predictBatchDecay(
      memories,
      relationshipCounts,
      validationScores,
      relevanceScores
    );
  }

  /**
   * Get urgent memories that need immediate attention
   */
  async getUrgentMemories(memories: MemoryItem[]): Promise<DecayPrediction[]> {
    const predictions = await this.predictMemoryDecay(memories);
    return this.decayModeler.getUrgentMemories(predictions);
  }

  /**
   * Get promotion candidates (memories becoming more important)
   */
  async getPromotionCandidates(memories: MemoryItem[]): Promise<DecayPrediction[]> {
    const predictions = await this.predictMemoryDecay(memories);
    return this.decayModeler.getPromotionCandidates(predictions);
  }

  /**
   * Get archival candidates (memories becoming less important)
   */
  async getArchivalCandidates(memories: MemoryItem[]): Promise<DecayPrediction[]> {
    const predictions = await this.predictMemoryDecay(memories);
    return this.decayModeler.getArchivalCandidates(predictions);
  }

  /**
   * Get model insights and performance metrics
   */
  async getDecayModelInsights(memories: MemoryItem[]) {
    const predictions = await this.predictMemoryDecay(memories);
    return this.decayModeler.getModelInsights(predictions);
  }

  /**
   * Track memory version evolution
   */
  trackMemoryVersion(
    memoryId: string,
    changeType: MemoryVersion['changeType'],
    changes: MemoryVersion['changes'],
    createdBy: string,
    parentVersionId?: string
  ): MemoryVersion {
    return this.versionTracker.trackVersion(memoryId, changeType, changes, createdBy, parentVersionId);
  }

  /**
   * Get version history for a memory
   */
  getMemoryVersions(memoryId: string): MemoryVersion[] {
    return this.versionTracker.getVersions(memoryId);
  }

  // Public getters for accessing internal state
  get allRelationships(): Map<string, MemoryRelationship> {
    return new Map(this.relationships);
  }

  get detectorEngine(): RelationshipDetectors {
    return this.detectors;
  }

  get knowledgeGraphEngine(): KnowledgeGraphEngine {
    return this.graphEngine;
  }

  get conflictDetectionEngine(): ConflictDetector {
    return this.conflictDetector;
  }

  /**
   * Get performance metrics for monitoring and optimization
   */
  getPerformanceMetrics(): ProcessingMetrics {
    return this.performanceOptimizer.getMetrics();
  }

  /**
   * Clear performance caches to free memory
   */
  clearPerformanceCache(): void {
    this.performanceOptimizer.clearCaches();
  }

  /**
   * Get cache efficiency ratio
   */
  getCacheEfficiency(): number {
    return this.performanceOptimizer.getCacheEfficiency();
  }

  get clusterAnalysisEngine(): ClusterAnalyzer {
    return this.clusterAnalyzer;
  }

  get versionTrackingEngine(): VersionTracker {
    return this.versionTracker;
  }

  // Enhanced Validation Interface Methods

  /**
   * Get smart relationship suggestions prioritized for the user
   */
  getSmartSuggestions(
    userId?: string,
    maxSuggestions: number = 10
  ): { suggestions: RelationshipSuggestion[]; priorities: SuggestionPriority[] } {
    const allSuggestions = this.validationInterface.getAllPendingSuggestions();
    return this.enhancedValidation.getSmartSuggestions(allSuggestions, userId, maxSuggestions);
  }

  /**
   * Update user preferences based on validation history
   */
  updateUserPreferences(userId: string): UserPreferences {
    const validationHistory = this.validationInterface.getValidationHistory();
    return this.enhancedValidation.updateUserPreferences(userId, validationHistory);
  }

  /**
   * Generate learning insights for algorithm improvement
   */
  generateLearningInsights(userId: string): LearningInsights {
    const validationHistory = this.validationInterface.getValidationHistory();
    return this.enhancedValidation.generateLearningInsights(userId, validationHistory);
  }

  /**
   * Get user preferences
   */
  getUserPreferences(userId: string): UserPreferences | null {
    return this.enhancedValidation.getUserPreferences(userId);
  }

  /**
   * Get learning insights
   */
  getUserLearningInsights(userId: string): LearningInsights | null {
    return this.enhancedValidation.getLearningInsights(userId);
  }

  /**
   * Export user model for backup or transfer
   */
  exportUserModel(userId: string): {
    preferences: UserPreferences | null;
    insights: LearningInsights | null;
  } {
    return this.enhancedValidation.exportUserModel(userId);
  }

  /**
   * Import user model from backup or transfer
   */
  importUserModel(
    userId: string,
    preferences: UserPreferences,
    insights: LearningInsights
  ): void {
    this.enhancedValidation.importUserModel(userId, preferences, insights);
  }

  /**
   * Access to the validation interface for direct operations
   */
  get validationEngine(): RelationshipValidationInterface {
    return this.validationInterface;
  }

  /**
   * Access to enhanced validation interface
   */
  get enhancedValidationEngine(): EnhancedValidationInterface {
    return this.enhancedValidation;
  }
}