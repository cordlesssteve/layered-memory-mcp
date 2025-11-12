/**
 * Memory Decay Modeling for Predictive Insights
 * Predicts which memories become important or obsolete over time
 */

import { createLogger } from '../../utils/logger.js';
import type { MemoryItem } from '../types.js';

const logger = createLogger('memory-decay');

export interface DecayPrediction {
  memoryId: string;
  currentImportance: number;
  predictedImportance: number;
  decayRate: number;
  timeToObsolescence: number; // days until predicted obsolescence
  confidenceScore: number;
  factors: {
    accessFrequency: number;
    recency: number;
    relationshipStrength: number;
    contentRelevance: number;
    userValidation: number;
  };
  recommendation: 'promote' | 'maintain' | 'archive' | 'delete';
}

export interface DecayModelConfig {
  decayHalfLife: number; // days for importance to decay by half
  accessWeight: number;
  recencyWeight: number;
  relationshipWeight: number;
  relevanceWeight: number;
  validationWeight: number;
  obsolescenceThreshold: number; // below this threshold, memory is considered obsolete
}

export class MemoryDecayModeler {
  private readonly config: DecayModelConfig;

  constructor(config: Partial<DecayModelConfig> = {}) {
    this.config = {
      decayHalfLife: 30, // 30 days default
      accessWeight: 0.3,
      recencyWeight: 0.2,
      relationshipWeight: 0.2,
      relevanceWeight: 0.15,
      validationWeight: 0.15,
      obsolescenceThreshold: 0.1,
      ...config
    };

    logger.info('Memory decay modeler initialized', { config: this.config });
  }

  /**
   * Predict decay for a single memory
   */
  predictDecay(
    memory: MemoryItem,
    relationshipCount: number = 0,
    validationScore: number = 0.5,
    averageRelevance: number = 0.5
  ): DecayPrediction {
    const now = new Date();
    const createdAt = new Date(memory.createdAt);
    const lastAccessedAt = new Date(memory.lastAccessedAt);

    // Calculate decay factors
    const factors = this.calculateDecayFactors(
      memory,
      now,
      createdAt,
      lastAccessedAt,
      relationshipCount,
      validationScore,
      averageRelevance
    );

    // Calculate current importance
    const currentImportance = this.calculateCurrentImportance(factors);

    // Calculate decay rate (how fast importance decreases)
    const decayRate = this.calculateDecayRate(factors);

    // Predict future importance using exponential decay
    const predictedImportance = this.calculatePredictedImportance(
      currentImportance,
      decayRate,
      30 // predict 30 days into the future
    );

    // Calculate time to obsolescence
    const timeToObsolescence = this.calculateTimeToObsolescence(
      currentImportance,
      decayRate
    );

    // Calculate confidence in prediction
    const confidenceScore = this.calculateConfidence(factors, memory);

    // Generate recommendation
    const recommendation = this.generateRecommendation(
      currentImportance,
      predictedImportance,
      timeToObsolescence
    );

    return {
      memoryId: memory.id,
      currentImportance,
      predictedImportance,
      decayRate,
      timeToObsolescence,
      confidenceScore,
      factors,
      recommendation
    };
  }

  /**
   * Predict decay for multiple memories
   */
  predictBatchDecay(
    memories: MemoryItem[],
    relationshipCounts: Map<string, number> = new Map(),
    validationScores: Map<string, number> = new Map(),
    averageRelevanceScores: Map<string, number> = new Map()
  ): DecayPrediction[] {
    const predictions = memories.map(memory => {
      const relationshipCount = relationshipCounts.get(memory.id) || 0;
      const validationScore = validationScores.get(memory.id) || 0.5;
      const averageRelevance = averageRelevanceScores.get(memory.id) || 0.5;

      return this.predictDecay(memory, relationshipCount, validationScore, averageRelevance);
    });

    // Sort by urgency (shortest time to obsolescence first)
    return predictions.sort((a, b) => a.timeToObsolescence - b.timeToObsolescence);
  }

  /**
   * Get memories that need immediate attention
   */
  getUrgentMemories(
    predictions: DecayPrediction[],
    urgencyThreshold: number = 7 // days
  ): DecayPrediction[] {
    return predictions.filter(prediction =>
      prediction.timeToObsolescence <= urgencyThreshold &&
      prediction.confidenceScore >= 0.7
    );
  }

  /**
   * Get promotion candidates (memories becoming more important)
   */
  getPromotionCandidates(predictions: DecayPrediction[]): DecayPrediction[] {
    return predictions.filter(prediction =>
      prediction.predictedImportance > prediction.currentImportance * 1.1 && // 10% increase
      prediction.recommendation === 'promote'
    );
  }

  /**
   * Get archival candidates (memories becoming less important)
   */
  getArchivalCandidates(predictions: DecayPrediction[]): DecayPrediction[] {
    return predictions.filter(prediction =>
      prediction.recommendation === 'archive' ||
      prediction.recommendation === 'delete'
    );
  }

  /**
   * Calculate decay factors for a memory
   */
  private calculateDecayFactors(
    memory: MemoryItem,
    now: Date,
    createdAt: Date,
    lastAccessedAt: Date,
    relationshipCount: number,
    validationScore: number,
    averageRelevance: number
  ) {
    const daysSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const daysSinceAccess = (now.getTime() - lastAccessedAt.getTime()) / (1000 * 60 * 60 * 24);

    // Access frequency factor (higher is better)
    const accessFrequency = Math.min(1, memory.accessCount / (daysSinceCreation + 1));

    // Recency factor (more recent is better)
    const recency = Math.exp(-daysSinceAccess / 30); // exponential decay over 30 days

    // Relationship strength factor (more connections = more important)
    const relationshipStrength = Math.min(1, relationshipCount / 10); // normalize to 0-1

    // Content relevance factor (external input)
    const contentRelevance = averageRelevance;

    // User validation factor (confirmed relationships boost importance)
    const userValidation = validationScore;

    return {
      accessFrequency,
      recency,
      relationshipStrength,
      contentRelevance,
      userValidation
    };
  }

