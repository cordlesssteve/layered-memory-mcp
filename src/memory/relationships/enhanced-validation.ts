/**
 * Enhanced User Validation Interface with Advanced Learning Capabilities
 * Provides intelligent suggestion prioritization, learning patterns, and user preference modeling
 */

import { createLogger } from '../../utils/logger.js';
import type { RelationshipSuggestion } from './validation-interface.js';

const logger = createLogger('enhanced-validation');

export interface UserPreferences {
  userId?: string;
  preferredConfidenceThreshold: number;
  relationshipTypePreferences: Record<string, number>; // type -> preference score (0-1)
  algorithmTrust: Record<string, number>; // algorithm -> trust score (0-1)
  feedbackPatterns: {
    averageResponseTime: number; // milliseconds
    detailLevel: 'brief' | 'detailed'; // preferred feedback style
    rejectionReasons: Record<string, number>; // reason -> frequency
  };
}

export interface SuggestionPriority {
  suggestionId: string;
  priorityScore: number; // 0-1, higher = more important to show user
  reasoning: string[];
}

export interface LearningInsights {
  userAccuracyTrend: number[]; // accuracy over time
  optimalConfidenceThreshold: number;
  mostTrustedAlgorithm: string;
  commonRejectionReasons: Array<{ reason: string; frequency: number }>;
  suggestedAlgorithmWeights: Record<string, number>;
}

/**
 * Enhanced validation interface with machine learning capabilities
 */
export class EnhancedValidationInterface {
  private userPreferences = new Map<string, UserPreferences>();
  private learningInsights = new Map<string, LearningInsights>();

  // Track real-time feedback for immediate learning
  private recentValidations = new Map<string, RelationshipSuggestion[]>();
  private feedbackTimestamps = new Map<string, number[]>();

  /**
   * Initialize or update user preferences based on validation history
   */
  updateUserPreferences(
    userId: string,
    validationHistory: RelationshipSuggestion[]
  ): UserPreferences {
    const existing = this.userPreferences.get(userId) || {
      preferredConfidenceThreshold: 0.7,
      relationshipTypePreferences: {},
      algorithmTrust: {},
      feedbackPatterns: {
        averageResponseTime: 30000, // 30 seconds default
        detailLevel: 'brief',
        rejectionReasons: {},
      },
    };

    // Analyze user's validation patterns
    const confirmedSuggestions = validationHistory.filter(s => s.status === 'confirmed');
    const rejectedSuggestions = validationHistory.filter(s => s.status === 'rejected');

    // Update confidence threshold based on user's acceptance patterns
    if (confirmedSuggestions.length > 5) {
      const avgConfidenceAccepted = confirmedSuggestions.reduce((sum, s) => sum + s.confidence, 0) / confirmedSuggestions.length;
      existing.preferredConfidenceThreshold = Math.max(0.5, avgConfidenceAccepted - 0.1);
    }

    // Update relationship type preferences
    for (const suggestion of confirmedSuggestions) {
      const relType = suggestion.relationship.type;
      existing.relationshipTypePreferences[relType] =
        (existing.relationshipTypePreferences[relType] || 0) * 0.9 + 0.1; // Increase preference
    }

    for (const suggestion of rejectedSuggestions) {
      const relType = suggestion.relationship.type;
      existing.relationshipTypePreferences[relType] =
        (existing.relationshipTypePreferences[relType] || 0) * 0.9; // Decrease preference
    }

    // Update algorithm trust scores
    for (const suggestion of confirmedSuggestions) {
      const algorithm = suggestion.algorithm;
      existing.algorithmTrust[algorithm] =
        (existing.algorithmTrust[algorithm] || 0.5) * 0.9 + 0.1; // Increase trust
    }

    for (const suggestion of rejectedSuggestions) {
      const algorithm = suggestion.algorithm;
      existing.algorithmTrust[algorithm] =
        (existing.algorithmTrust[algorithm] || 0.5) * 0.9; // Decrease trust
    }

    // Analyze rejection reasons
    for (const suggestion of rejectedSuggestions) {
      if (suggestion.userFeedback) {
        const reason = this.categorizeRejectionReason(suggestion.userFeedback);
        existing.feedbackPatterns.rejectionReasons[reason] =
          (existing.feedbackPatterns.rejectionReasons[reason] || 0) + 1;
      }
    }

    existing.userId = userId;
    this.userPreferences.set(userId, existing);

    logger.info('Updated user preferences', {
      userId,
      threshold: existing.preferredConfidenceThreshold,
      topRelationType: Object.keys(existing.relationshipTypePreferences)[0]
    });

    return existing;
  }

