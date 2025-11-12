/**
 * User Validation Interface for Auto-detected Relationships
 * Allows users to confirm, reject, or modify relationship suggestions
 */

import { createLogger } from '../../utils/logger.js';
import type { MemoryRelationship } from './types.js';

const logger = createLogger('relationship-validation');

export interface RelationshipSuggestion {
  id: string;
  relationship: MemoryRelationship;
  sourceMemoryContent: string;
  targetMemoryContent: string;
  confidence: number;
  algorithm: string;
  suggestedAt: Date;
  status: 'pending' | 'confirmed' | 'rejected' | 'modified';
  userFeedback?: string;
  modifiedType?: string;
  modifiedConfidence?: number;
}

export interface ValidationStats {
  totalSuggestions: number;
  pendingSuggestions: number;
  confirmedSuggestions: number;
  rejectedSuggestions: number;
  modifiedSuggestions: number;
  averageConfidenceApproved: number;
  algorithmAccuracy: Record<string, number>;
}

export class RelationshipValidationInterface {
  private suggestions = new Map<string, RelationshipSuggestion>();
  private validationHistory = new Map<string, RelationshipSuggestion>();

  /**
   * Create a relationship suggestion for user validation
   */
  createSuggestion(
    relationship: MemoryRelationship,
    sourceContent: string,
    targetContent: string
  ): RelationshipSuggestion {
    const suggestion: RelationshipSuggestion = {
      id: `suggestion-${relationship.id}`,
      relationship,
      sourceMemoryContent: sourceContent,
      targetMemoryContent: targetContent,
      confidence: relationship.confidence,
      algorithm: relationship.metadata.algorithm || 'unknown',
      suggestedAt: new Date(),
      status: 'pending',
    };

    this.suggestions.set(suggestion.id, suggestion);
    logger.info(`Created relationship suggestion: ${relationship.type} (confidence: ${relationship.confidence})`);

    return suggestion;
  }

  /**
   * Get pending suggestions for user review
   */
  getPendingSuggestions(limit: number = 10): RelationshipSuggestion[] {
    return Array.from(this.suggestions.values())
      .filter(suggestion => suggestion.status === 'pending')
      .sort((a, b) => b.confidence - a.confidence) // High confidence first
      .slice(0, limit);
  }