  /**
   * Calculate current importance score
   */
  private calculateCurrentImportance(factors: DecayPrediction['factors']): number {
    const { accessWeight, recencyWeight, relationshipWeight, relevanceWeight, validationWeight } = this.config;

    return Math.min(1,
      factors.accessFrequency * accessWeight +
      factors.recency * recencyWeight +
      factors.relationshipStrength * relationshipWeight +
      factors.contentRelevance * relevanceWeight +
      factors.userValidation * validationWeight
    );
  }

  /**
   * Calculate decay rate (how fast importance decreases)
   */
  private calculateDecayRate(factors: DecayPrediction['factors']): number {
    // Base decay rate
    const baseRate = Math.log(2) / this.config.decayHalfLife;

    // Factors that slow decay (higher values = slower decay)
    const decayResistance = (
      factors.relationshipStrength * 0.4 +
      factors.userValidation * 0.3 +
      factors.accessFrequency * 0.3
    );

    // Adjust decay rate (higher resistance = slower decay)
    return baseRate * (1 - decayResistance * 0.8);
  }

  /**
   * Calculate predicted importance using exponential decay
   */
  private calculatePredictedImportance(
    currentImportance: number,
    decayRate: number,
    daysInFuture: number
  ): number {
    return currentImportance * Math.exp(-decayRate * daysInFuture);
  }

  /**
   * Calculate time until memory becomes obsolete
   */
  private calculateTimeToObsolescence(
    currentImportance: number,
    decayRate: number
  ): number {
    if (decayRate <= 0 || currentImportance <= this.config.obsolescenceThreshold) {
      return 0;
    }

    // Solve for t when importance drops to obsolescence threshold
    return Math.log(currentImportance / this.config.obsolescenceThreshold) / decayRate;
  }

  /**
   * Calculate confidence in prediction
   */
  private calculateConfidence(factors: DecayPrediction['factors'], memory: MemoryItem): number {
    // Higher confidence with more data points
    const dataPoints = [
      memory.accessCount > 0 ? 1 : 0,
      factors.relationshipStrength > 0 ? 1 : 0,
      factors.userValidation !== 0.5 ? 1 : 0, // has validation data
      factors.contentRelevance !== 0.5 ? 1 : 0, // has relevance data
    ].reduce((sum, point) => sum + point, 0);

    const baseConfidence = dataPoints / 4;

    // Boost confidence for memories with more history
    const historyBoost = Math.min(0.3, memory.accessCount * 0.01);

    return Math.min(1, baseConfidence + historyBoost);
  }

  /**
   * Generate recommendation based on prediction
   */
  private generateRecommendation(
    currentImportance: number,
    predictedImportance: number,
    timeToObsolescence: number
  ): DecayPrediction['recommendation'] {
    // Promote if importance is increasing significantly
    if (predictedImportance > currentImportance * 1.2) {
      return 'promote';
    }

    // Archive if becoming obsolete soon
    if (timeToObsolescence < 30 && currentImportance < 0.3) {
      return 'archive';
    }

    // Delete if already obsolete or will be very soon
    if (timeToObsolescence < 7 || currentImportance < this.config.obsolescenceThreshold) {
      return 'delete';
    }

    // Maintain otherwise
    return 'maintain';
  }

  /**
   * Get model insights and performance metrics
   */
  getModelInsights(predictions: DecayPrediction[]): {
    averageImportance: number;
    averageDecayRate: number;
    averageTimeToObsolescence: number;
    averageConfidence: number;
    recommendations: Record<string, number>;
    riskAnalysis: {
      highRiskMemories: number;
      mediumRiskMemories: number;
      lowRiskMemories: number;
    };
  } {
    if (predictions.length === 0) {
      return {
        averageImportance: 0,
        averageDecayRate: 0,
        averageTimeToObsolescence: 0,
        averageConfidence: 0,
        recommendations: {},
        riskAnalysis: { highRiskMemories: 0, mediumRiskMemories: 0, lowRiskMemories: 0 }
      };
    }

    const averageImportance = predictions.reduce((sum, p) => sum + p.currentImportance, 0) / predictions.length;
    const averageDecayRate = predictions.reduce((sum, p) => sum + p.decayRate, 0) / predictions.length;
    const averageTimeToObsolescence = predictions.reduce((sum, p) => sum + p.timeToObsolescence, 0) / predictions.length;
    const averageConfidence = predictions.reduce((sum, p) => sum + p.confidenceScore, 0) / predictions.length;

    const recommendations: Record<string, number> = {};
    predictions.forEach(p => {
      recommendations[p.recommendation] = (recommendations[p.recommendation] || 0) + 1;
    });

    const riskAnalysis = {
      highRiskMemories: predictions.filter(p => p.timeToObsolescence < 7).length,
      mediumRiskMemories: predictions.filter(p => p.timeToObsolescence >= 7 && p.timeToObsolescence < 30).length,
      lowRiskMemories: predictions.filter(p => p.timeToObsolescence >= 30).length,
    };

    return {
      averageImportance,
      averageDecayRate,
      averageTimeToObsolescence,
      averageConfidence,
      recommendations,
      riskAnalysis
    };
  }
}