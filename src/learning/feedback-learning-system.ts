/**
 * Learning Feedback Loop System for Software Engineering Context
 * Tracks user interactions and continuously improves semantic understanding
 */

import type { MemorySearchResult } from '../memory/types.js';

export interface UserInteraction {
  id: string;
  userId?: string | undefined;
  sessionId: string;
  timestamp: Date;
  type: InteractionType;
  context: InteractionContext;
  outcome: InteractionOutcome;
  metadata: Record<string, any>;
}

export interface InteractionContext {
  memoryId?: string | undefined;
  searchQuery?: string | undefined;
  searchResults?: MemorySearchResult[] | undefined;
  conceptsInvolved: string[];
  categoriesInvolved: string[];
  codeContext?:
    | {
        language: string;
        framework?: string | undefined;
        domain?: string | undefined;
      }
    | undefined;
}

export interface InteractionOutcome {
  action: UserAction;
  satisfaction: SatisfactionLevel;
  explicitFeedback?: ExplicitFeedback | undefined;
  implicitSignals: ImplicitSignal[];
  learningValue: number; // 0-1 score for how valuable this interaction is for learning
}

export interface ExplicitFeedback {
  rating?: number | undefined; // 1-5 scale
  comments?: string | undefined;
  suggestedImprovements?: string[] | undefined;
  correctCategories?: string[] | undefined;
  correctConcepts?: string[] | undefined;
}

export interface ImplicitSignal {
  type: SignalType;
  value: number;
  timestamp: Date;
  confidence: number;
}

export type InteractionType =
  | 'search'
  | 'store'
  | 'retrieve'
  | 'validate_relationship'
  | 'concept_feedback'
  | 'category_feedback'
  | 'quality_assessment';

export type UserAction =
  | 'accepted'
  | 'rejected'
  | 'modified'
  | 'ignored'
  | 'bookmarked'
  | 'shared'
  | 'deleted'
  | 'flagged';

export type SatisfactionLevel =
  | 'very_satisfied'
  | 'satisfied'
  | 'neutral'
  | 'dissatisfied'
  | 'very_dissatisfied';

export type SignalType =
  | 'dwell_time' // How long user spent with content
  | 'click_depth' // How deep into results they went
  | 'return_frequency' // How often they return to content
  | 'modification_rate' // How often they modify suggested content
  | 'sharing_behavior' // Whether they share/bookmark content
  | 'search_refinement' // How they refine searches
  | 'concept_usage' // Which concepts they use most
  | 'category_preference'; // Which categories they prefer

export interface UserProfile {
  userId: string;
  preferences: {
    preferredConcepts: string[];
    preferredCategories: string[];
    preferredLanguages: string[];
    preferredFrameworks: string[];
    preferredDomains: string[];
  };
  behaviorPatterns: {
    averageDwellTime: number;
    searchPatterns: string[];
    contentPreferences: string[];
    qualityThresholds: Record<string, number>;
  };
  learningHistory: {
    acceptedSuggestions: number;
    rejectedSuggestions: number;
    conceptAccuracyRate: number;
    categoryAccuracyRate: number;
  };
  lastUpdated: Date;
}

export interface LearningInsight {
  type: InsightType;
  description: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  actionable: boolean;
  recommendations: string[];
  evidence: {
    interactionCount: number;
    timeframe: string;
    patterns: string[];
  };
}

export type InsightType =
  | 'concept_accuracy_trend'
  | 'category_preference_shift'
  | 'search_pattern_evolution'
  | 'quality_threshold_change'
  | 'framework_adoption'
  | 'domain_expertise_growth';

/**
 * Feedback Learning System
 * Sprint SE-1 implementation: Basic interaction tracking and learning
 */
export class FeedbackLearningSystem {
  private interactions: Map<string, UserInteraction[]> = new Map();
  private userProfiles: Map<string, UserProfile> = new Map();

  /**
   * Record a user interaction for learning
   */
  async recordInteraction(interaction: UserInteraction): Promise<void> {
    const userId = interaction.userId || 'anonymous';

    if (!this.interactions.has(userId)) {
      this.interactions.set(userId, []);
    }

    this.interactions.get(userId)!.push(interaction);

    // Update user profile based on interaction
    await this.updateUserProfile(userId, interaction);
  }