  /**
   * Get suggestions filtered by confidence threshold
   */
  getSuggestionsByConfidence(
    minConfidence: number = 0.7,
    maxConfidence: number = 1.0
  ): RelationshipSuggestion[] {
    return Array.from(this.suggestions.values())
      .filter(suggestion =>
        suggestion.confidence >= minConfidence &&
        suggestion.confidence <= maxConfidence
      )
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * User confirms a relationship suggestion
   */
  confirmSuggestion(suggestionId: string, userFeedback?: string): boolean {
    const suggestion = this.suggestions.get(suggestionId);
    if (!suggestion) {
      logger.warn(`Suggestion ${suggestionId} not found`);
      return false;
    }

    suggestion.status = 'confirmed';
    if (userFeedback !== undefined) {
      suggestion.userFeedback = userFeedback;
    }

    // Move to validation history
    this.validationHistory.set(suggestionId, suggestion);
    this.suggestions.delete(suggestionId);

    logger.info(`User confirmed relationship: ${suggestion.relationship.type}`, {
      confidence: suggestion.confidence,
      algorithm: suggestion.algorithm,
      feedback: userFeedback
    });

    return true;
  }

  /**
   * User rejects a relationship suggestion
   */
  rejectSuggestion(suggestionId: string, userFeedback?: string): boolean {
    const suggestion = this.suggestions.get(suggestionId);
    if (!suggestion) {
      logger.warn(`Suggestion ${suggestionId} not found`);
      return false;
    }

    suggestion.status = 'rejected';
    if (userFeedback !== undefined) {
      suggestion.userFeedback = userFeedback;
    }

    // Move to validation history
    this.validationHistory.set(suggestionId, suggestion);
    this.suggestions.delete(suggestionId);

    logger.info(`User rejected relationship: ${suggestion.relationship.type}`, {
      confidence: suggestion.confidence,
      algorithm: suggestion.algorithm,
      feedback: userFeedback
    });

    return true;
  }

  /**
   * User modifies a relationship suggestion
   */
  modifySuggestion(
    suggestionId: string,
    newType?: string,
    newConfidence?: number,
    userFeedback?: string
  ): boolean {
    const suggestion = this.suggestions.get(suggestionId);
    if (!suggestion) {
      logger.warn(`Suggestion ${suggestionId} not found`);
      return false;
    }

    suggestion.status = 'modified';
    if (newType !== undefined) {
      suggestion.modifiedType = newType;
    }
    if (newConfidence !== undefined) {
      suggestion.modifiedConfidence = newConfidence;
    }
    if (userFeedback !== undefined) {
      suggestion.userFeedback = userFeedback;
    }

    // Move to validation history
    this.validationHistory.set(suggestionId, suggestion);
    this.suggestions.delete(suggestionId);

    logger.info(`User modified relationship: ${suggestion.relationship.type} -> ${newType}`, {
      originalConfidence: suggestion.confidence,
      modifiedConfidence: newConfidence,
      algorithm: suggestion.algorithm,
      feedback: userFeedback
    });

    return true;
  }

  /**
   * Batch operations for multiple suggestions
   */
  batchValidate(
    suggestionIds: string[],
    action: 'confirm' | 'reject',
    userFeedback?: string
  ): { successful: number; failed: number } {
    let successful = 0;
    let failed = 0;

    for (const id of suggestionIds) {
      const success = action === 'confirm'
        ? this.confirmSuggestion(id, userFeedback)
        : this.rejectSuggestion(id, userFeedback);

      if (success) {
        successful++;
      } else {
        failed++;
      }
    }

    logger.info(`Batch ${action} completed: ${successful} successful, ${failed} failed`);
    return { successful, failed };
  }

  /**
   * Get validation statistics and learning insights
   */
  getValidationStats(): ValidationStats {
    const allSuggestions = [
      ...Array.from(this.suggestions.values()),
      ...Array.from(this.validationHistory.values())
    ];

    const totalSuggestions = allSuggestions.length;
    const pendingSuggestions = allSuggestions.filter(s => s.status === 'pending').length;
    const confirmedSuggestions = allSuggestions.filter(s => s.status === 'confirmed').length;
    const rejectedSuggestions = allSuggestions.filter(s => s.status === 'rejected').length;
    const modifiedSuggestions = allSuggestions.filter(s => s.status === 'modified').length;

    // Calculate average confidence of approved suggestions
    const approvedSuggestions = allSuggestions.filter(s =>
      s.status === 'confirmed' || s.status === 'modified'
    );
    const averageConfidenceApproved = approvedSuggestions.length > 0
      ? approvedSuggestions.reduce((sum, s) => sum + s.confidence, 0) / approvedSuggestions.length
      : 0;

    // Calculate algorithm accuracy
    const algorithmAccuracy: Record<string, number> = {};
    const algorithmStats = new Map<string, { total: number; confirmed: number }>();

    for (const suggestion of allSuggestions) {
      if (suggestion.status === 'pending') continue;

      const algorithm = suggestion.algorithm;
      if (!algorithmStats.has(algorithm)) {
        algorithmStats.set(algorithm, { total: 0, confirmed: 0 });
      }

      const stats = algorithmStats.get(algorithm)!;
      stats.total++;
      if (suggestion.status === 'confirmed' || suggestion.status === 'modified') {
        stats.confirmed++;
      }
    }

    for (const [algorithm, stats] of algorithmStats) {
      algorithmAccuracy[algorithm] = stats.total > 0 ? stats.confirmed / stats.total : 0;
    }

    return {
      totalSuggestions,
      pendingSuggestions,
      confirmedSuggestions,
      rejectedSuggestions,
      modifiedSuggestions,
      averageConfidenceApproved,
      algorithmAccuracy
    };
  }

  /**
   * Learn from user feedback to improve algorithm performance
   */
  getAlgorithmInsights(): {
    highPerformingAlgorithms: string[];
    lowPerformingAlgorithms: string[];
    optimalConfidenceThreshold: number;
    userPreferences: {
      preferredRelationshipTypes: string[];
      rejectedRelationshipTypes: string[];
    };
  } {
    const stats = this.getValidationStats();
    const validatedSuggestions = Array.from(this.validationHistory.values());

    // Identify high and low performing algorithms
    const highPerformingAlgorithms = Object.entries(stats.algorithmAccuracy)
      .filter(([, accuracy]) => accuracy >= 0.8)
      .map(([algorithm]) => algorithm);

    const lowPerformingAlgorithms = Object.entries(stats.algorithmAccuracy)
      .filter(([, accuracy]) => accuracy < 0.5)
      .map(([algorithm]) => algorithm);

    // Calculate optimal confidence threshold
    const confirmedSuggestions = validatedSuggestions.filter(s => s.status === 'confirmed');
    const rejectedSuggestions = validatedSuggestions.filter(s => s.status === 'rejected');

    let optimalConfidenceThreshold = 0.7;
    if (confirmedSuggestions.length > 0 && rejectedSuggestions.length > 0) {
      const confirmedConfidences = confirmedSuggestions.map(s => s.confidence);
      const rejectedConfidences = rejectedSuggestions.map(s => s.confidence);

      const avgConfirmed = confirmedConfidences.reduce((a, b) => a + b, 0) / confirmedConfidences.length;
      const avgRejected = rejectedConfidences.reduce((a, b) => a + b, 0) / rejectedConfidences.length;

      optimalConfidenceThreshold = (avgConfirmed + avgRejected) / 2;
    }

    // Analyze user preferences for relationship types
    const typePreferences = new Map<string, { confirmed: number; rejected: number }>();

    for (const suggestion of validatedSuggestions) {
      const type = suggestion.relationship.type;
      if (!typePreferences.has(type)) {
        typePreferences.set(type, { confirmed: 0, rejected: 0 });
      }

      const prefs = typePreferences.get(type)!;
      if (suggestion.status === 'confirmed' || suggestion.status === 'modified') {
        prefs.confirmed++;
      } else if (suggestion.status === 'rejected') {
        prefs.rejected++;
      }
    }

    const preferredRelationshipTypes = Array.from(typePreferences.entries())
      .filter(([, prefs]) => prefs.confirmed > prefs.rejected)
      .map(([type]) => type);

    const rejectedRelationshipTypes = Array.from(typePreferences.entries())
      .filter(([, prefs]) => prefs.rejected > prefs.confirmed)
      .map(([type]) => type);

    return {
      highPerformingAlgorithms,
      lowPerformingAlgorithms,
      optimalConfidenceThreshold,
      userPreferences: {
        preferredRelationshipTypes,
        rejectedRelationshipTypes
      }
    };
  }

  /**
   * Clear old suggestions and history
   */
  cleanup(daysToKeep: number = 30): void {
    const cutoffDate = new Date(Date.now() - (daysToKeep * 24 * 60 * 60 * 1000));

    let removedSuggestions = 0;
    let removedHistory = 0;

    // Clean old pending suggestions
    for (const [id, suggestion] of this.suggestions) {
      if (suggestion.suggestedAt < cutoffDate) {
        this.suggestions.delete(id);
        removedSuggestions++;
      }
    }

    // Clean old validation history
    for (const [id, suggestion] of this.validationHistory) {
      if (suggestion.suggestedAt < cutoffDate) {
        this.validationHistory.delete(id);
        removedHistory++;
      }
    }

    logger.info(`Cleanup completed: removed ${removedSuggestions} suggestions, ${removedHistory} history items`);
  }

  /**
   * Get all pending suggestions (no limit)
   */
  getAllPendingSuggestions(): RelationshipSuggestion[] {
    return Array.from(this.suggestions.values());
  }

  /**
   * Get validation history
   */
  getValidationHistory(): RelationshipSuggestion[] {
    return Array.from(this.validationHistory.values());
  }

  /**
   * Get all suggestions (pending + history)
   */
  getAllSuggestions(): RelationshipSuggestion[] {
    return [
      ...this.getPendingSuggestions(),
      ...this.getValidationHistory()
    ];
  }
}