  /**
   * Prioritize suggestions based on user preferences and learning insights
   */
  prioritizeSuggestions(
    suggestions: RelationshipSuggestion[],
    userId?: string
  ): SuggestionPriority[] {
    const preferences = userId ? this.userPreferences.get(userId) : null;
    const priorities: SuggestionPriority[] = [];

    for (const suggestion of suggestions) {
      const reasoning: string[] = [];
      let priorityScore = 0.5; // Base score

      // Factor 1: Confidence relative to user's threshold
      const confidenceThreshold = preferences?.preferredConfidenceThreshold || 0.7;
      if (suggestion.confidence >= confidenceThreshold) {
        priorityScore += 0.2;
        reasoning.push(`High confidence (${suggestion.confidence.toFixed(2)} >= ${confidenceThreshold.toFixed(2)})`);
      } else if (suggestion.confidence < confidenceThreshold - 0.2) {
        priorityScore -= 0.2;
        reasoning.push(`Low confidence (${suggestion.confidence.toFixed(2)} < ${confidenceThreshold.toFixed(2)})`);
      }

      // Factor 2: Relationship type preference
      const typePreference = preferences?.relationshipTypePreferences[suggestion.relationship.type] || 0.5;
      priorityScore += (typePreference - 0.5) * 0.3;
      if (typePreference > 0.7) {
        reasoning.push(`Preferred relationship type (${suggestion.relationship.type})`);
      } else if (typePreference < 0.3) {
        reasoning.push(`Less preferred relationship type (${suggestion.relationship.type})`);
      }

      // Factor 3: Algorithm trust
      const algorithmTrust = preferences?.algorithmTrust[suggestion.algorithm] || 0.5;
      priorityScore += (algorithmTrust - 0.5) * 0.2;
      if (algorithmTrust > 0.7) {
        reasoning.push(`Trusted algorithm (${suggestion.algorithm})`);
      } else if (algorithmTrust < 0.3) {
        reasoning.push(`Less trusted algorithm (${suggestion.algorithm})`);
      }

      // Factor 4: Content quality indicators
      const sourceLength = suggestion.sourceMemoryContent.length;
      const targetLength = suggestion.targetMemoryContent.length;
      if (sourceLength > 50 && targetLength > 50) {
        priorityScore += 0.1;
        reasoning.push('Rich content available for validation');
      }

      // Factor 5: Novelty - prioritize diverse relationship types
      const typeFrequency = suggestions.filter(s => s.relationship.type === suggestion.relationship.type).length;
      if (typeFrequency === 1) {
        priorityScore += 0.1;
        reasoning.push('Novel relationship type');
      }

      // Normalize priority score
      priorityScore = Math.max(0, Math.min(1, priorityScore));

      priorities.push({
        suggestionId: suggestion.id,
        priorityScore,
        reasoning,
      });
    }

    // Sort by priority score (highest first)
    priorities.sort((a, b) => b.priorityScore - a.priorityScore);

    return priorities;
  }