  /**
   * Record search feedback for learning
   */
  async recordSearchFeedback(
    query: string,
    results: MemorySearchResult[],
    actions: UserAction[]
  ): Promise<void> {
    // Basic implementation for Sprint SE-1
    const interaction: UserInteraction = {
      id: `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId: 'current_session',
      timestamp: new Date(),
      type: 'search',
      context: {
        searchQuery: query,
        searchResults: results,
        conceptsInvolved: [],
        categoriesInvolved: [],
      },
      outcome: {
        action: actions[0] || 'ignored',
        satisfaction: 'neutral',
        implicitSignals: [],
        learningValue: 0.5,
      },
      metadata: {},
    };

    await this.recordInteraction(interaction);
  }

  /**
   * Generate learning insights from accumulated interactions
   */
  async generateLearningInsights(): Promise<LearningInsight[]> {
    const insights: LearningInsight[] = [];

    // Basic insights for Sprint SE-1
    for (const [, userInteractions] of this.interactions) {
      if (userInteractions.length < 5) continue; // Need minimum interactions

      // Analyze concept accuracy trends
      const conceptAccuracyInsight = this.analyzeConceptAccuracy(userInteractions);
      if (conceptAccuracyInsight) {
        insights.push(conceptAccuracyInsight);
      }

      // Analyze search patterns
      const searchPatternInsight = this.analyzeSearchPatterns(userInteractions);
      if (searchPatternInsight) {
        insights.push(searchPatternInsight);
      }
    }

    return insights;
  }

  /**
   * Get learning recommendations for improving system accuracy
   */
  async getRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];
    const insights = await this.generateLearningInsights();

    for (const insight of insights) {
      recommendations.push(...insight.recommendations);
    }

    return [...new Set(recommendations)]; // Remove duplicates
  }

  /**
   * Update user profile based on interaction
   */
  private async updateUserProfile(userId: string, interaction: UserInteraction): Promise<void> {
    let profile = this.userProfiles.get(userId);

    if (!profile) {
      profile = {
        userId,
        preferences: {
          preferredConcepts: [],
          preferredCategories: [],
          preferredLanguages: [],
          preferredFrameworks: [],
          preferredDomains: [],
        },
        behaviorPatterns: {
          averageDwellTime: 0,
          searchPatterns: [],
          contentPreferences: [],
          qualityThresholds: {},
        },
        learningHistory: {
          acceptedSuggestions: 0,
          rejectedSuggestions: 0,
          conceptAccuracyRate: 0,
          categoryAccuracyRate: 0,
        },
        lastUpdated: new Date(),
      };
    }

    // Update based on interaction outcome
    if (interaction.outcome.action === 'accepted') {
      profile.learningHistory.acceptedSuggestions++;
    } else if (interaction.outcome.action === 'rejected') {
      profile.learningHistory.rejectedSuggestions++;
    }

    // Update preferences based on context
    if (interaction.context.codeContext?.language) {
      const lang = interaction.context.codeContext.language;
      if (!profile.preferences.preferredLanguages.includes(lang)) {
        profile.preferences.preferredLanguages.push(lang);
      }
    }

    profile.lastUpdated = new Date();
    this.userProfiles.set(userId, profile);
  }

  /**
   * Analyze concept accuracy trends
   */
  private analyzeConceptAccuracy(interactions: UserInteraction[]): LearningInsight | null {
    const conceptFeedback = interactions.filter(i => i.type === 'concept_feedback');
    if (conceptFeedback.length < 3) return null;

    const accuracyRate =
      conceptFeedback.filter(i => i.outcome.action === 'accepted').length / conceptFeedback.length;

    return {
      type: 'concept_accuracy_trend',
      description: `Concept detection accuracy is ${(accuracyRate * 100).toFixed(1)}%`,
      confidence: 0.7,
      impact: accuracyRate < 0.7 ? 'high' : 'medium',
      actionable: accuracyRate < 0.8,
      recommendations:
        accuracyRate < 0.8
          ? [
              'Improve concept detection algorithms',
              'Gather more training data for underperforming concepts',
            ]
          : [],
      evidence: {
        interactionCount: conceptFeedback.length,
        timeframe: 'recent_sessions',
        patterns: [`${conceptFeedback.length} concept interactions analyzed`],
      },
    };
  }

  /**
   * Analyze search patterns
   */
  private analyzeSearchPatterns(interactions: UserInteraction[]): LearningInsight | null {
    const searchInteractions = interactions.filter(i => i.type === 'search');
    if (searchInteractions.length < 5) return null;

    const avgResultsUsed =
      searchInteractions.map(i => i.context.searchResults?.length || 0).reduce((a, b) => a + b, 0) /
      searchInteractions.length;

    return {
      type: 'search_pattern_evolution',
      description: `User typically engages with ${avgResultsUsed.toFixed(1)} search results`,
      confidence: 0.6,
      impact: 'medium',
      actionable: avgResultsUsed < 2,
      recommendations:
        avgResultsUsed < 2
          ? ['Improve search result relevance', 'Consider showing fewer but higher quality results']
          : [],
      evidence: {
        interactionCount: searchInteractions.length,
        timeframe: 'recent_sessions',
        patterns: [`Average ${avgResultsUsed.toFixed(1)} results used per search`],
      },
    };
  }

  /**
   * Get user profile for personalization
   */
  getUserProfile(userId: string): UserProfile | undefined {
    return this.userProfiles.get(userId);
  }

  /**
   * Get interaction history for analysis
   */
  getInteractionHistory(userId: string): UserInteraction[] {
    return this.interactions.get(userId) || [];
  }
}

// Create and export singleton instance
export const feedbackLearningSystem = new FeedbackLearningSystem();
