/**
 * Integration tests for Feedback Learning System
 * Real integration tests without mocking
 */

import { describe, expect, it } from '@jest/globals';
import { FeedbackLearningSystem } from '../../src/learning/feedback-learning-system.js';
import type { UserInteraction } from '../../src/learning/feedback-learning-system.js';

describe('FeedbackLearningSystem Integration', () => {
  describe('recordInteraction', () => {
    it('should record user search interaction', async () => {
      const learningSystem = new FeedbackLearningSystem();

      const interaction: UserInteraction = {
        id: 'test-1',
        userId: 'user-123',
        sessionId: 'session-1',
        timestamp: new Date(),
        type: 'search',
        context: {
          searchQuery: 'how to implement singleton pattern',
          conceptsInvolved: ['singleton', 'design-pattern'],
          categoriesInvolved: ['patterns'],
          codeContext: {
            language: 'typescript',
          },
        },
        outcome: {
          action: 'accepted',
          satisfaction: 'satisfied',
          implicitSignals: [
            {
              type: 'dwell_time',
              value: 120,
              timestamp: new Date(),
              confidence: 0.9,
            },
          ],
          learningValue: 0.8,
        },
        metadata: {},
      };

      await learningSystem.recordInteraction(interaction);

      const history = learningSystem.getInteractionHistory('user-123');
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        id: 'test-1',
        userId: 'user-123',
        type: 'search',
      });
    });

    it('should build user profile from interactions', async () => {
      const learningSystem = new FeedbackLearningSystem();

      const interactions: UserInteraction[] = [
        {
          id: 'test-1',
          userId: 'user-456',
          sessionId: 'session-1',
          timestamp: new Date(),
          type: 'search',
          context: {
            conceptsInvolved: ['react', 'hooks'],
            categoriesInvolved: ['frontend'],
            codeContext: {
              language: 'javascript',
              framework: 'react',
            },
          },
          outcome: {
            action: 'accepted',
            satisfaction: 'very_satisfied',
            implicitSignals: [],
            learningValue: 0.9,
          },
          metadata: {},
        },
        {
          id: 'test-2',
          userId: 'user-456',
          sessionId: 'session-1',
          timestamp: new Date(),
          type: 'concept_feedback',
          context: {
            conceptsInvolved: ['react', 'typescript'],
            categoriesInvolved: ['frontend'],
            codeContext: {
              language: 'typescript',
              framework: 'react',
            },
          },
          outcome: {
            action: 'accepted',
            satisfaction: 'satisfied',
            implicitSignals: [],
            learningValue: 0.8,
          },
          metadata: {},
        },
      ];

      for (const interaction of interactions) {
        await learningSystem.recordInteraction(interaction);
      }

      const profile = learningSystem.getUserProfile('user-456');
      expect(profile).toBeDefined();
      expect(profile?.preferences.preferredLanguages).toContain('javascript');
      expect(profile?.preferences.preferredLanguages).toContain('typescript');
      expect(profile?.preferences.preferredFrameworks).toContain('react');
    });
  });

  describe('recordSearchFeedback', () => {
    it('should record search feedback', async () => {
      const learningSystem = new FeedbackLearningSystem();

      await learningSystem.recordSearchFeedback({
        userId: 'user-789',
        sessionId: 'session-2',
        query: 'dependency injection pattern',
        results: [],
        selectedIndex: 0,
        wasHelpful: true,
        timeToSelect: 5,
      });

      const history = learningSystem.getInteractionHistory('user-789');
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('search');
      expect(history[0].context.searchQuery).toBe('dependency injection pattern');
    });
  });

  describe('generateLearningInsights', () => {
    it('should generate insights from interaction patterns', async () => {
      const learningSystem = new FeedbackLearningSystem();

      // Create enough interactions to generate insights
      for (let i = 0; i < 10; i++) {
        await learningSystem.recordInteraction({
          id: `test-${i}`,
          userId: 'insights-user',
          sessionId: 'session-3',
          timestamp: new Date(),
          type: 'search',
          context: {
            searchQuery: `query ${i}`,
            conceptsInvolved: ['react'],
            categoriesInvolved: ['frontend'],
          },
          outcome: {
            action: i % 2 === 0 ? 'accepted' : 'rejected',
            satisfaction: 'satisfied',
            implicitSignals: [],
            learningValue: 0.7,
          },
          metadata: {},
        });
      }

      const insights = await learningSystem.generateLearningInsights();

      expect(insights).toBeDefined();
      expect(Array.isArray(insights)).toBe(true);
    });

    it('should detect concept accuracy patterns', async () => {
      const learningSystem = new FeedbackLearningSystem();

      // Record interactions with explicit feedback
      for (let i = 0; i < 5; i++) {
        await learningSystem.recordInteraction({
          id: `concept-${i}`,
          userId: 'concept-user',
          sessionId: 'session-4',
          timestamp: new Date(),
          type: 'concept_feedback',
          context: {
            conceptsInvolved: ['redux', 'state-management'],
            categoriesInvolved: ['architecture'],
          },
          outcome: {
            action: 'accepted',
            satisfaction: 'very_satisfied',
            explicitFeedback: {
              rating: 5,
              correctConcepts: ['redux', 'state-management'],
            },
            implicitSignals: [],
            learningValue: 0.9,
          },
          metadata: {},
        });
      }

      const insights = await learningSystem.generateLearningInsights();

      const conceptInsight = insights.find(i => i.type === 'concept_accuracy');
      expect(conceptInsight).toBeDefined();
    });
  });

  describe('getRecommendations', () => {
    it('should generate recommendations based on user behavior', async () => {
      const learningSystem = new FeedbackLearningSystem();

      // Build user preference pattern
      for (let i = 0; i < 6; i++) {
        await learningSystem.recordInteraction({
          id: `rec-${i}`,
          userId: 'rec-user',
          sessionId: 'session-5',
          timestamp: new Date(),
          type: 'search',
          context: {
            searchQuery: 'testing patterns',
            conceptsInvolved: ['jest', 'testing'],
            categoriesInvolved: ['testing'],
            codeContext: {
              language: 'typescript',
            },
          },
          outcome: {
            action: 'accepted',
            satisfaction: 'satisfied',
            implicitSignals: [],
            learningValue: 0.8,
          },
          metadata: {},
        });
      }

      const recommendations = await learningSystem.getRecommendations();

      expect(recommendations).toBeDefined();
      expect(Array.isArray(recommendations)).toBe(true);
    });
  });

  describe('user profile management', () => {
    it('should track multiple users independently', async () => {
      const learningSystem = new FeedbackLearningSystem();

      await learningSystem.recordInteraction({
        id: 'user1-1',
        userId: 'user-1',
        sessionId: 'session-6',
        timestamp: new Date(),
        type: 'search',
        context: {
          conceptsInvolved: ['vue'],
          categoriesInvolved: ['frontend'],
          codeContext: { language: 'javascript' },
        },
        outcome: {
          action: 'accepted',
          satisfaction: 'satisfied',
          implicitSignals: [],
          learningValue: 0.7,
        },
        metadata: {},
      });

      await learningSystem.recordInteraction({
        id: 'user2-1',
        userId: 'user-2',
        sessionId: 'session-7',
        timestamp: new Date(),
        type: 'search',
        context: {
          conceptsInvolved: ['django'],
          categoriesInvolved: ['backend'],
          codeContext: { language: 'python' },
        },
        outcome: {
          action: 'accepted',
          satisfaction: 'satisfied',
          implicitSignals: [],
          learningValue: 0.7,
        },
        metadata: {},
      });

      const profile1 = learningSystem.getUserProfile('user-1');
      const profile2 = learningSystem.getUserProfile('user-2');

      expect(profile1?.preferences.preferredLanguages).toContain('javascript');
      expect(profile1?.preferences.preferredLanguages).not.toContain('python');

      expect(profile2?.preferences.preferredLanguages).toContain('python');
      expect(profile2?.preferences.preferredLanguages).not.toContain('javascript');
    });

    it('should handle undefined user profile gracefully', () => {
      const learningSystem = new FeedbackLearningSystem();

      const profile = learningSystem.getUserProfile('non-existent-user');
      expect(profile).toBeUndefined();
    });

    it('should return empty array for user with no interactions', () => {
      const learningSystem = new FeedbackLearningSystem();

      const history = learningSystem.getInteractionHistory('no-interactions-user');
      expect(history).toEqual([]);
    });
  });
});