  /**
   * Generate learning insights for algorithm improvement
   */
  generateLearningInsights(
    userId: string,
    validationHistory: RelationshipSuggestion[]
  ): LearningInsights {
    const recentHistory = validationHistory
      .filter(s => s.status !== 'pending')
      .sort((a, b) => a.suggestedAt.getTime() - b.suggestedAt.getTime())
      .slice(-50); // Last 50 validations

    // Calculate accuracy trend over time (in chunks of 10)
    const userAccuracyTrend: number[] = [];
    for (let i = 0; i < recentHistory.length; i += 10) {
      const chunk = recentHistory.slice(i, i + 10);
      const accurate = chunk.filter(s => s.status === 'confirmed' || s.status === 'modified').length;
      userAccuracyTrend.push(accurate / chunk.length);
    }

    // Find optimal confidence threshold
    const confidenceThresholds = [0.5, 0.6, 0.7, 0.8, 0.9];
    let optimalConfidenceThreshold = 0.7;
    let bestPrecision = 0;

    for (const threshold of confidenceThresholds) {
      const aboveThreshold = recentHistory.filter(s => s.confidence >= threshold);
      if (aboveThreshold.length > 0) {
        const accurate = aboveThreshold.filter(s => s.status === 'confirmed' || s.status === 'modified').length;
        const precision = accurate / aboveThreshold.length;
        if (precision > bestPrecision) {
          bestPrecision = precision;
          optimalConfidenceThreshold = threshold;
        }
      }
    }

    // Find most trusted algorithm
    const algorithmPerformance = new Map<string, { total: number; accurate: number }>();
    for (const suggestion of recentHistory) {
      const algorithm = suggestion.algorithm;
      if (!algorithmPerformance.has(algorithm)) {
        algorithmPerformance.set(algorithm, { total: 0, accurate: 0 });
      }
      const perf = algorithmPerformance.get(algorithm)!;
      perf.total++;
      if (suggestion.status === 'confirmed' || suggestion.status === 'modified') {
        perf.accurate++;
      }
    }

    let mostTrustedAlgorithm = 'semantic-detector';
    let bestAccuracy = 0;
    for (const [algorithm, perf] of algorithmPerformance.entries()) {
      const accuracy = perf.accurate / perf.total;
      if (accuracy > bestAccuracy) {
        bestAccuracy = accuracy;
        mostTrustedAlgorithm = algorithm;
      }
    }

    // Analyze common rejection reasons
    const rejectedSuggestions = recentHistory.filter(s => s.status === 'rejected');
    const rejectionReasons = new Map<string, number>();
    for (const suggestion of rejectedSuggestions) {
      if (suggestion.userFeedback) {
        const reason = this.categorizeRejectionReason(suggestion.userFeedback);
        rejectionReasons.set(reason, (rejectionReasons.get(reason) || 0) + 1);
      }
    }

    const commonRejectionReasons = Array.from(rejectionReasons.entries())
      .map(([reason, frequency]) => ({ reason, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 5);

    // Suggest algorithm weights based on performance
    const suggestedAlgorithmWeights: Record<string, number> = {};
    for (const [algorithm, perf] of algorithmPerformance.entries()) {
      const accuracy = perf.accurate / perf.total;
      const weight = Math.max(0.1, Math.min(1.0, accuracy));
      suggestedAlgorithmWeights[algorithm] = weight;
    }

    const insights: LearningInsights = {
      userAccuracyTrend,
      optimalConfidenceThreshold,
      mostTrustedAlgorithm,
      commonRejectionReasons,
      suggestedAlgorithmWeights,
    };

    this.learningInsights.set(userId, insights);

    logger.info('Generated learning insights', {
      userId,
      optimalThreshold: optimalConfidenceThreshold,
      mostTrusted: mostTrustedAlgorithm,
      trendLength: userAccuracyTrend.length
    });

    return insights;
  }

  /**
   * Get smart suggestions based on user preferences and context
   */
  getSmartSuggestions(
    allSuggestions: RelationshipSuggestion[],
    userId?: string,
    maxSuggestions: number = 10
  ): { suggestions: RelationshipSuggestion[]; priorities: SuggestionPriority[] } {
    // Filter pending suggestions
    const pendingSuggestions = allSuggestions.filter(s => s.status === 'pending');

    // Prioritize suggestions
    const priorities = this.prioritizeSuggestions(pendingSuggestions, userId);

    // Get top suggestions based on priority
    const topPriorities = priorities.slice(0, maxSuggestions);
    const topSuggestionIds = new Set(topPriorities.map(p => p.suggestionId));

    const smartSuggestions = pendingSuggestions.filter(s => topSuggestionIds.has(s.id));

    return {
      suggestions: smartSuggestions,
      priorities: topPriorities,
    };
  }

  /**
   * Get user preferences for a specific user
   */
  getUserPreferences(userId: string): UserPreferences | null {
    return this.userPreferences.get(userId) || null;
  }

  /**
   * Get learning insights for a specific user
   */
  getLearningInsights(userId: string): LearningInsights | null {
    return this.learningInsights.get(userId) || null;
  }

  /**
   * Categorize rejection reason from user feedback
   */
  private categorizeRejectionReason(feedback: string): string {
    const feedbackLower = feedback.toLowerCase();

    if (feedbackLower.includes('irrelevant') || feedbackLower.includes('unrelated')) {
      return 'irrelevant';
    } else if (feedbackLower.includes('weak') || feedbackLower.includes('low confidence')) {
      return 'weak_connection';
    } else if (feedbackLower.includes('incorrect') || feedbackLower.includes('wrong')) {
      return 'incorrect_type';
    } else if (feedbackLower.includes('duplicate') || feedbackLower.includes('already exists')) {
      return 'duplicate';
    } else if (feedbackLower.includes('noise') || feedbackLower.includes('spam')) {
      return 'noise';
    } else {
      return 'other';
    }
  }

  /**
   * Export user model for external use or backup
   */
  exportUserModel(userId: string): {
    preferences: UserPreferences | null;
    insights: LearningInsights | null;
  } {
    return {
      preferences: this.getUserPreferences(userId),
      insights: this.getLearningInsights(userId),
    };
  }

  /**
   * Import user model from external source
   */
  importUserModel(
    userId: string,
    preferences: UserPreferences,
    insights: LearningInsights
  ): void {
    this.userPreferences.set(userId, preferences);
    this.learningInsights.set(userId, insights);

    logger.info('Imported user model', { userId });
  }

  /**
   * Process real-time validation feedback for immediate learning
   */
  processRealTimeFeedback(
    userId: string,
    suggestion: RelationshipSuggestion,
    action: 'confirm' | 'reject' | 'modify',
    userFeedback?: string
  ): void {
    const timestamp = Date.now();

    // Track validation timing
    const timestamps = this.feedbackTimestamps.get(userId) || [];
    timestamps.push(timestamp);

    // Keep only recent timestamps (last 100)
    if (timestamps.length > 100) {
      timestamps.splice(0, timestamps.length - 100);
    }
    this.feedbackTimestamps.set(userId, timestamps);

    // Update suggestion status
    suggestion.status = action === 'confirm' ? 'confirmed' : action === 'reject' ? 'rejected' : 'modified';
    if (userFeedback !== undefined) {
      suggestion.userFeedback = userFeedback;
    }

    // Store recent validation
    const recentValidations = this.recentValidations.get(userId) || [];
    recentValidations.push(suggestion);

    // Keep only recent validations (last 50)
    if (recentValidations.length > 50) {
      recentValidations.splice(0, recentValidations.length - 50);
    }
    this.recentValidations.set(userId, recentValidations);

    // Update user preferences in real-time
    const currentPrefs = this.getUserPreferences(userId) || {
      preferredConfidenceThreshold: 0.7,
      relationshipTypePreferences: {},
      algorithmTrust: {},
      feedbackPatterns: {
        averageResponseTime: 30000,
        detailLevel: 'brief',
        rejectionReasons: {},
      },
    };

    // Immediate algorithm trust adjustment
    const algorithm = suggestion.algorithm;
    const currentTrust = currentPrefs.algorithmTrust[algorithm] || 0.5;

    if (action === 'confirm') {
      currentPrefs.algorithmTrust[algorithm] = Math.min(1.0, currentTrust + 0.05);
    } else if (action === 'reject') {
      currentPrefs.algorithmTrust[algorithm] = Math.max(0.0, currentTrust - 0.05);
    }

    // Update relationship type preference
    const relType = suggestion.relationship.type;
    const currentPref = currentPrefs.relationshipTypePreferences[relType] || 0.5;

    if (action === 'confirm') {
      currentPrefs.relationshipTypePreferences[relType] = Math.min(1.0, currentPref + 0.03);
    } else if (action === 'reject') {
      currentPrefs.relationshipTypePreferences[relType] = Math.max(0.0, currentPref - 0.03);
    }

    // Update average response time
    if (timestamps.length >= 2) {
      const recentResponseTimes = [];
      for (let i = 1; i < timestamps.length; i++) {
        const prevTime = timestamps[i - 1];
        const currentTime = timestamps[i];
        if (prevTime !== undefined && currentTime !== undefined) {
          recentResponseTimes.push(currentTime - prevTime);
        }
      }
      if (recentResponseTimes.length > 0) {
        currentPrefs.feedbackPatterns.averageResponseTime =
          recentResponseTimes.reduce((sum, time) => sum + time, 0) / recentResponseTimes.length;
      }
    }

    this.userPreferences.set(userId, currentPrefs);

    logger.debug('Processed real-time feedback', {
      userId,
      action,
      algorithm,
      relationshipType: relType,
      newAlgorithmTrust: currentPrefs.algorithmTrust[algorithm],
      newTypePreference: currentPrefs.relationshipTypePreferences[relType],
    });
  }

  /**
   * Get adaptive suggestion batches based on user behavior patterns
   */
  getAdaptiveSuggestionBatch(
    allSuggestions: RelationshipSuggestion[],
    userId?: string
  ): {
    suggestions: RelationshipSuggestion[];
    priorities: SuggestionPriority[];
    reasoning: string[];
  } {
    if (!userId) {
      return {
        suggestions: allSuggestions.filter(s => s.status === 'pending').slice(0, 5),
        priorities: [],
        reasoning: ['No user context available, showing default suggestions'],
      };
    }

    const preferences = this.getUserPreferences(userId);
    const recentValidations = this.recentValidations.get(userId) || [];

    // Determine optimal batch size based on user behavior
    let batchSize = 10; // default
    const avgResponseTime = preferences?.feedbackPatterns.averageResponseTime || 30000;

    if (avgResponseTime < 10000) { // Fast responder
      batchSize = 15;
    } else if (avgResponseTime > 60000) { // Slow responder
      batchSize = 5;
    }

    // Get smart suggestions with adaptive sizing
    const { suggestions, priorities } = this.getSmartSuggestions(allSuggestions, userId, batchSize);

    // Generate reasoning for the suggestions
    const reasoning: string[] = [];

    if (preferences) {
      reasoning.push(`Batch size adapted to ${batchSize} based on your response patterns`);

      const trustedAlgorithms = Object.entries(preferences.algorithmTrust)
        .filter(([_, trust]) => trust > 0.7)
        .map(([algo]) => algo);

      if (trustedAlgorithms.length > 0) {
        reasoning.push(`Prioritizing suggestions from trusted algorithms: ${trustedAlgorithms.join(', ')}`);
      }

      const preferredTypes = Object.entries(preferences.relationshipTypePreferences)
        .filter(([_, pref]) => pref > 0.6)
        .map(([type]) => type);

      if (preferredTypes.length > 0) {
        reasoning.push(`Focusing on relationship types you prefer: ${preferredTypes.join(', ')}`);
      }
    }

    if (recentValidations.length > 10) {
      const recentAccuracy = recentValidations
        .filter(v => v.status === 'confirmed' || v.status === 'modified').length / recentValidations.length;

      if (recentAccuracy > 0.8) {
        reasoning.push('Including higher confidence suggestions based on your high accuracy rate');
      } else if (recentAccuracy < 0.6) {
        reasoning.push('Showing more conservative suggestions to improve accuracy');
      }
    }

    return {
      suggestions,
      priorities,
      reasoning,
    };
  }

  /**
   * Get performance analytics for the validation system
   */
  getValidationAnalytics(userId?: string): {
    totalUsers: number;
    avgAccuracyRate: number;
    avgResponseTime: number;
    topAlgorithms: Array<{ algorithm: string; trustScore: number }>;
    commonRejectionReasons: Array<{ reason: string; frequency: number }>;
    userSpecific?: {
      accuracyRate: number;
      responseTime: number;
      validationCount: number;
      preferredTypes: string[];
    };
  } {
    const analytics = {
      totalUsers: this.userPreferences.size,
      avgAccuracyRate: 0,
      avgResponseTime: 0,
      topAlgorithms: [] as Array<{ algorithm: string; trustScore: number }>,
      commonRejectionReasons: [] as Array<{ reason: string; frequency: number }>,
    };

    // Calculate overall metrics
    const allPreferences = Array.from(this.userPreferences.values());

    if (allPreferences.length > 0) {
      analytics.avgResponseTime = allPreferences
        .reduce((sum, prefs) => sum + prefs.feedbackPatterns.averageResponseTime, 0) / allPreferences.length;

      // Aggregate algorithm trust scores
      const algorithmTrusts = new Map<string, number[]>();
      allPreferences.forEach(prefs => {
        Object.entries(prefs.algorithmTrust).forEach(([algo, trust]) => {
          if (!algorithmTrusts.has(algo)) {
            algorithmTrusts.set(algo, []);
          }
          algorithmTrusts.get(algo)!.push(trust);
        });
      });

      analytics.topAlgorithms = Array.from(algorithmTrusts.entries())
        .map(([algo, trusts]) => ({
          algorithm: algo,
          trustScore: trusts.reduce((sum, trust) => sum + trust, 0) / trusts.length,
        }))
        .sort((a, b) => b.trustScore - a.trustScore);

      // Aggregate rejection reasons
      const rejectionReasons = new Map<string, number>();
      allPreferences.forEach(prefs => {
        Object.entries(prefs.feedbackPatterns.rejectionReasons).forEach(([reason, freq]) => {
          rejectionReasons.set(reason, (rejectionReasons.get(reason) || 0) + freq);
        });
      });

      analytics.commonRejectionReasons = Array.from(rejectionReasons.entries())
        .map(([reason, frequency]) => ({ reason, frequency }))
        .sort((a, b) => b.frequency - a.frequency);
    }

    // Add user-specific analytics if requested
    if (userId) {
      const userPrefs = this.getUserPreferences(userId);
      const recentValidations = this.recentValidations.get(userId) || [];

      if (userPrefs && recentValidations.length > 0) {
        const confirmed = recentValidations.filter(v => v.status === 'confirmed' || v.status === 'modified').length;
        const accuracyRate = confirmed / recentValidations.length;

        const preferredTypes = Object.entries(userPrefs.relationshipTypePreferences)
          .filter(([_, pref]) => pref > 0.6)
          .map(([type]) => type);

        (analytics as any).userSpecific = {
          accuracyRate,
          responseTime: userPrefs.feedbackPatterns.averageResponseTime,
          validationCount: recentValidations.length,
          preferredTypes,
        };
      }
    }

    return analytics;
  }
}