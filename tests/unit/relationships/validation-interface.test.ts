/**
 * Validation Interface Tests
 * Sprint 3 - Relationship Engine
 * Target: >35% coverage (currently 24.82%)
 */

import { RelationshipValidationInterface } from '../../../src/memory/relationships/validation-interface.js';
import type { MemoryRelationship } from '../../../src/memory/relationships/types.js';

describe('RelationshipValidationInterface', () => {
  let validator: RelationshipValidationInterface;

  beforeEach(() => {
    validator = new RelationshipValidationInterface();
  });

  // Helper function to create a test relationship
  const createTestRelationship = (overrides?: Partial<MemoryRelationship>): MemoryRelationship => ({
    id: `rel-${Date.now()}-${Math.random()}`,
    sourceMemoryId: 'source-1',
    targetMemoryId: 'target-1',
    type: 'reference',
    confidence: 0.8,
    weight: 0.7,
    metadata: {
      source: 'auto-detected' as const,
      algorithm: 'semantic-similarity',
      createdAt: new Date(),
    },
    ...overrides,
  });

  // ============================================================================
  // CREATE SUGGESTION (4 tests)
  // ============================================================================

  describe('createSuggestion', () => {
    test('should create a relationship suggestion', () => {
      const relationship = createTestRelationship();
      const suggestion = validator.createSuggestion(
        relationship,
        'Source content',
        'Target content'
      );

      expect(suggestion).toBeDefined();
      expect(suggestion.id).toContain('suggestion-');
      expect(suggestion.relationship).toBe(relationship);
      expect(suggestion.sourceMemoryContent).toBe('Source content');
      expect(suggestion.targetMemoryContent).toBe('Target content');
      expect(suggestion.status).toBe('pending');
      expect(suggestion.confidence).toBe(0.8);
      expect(suggestion.algorithm).toBe('semantic-similarity');
    });

    test('should handle unknown algorithm in metadata', () => {
      const relationship = createTestRelationship({
        metadata: {
          source: 'auto-detected',
          algorithm: '',
          createdAt: new Date(),
        } as any,
      });

      const suggestion = validator.createSuggestion(relationship, 'A', 'B');
      expect(suggestion.algorithm).toBe('unknown');
    });

    test('should create multiple unique suggestions', () => {
      const rel1 = createTestRelationship({ id: 'rel-1' });
      const rel2 = createTestRelationship({ id: 'rel-2' });

      const suggestion1 = validator.createSuggestion(rel1, 'Content 1', 'Content 2');
      const suggestion2 = validator.createSuggestion(rel2, 'Content 3', 'Content 4');

      expect(suggestion1.id).not.toBe(suggestion2.id);
      expect(suggestion1.relationship.id).toBe('rel-1');
      expect(suggestion2.relationship.id).toBe('rel-2');
    });

    test('should set suggestedAt timestamp', () => {
      const relationship = createTestRelationship();
      const before = new Date();
      const suggestion = validator.createSuggestion(relationship, 'A', 'B');
      const after = new Date();

      expect(suggestion.suggestedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(suggestion.suggestedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // ============================================================================
  // GET PENDING SUGGESTIONS (4 tests)
  // ============================================================================

  describe('getPendingSuggestions', () => {
    test('should return pending suggestions sorted by confidence', () => {
      const rel1 = createTestRelationship({ id: 'rel-1', confidence: 0.6 });
      const rel2 = createTestRelationship({ id: 'rel-2', confidence: 0.9 });
      const rel3 = createTestRelationship({ id: 'rel-3', confidence: 0.7 });

      validator.createSuggestion(rel1, 'A', 'B');
      validator.createSuggestion(rel2, 'C', 'D');
      validator.createSuggestion(rel3, 'E', 'F');

      const pending = validator.getPendingSuggestions();

      expect(pending.length).toBe(3);
      expect(pending[0]!.confidence).toBe(0.9); // Highest first
      expect(pending[1]!.confidence).toBe(0.7);
      expect(pending[2]!.confidence).toBe(0.6);
    });

    test('should respect limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        const rel = createTestRelationship({ id: `rel-${i}` });
        validator.createSuggestion(rel, `Content ${i}`, `Target ${i}`);
      }

      const pending = validator.getPendingSuggestions(2);
      expect(pending.length).toBe(2);
    });

    test('should return empty array when no pending suggestions', () => {
      const pending = validator.getPendingSuggestions();
      expect(pending).toEqual([]);
    });

    test('should use default limit of 10', () => {
      for (let i = 0; i < 15; i++) {
        const rel = createTestRelationship({ id: `rel-${i}` });
        validator.createSuggestion(rel, `Content ${i}`, `Target ${i}`);
      }

      const pending = validator.getPendingSuggestions();
      expect(pending.length).toBe(10);
    });
  });

  // ============================================================================
  // GET SUGGESTIONS BY CONFIDENCE (4 tests)
  // ============================================================================

  describe('getSuggestionsByConfidence', () => {
    test('should filter suggestions by confidence range', () => {
      const rel1 = createTestRelationship({ id: 'rel-1', confidence: 0.5 });
      const rel2 = createTestRelationship({ id: 'rel-2', confidence: 0.75 });
      const rel3 = createTestRelationship({ id: 'rel-3', confidence: 0.9 });

      validator.createSuggestion(rel1, 'A', 'B');
      validator.createSuggestion(rel2, 'C', 'D');
      validator.createSuggestion(rel3, 'E', 'F');

      const filtered = validator.getSuggestionsByConfidence(0.7, 1.0);

      expect(filtered.length).toBe(2);
      expect(filtered[0]!.confidence).toBe(0.9);
      expect(filtered[1]!.confidence).toBe(0.75);
    });

    test('should use default confidence range (0.7 to 1.0)', () => {
      const rel1 = createTestRelationship({ id: 'rel-1', confidence: 0.6 });
      const rel2 = createTestRelationship({ id: 'rel-2', confidence: 0.8 });

      validator.createSuggestion(rel1, 'A', 'B');
      validator.createSuggestion(rel2, 'C', 'D');

      const filtered = validator.getSuggestionsByConfidence();

      expect(filtered.length).toBe(1);
      expect(filtered[0]!.confidence).toBe(0.8);
    });

    test('should return empty array when no matches', () => {
      const rel = createTestRelationship({ confidence: 0.5 });
      validator.createSuggestion(rel, 'A', 'B');

      const filtered = validator.getSuggestionsByConfidence(0.8, 1.0);
      expect(filtered).toEqual([]);
    });

    test('should sort results by confidence (descending)', () => {
      const rel1 = createTestRelationship({ id: 'rel-1', confidence: 0.75 });
      const rel2 = createTestRelationship({ id: 'rel-2', confidence: 0.85 });
      const rel3 = createTestRelationship({ id: 'rel-3', confidence: 0.95 });

      validator.createSuggestion(rel1, 'A', 'B');
      validator.createSuggestion(rel2, 'C', 'D');
      validator.createSuggestion(rel3, 'E', 'F');

      const filtered = validator.getSuggestionsByConfidence(0.7, 1.0);

      expect(filtered[0]!.confidence).toBeGreaterThanOrEqual(filtered[1]!.confidence);
      expect(filtered[1]!.confidence).toBeGreaterThanOrEqual(filtered[2]!.confidence);
    });
  });

  // ============================================================================
  // CONFIRM SUGGESTION (5 tests)
  // ============================================================================

  describe('confirmSuggestion', () => {
    test('should confirm a suggestion', () => {
      const rel = createTestRelationship();
      const suggestion = validator.createSuggestion(rel, 'A', 'B');

      const result = validator.confirmSuggestion(suggestion.id);

      expect(result).toBe(true);
      expect(validator.getPendingSuggestions()).toEqual([]);
      expect(validator.getValidationHistory().length).toBe(1);
      expect(validator.getValidationHistory()[0]!.status).toBe('confirmed');
    });

    test('should accept optional user feedback', () => {
      const rel = createTestRelationship();
      const suggestion = validator.createSuggestion(rel, 'A', 'B');

      validator.confirmSuggestion(suggestion.id, 'Great match!');

      const history = validator.getValidationHistory();
      expect(history[0]!.userFeedback).toBe('Great match!');
    });

    test('should return false for non-existent suggestion', () => {
      const result = validator.confirmSuggestion('non-existent-id');
      expect(result).toBe(false);
    });

    test('should move suggestion from pending to history', () => {
      const rel = createTestRelationship();
      const suggestion = validator.createSuggestion(rel, 'A', 'B');

      expect(validator.getPendingSuggestions().length).toBe(1);
      expect(validator.getValidationHistory().length).toBe(0);

      validator.confirmSuggestion(suggestion.id);

      expect(validator.getPendingSuggestions().length).toBe(0);
      expect(validator.getValidationHistory().length).toBe(1);
    });

    test('should handle empty feedback string', () => {
      const rel = createTestRelationship();
      const suggestion = validator.createSuggestion(rel, 'A', 'B');

      validator.confirmSuggestion(suggestion.id, '');

      const history = validator.getValidationHistory();
      expect(history[0]!.userFeedback).toBe('');
    });
  });

  // ============================================================================
  // REJECT SUGGESTION (4 tests)
  // ============================================================================

  describe('rejectSuggestion', () => {
    test('should reject a suggestion', () => {
      const rel = createTestRelationship();
      const suggestion = validator.createSuggestion(rel, 'A', 'B');

      const result = validator.rejectSuggestion(suggestion.id);

      expect(result).toBe(true);
      expect(validator.getValidationHistory()[0]!.status).toBe('rejected');
    });

    test('should accept optional user feedback', () => {
      const rel = createTestRelationship();
      const suggestion = validator.createSuggestion(rel, 'A', 'B');

      validator.rejectSuggestion(suggestion.id, 'Not related');

      const history = validator.getValidationHistory();
      expect(history[0]!.userFeedback).toBe('Not related');
    });

    test('should return false for non-existent suggestion', () => {
      const result = validator.rejectSuggestion('non-existent-id');
      expect(result).toBe(false);
    });

    test('should move suggestion to history', () => {
      const rel = createTestRelationship();
      const suggestion = validator.createSuggestion(rel, 'A', 'B');

      validator.rejectSuggestion(suggestion.id);

      expect(validator.getPendingSuggestions().length).toBe(0);
      expect(validator.getValidationHistory().length).toBe(1);
    });
  });

  // ============================================================================
  // MODIFY SUGGESTION (6 tests)
  // ============================================================================

  describe('modifySuggestion', () => {
    test('should modify relationship type', () => {
      const rel = createTestRelationship({ type: 'reference' });
      const suggestion = validator.createSuggestion(rel, 'A', 'B');

      const result = validator.modifySuggestion(suggestion.id, 'causal');

      expect(result).toBe(true);
      const history = validator.getValidationHistory();
      expect(history[0]!.status).toBe('modified');
      expect(history[0]!.modifiedType).toBe('causal');
    });

    test('should modify confidence', () => {
      const rel = createTestRelationship({ confidence: 0.8 });
      const suggestion = validator.createSuggestion(rel, 'A', 'B');

      validator.modifySuggestion(suggestion.id, undefined, 0.6);

      const history = validator.getValidationHistory();
      expect(history[0]!.modifiedConfidence).toBe(0.6);
    });

    test('should modify both type and confidence', () => {
      const rel = createTestRelationship();
      const suggestion = validator.createSuggestion(rel, 'A', 'B');

      validator.modifySuggestion(suggestion.id, 'temporal', 0.9, 'Better match');

      const history = validator.getValidationHistory();
      expect(history[0]!.modifiedType).toBe('temporal');
      expect(history[0]!.modifiedConfidence).toBe(0.9);
      expect(history[0]!.userFeedback).toBe('Better match');
    });

    test('should return false for non-existent suggestion', () => {
      const result = validator.modifySuggestion('non-existent-id', 'causal');
      expect(result).toBe(false);
    });

    test('should move suggestion to history', () => {
      const rel = createTestRelationship();
      const suggestion = validator.createSuggestion(rel, 'A', 'B');

      validator.modifySuggestion(suggestion.id, 'contextual');

      expect(validator.getPendingSuggestions().length).toBe(0);
      expect(validator.getValidationHistory().length).toBe(1);
    });

    test('should handle modification with only feedback', () => {
      const rel = createTestRelationship();
      const suggestion = validator.createSuggestion(rel, 'A', 'B');

      validator.modifySuggestion(suggestion.id, undefined, undefined, 'Just a note');

      const history = validator.getValidationHistory();
      expect(history[0]!.status).toBe('modified');
      expect(history[0]!.userFeedback).toBe('Just a note');
    });
  });

  // ============================================================================
  // BATCH VALIDATE (4 tests)
  // ============================================================================

  describe('batchValidate', () => {
    test('should batch confirm multiple suggestions', () => {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const rel = createTestRelationship({ id: `rel-${i}` });
        const suggestion = validator.createSuggestion(rel, `A${i}`, `B${i}`);
        ids.push(suggestion.id);
      }

      const result = validator.batchValidate(ids, 'confirm');

      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      expect(validator.getValidationHistory().length).toBe(3);
    });

    test('should batch reject multiple suggestions', () => {
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        const rel = createTestRelationship({ id: `rel-${i}` });
        const suggestion = validator.createSuggestion(rel, `A${i}`, `B${i}`);
        ids.push(suggestion.id);
      }

      const result = validator.batchValidate(ids, 'reject', 'Bulk reject');

      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      const history = validator.getValidationHistory();
      expect(history.every((s) => s.status === 'rejected')).toBe(true);
      expect(history.every((s) => s.userFeedback === 'Bulk reject')).toBe(true);
    });

    test('should handle mix of valid and invalid IDs', () => {
      const rel = createTestRelationship();
      const suggestion = validator.createSuggestion(rel, 'A', 'B');

      const result = validator.batchValidate(
        [suggestion.id, 'invalid-id-1', 'invalid-id-2'],
        'confirm'
      );

      expect(result.successful).toBe(1);
      expect(result.failed).toBe(2);
    });

    test('should handle empty array', () => {
      const result = validator.batchValidate([], 'confirm');

      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  // ============================================================================
  // GET VALIDATION STATS (6 tests)
  // ============================================================================

  describe('getValidationStats', () => {
    test('should return stats for empty validator', () => {
      const stats = validator.getValidationStats();

      expect(stats.totalSuggestions).toBe(0);
      expect(stats.pendingSuggestions).toBe(0);
      expect(stats.confirmedSuggestions).toBe(0);
      expect(stats.rejectedSuggestions).toBe(0);
      expect(stats.modifiedSuggestions).toBe(0);
      expect(stats.averageConfidenceApproved).toBe(0);
    });

    test('should count suggestions by status', () => {
      const rel1 = createTestRelationship({ id: 'rel-1' });
      const rel2 = createTestRelationship({ id: 'rel-2' });
      const rel3 = createTestRelationship({ id: 'rel-3' });
      const rel4 = createTestRelationship({ id: 'rel-4' });

      const s1 = validator.createSuggestion(rel1, 'A', 'B');
      const s2 = validator.createSuggestion(rel2, 'C', 'D');
      const s3 = validator.createSuggestion(rel3, 'E', 'F');
      validator.createSuggestion(rel4, 'G', 'H'); // s4 remains pending

      validator.confirmSuggestion(s1.id);
      validator.rejectSuggestion(s2.id);
      validator.modifySuggestion(s3.id, 'causal');

      const stats = validator.getValidationStats();

      expect(stats.totalSuggestions).toBe(4);
      expect(stats.pendingSuggestions).toBe(1);
      expect(stats.confirmedSuggestions).toBe(1);
      expect(stats.rejectedSuggestions).toBe(1);
      expect(stats.modifiedSuggestions).toBe(1);
    });

    test('should calculate average confidence of approved suggestions', () => {
      const rel1 = createTestRelationship({ confidence: 0.8 });
      const rel2 = createTestRelationship({ confidence: 0.6 });
      const rel3 = createTestRelationship({ confidence: 0.9 });

      const s1 = validator.createSuggestion(rel1, 'A', 'B');
      const s2 = validator.createSuggestion(rel2, 'C', 'D');
      const s3 = validator.createSuggestion(rel3, 'E', 'F');

      validator.confirmSuggestion(s1.id); // 0.8
      validator.modifySuggestion(s2.id, 'temporal'); // 0.6
      validator.rejectSuggestion(s3.id); // Not counted

      const stats = validator.getValidationStats();

      expect(stats.averageConfidenceApproved).toBe(0.7); // (0.8 + 0.6) / 2
    });

    test('should calculate algorithm accuracy', () => {
      const rel1 = createTestRelationship({
        metadata: { source: 'auto-detected', algorithm: 'algo-A', createdAt: new Date() },
      });
      const rel2 = createTestRelationship({
        metadata: { source: 'auto-detected', algorithm: 'algo-A', createdAt: new Date() },
      });
      const rel3 = createTestRelationship({
        metadata: { source: 'auto-detected', algorithm: 'algo-B', createdAt: new Date() },
      });

      const s1 = validator.createSuggestion(rel1, 'A', 'B');
      const s2 = validator.createSuggestion(rel2, 'C', 'D');
      const s3 = validator.createSuggestion(rel3, 'E', 'F');

      validator.confirmSuggestion(s1.id); // algo-A: 1/2 = 0.5
      validator.rejectSuggestion(s2.id);
      validator.confirmSuggestion(s3.id); // algo-B: 1/1 = 1.0

      const stats = validator.getValidationStats();

      expect(stats.algorithmAccuracy['algo-A']).toBe(0.5);
      expect(stats.algorithmAccuracy['algo-B']).toBe(1.0);
    });

    test('should not include pending suggestions in algorithm accuracy', () => {
      const rel1 = createTestRelationship({
        metadata: { source: 'auto-detected', algorithm: 'test-algo', createdAt: new Date() },
      });
      const rel2 = createTestRelationship({
        metadata: { source: 'auto-detected', algorithm: 'test-algo', createdAt: new Date() },
      });

      const s1 = validator.createSuggestion(rel1, 'A', 'B');
      validator.createSuggestion(rel2, 'C', 'D'); // Pending - not counted

      validator.confirmSuggestion(s1.id);

      const stats = validator.getValidationStats();

      expect(stats.algorithmAccuracy['test-algo']).toBe(1.0); // Only validated one counts
    });

    test('should handle zero validated suggestions for algorithm', () => {
      const rel = createTestRelationship();
      validator.createSuggestion(rel, 'A', 'B'); // Pending only

      const stats = validator.getValidationStats();

      expect(stats.algorithmAccuracy).toEqual({});
    });
  });

  // ============================================================================
  // GET ALGORITHM INSIGHTS (5 tests)
  // ============================================================================

  describe('getAlgorithmInsights', () => {
    test('should identify high performing algorithms (>=0.8 accuracy)', () => {
      const createAndValidate = (algorithm: string, confirm: number, reject: number) => {
        for (let i = 0; i < confirm; i++) {
          const rel = createTestRelationship({
            id: `${algorithm}-confirm-${i}`,
            metadata: { source: 'auto-detected', algorithm, createdAt: new Date() },
          });
          const s = validator.createSuggestion(rel, 'A', 'B');
          validator.confirmSuggestion(s.id);
        }
        for (let i = 0; i < reject; i++) {
          const rel = createTestRelationship({
            id: `${algorithm}-reject-${i}`,
            metadata: { source: 'auto-detected', algorithm, createdAt: new Date() },
          });
          const s = validator.createSuggestion(rel, 'A', 'B');
          validator.rejectSuggestion(s.id);
        }
      };

      createAndValidate('algo-A', 8, 2); // 0.8 accuracy (exact)
      createAndValidate('algo-B', 9, 1); // 0.9 accuracy (high)

      const insights = validator.getAlgorithmInsights();

      expect(insights.highPerformingAlgorithms).toContain('algo-A');
      expect(insights.highPerformingAlgorithms).toContain('algo-B');
    });

    test('should identify low performing algorithms (<0.5 accuracy)', () => {
      const rel1 = createTestRelationship({
        metadata: { source: 'auto-detected', algorithm: 'bad-algo', createdAt: new Date() },
      });
      const rel2 = createTestRelationship({
        metadata: { source: 'auto-detected', algorithm: 'bad-algo', createdAt: new Date() },
      });
      const rel3 = createTestRelationship({
        metadata: { source: 'auto-detected', algorithm: 'bad-algo', createdAt: new Date() },
      });

      const s1 = validator.createSuggestion(rel1, 'A', 'B');
      const s2 = validator.createSuggestion(rel2, 'C', 'D');
      const s3 = validator.createSuggestion(rel3, 'E', 'F');

      validator.confirmSuggestion(s1.id);
      validator.rejectSuggestion(s2.id);
      validator.rejectSuggestion(s3.id);

      // bad-algo: 1/3 = 0.33 accuracy

      const insights = validator.getAlgorithmInsights();

      expect(insights.lowPerformingAlgorithms).toContain('bad-algo');
    });

    test('should calculate optimal confidence threshold', () => {
      // Create confirmed suggestions with higher confidence
      for (let i = 0; i < 3; i++) {
        const rel = createTestRelationship({ id: `conf-${i}`, confidence: 0.85 });
        const s = validator.createSuggestion(rel, 'A', 'B');
        validator.confirmSuggestion(s.id);
      }

      // Create rejected suggestions with lower confidence
      for (let i = 0; i < 3; i++) {
        const rel = createTestRelationship({ id: `rej-${i}`, confidence: 0.55 });
        const s = validator.createSuggestion(rel, 'C', 'D');
        validator.rejectSuggestion(s.id);
      }

      const insights = validator.getAlgorithmInsights();

      // Optimal threshold should be between avg confirmed (0.85) and avg rejected (0.55)
      expect(insights.optimalConfidenceThreshold).toBe(0.7); // (0.85 + 0.55) / 2
    });

    test('should use default threshold when no validated suggestions', () => {
      const insights = validator.getAlgorithmInsights();

      expect(insights.optimalConfidenceThreshold).toBe(0.7);
    });

    test('should identify preferred and rejected relationship types', () => {
      const rel1 = createTestRelationship({ type: 'reference' });
      const rel2 = createTestRelationship({ type: 'reference' });
      const rel3 = createTestRelationship({ type: 'causal' });
      const rel4 = createTestRelationship({ type: 'causal' });

      const s1 = validator.createSuggestion(rel1, 'A', 'B');
      const s2 = validator.createSuggestion(rel2, 'C', 'D');
      const s3 = validator.createSuggestion(rel3, 'E', 'F');
      const s4 = validator.createSuggestion(rel4, 'G', 'H');

      validator.confirmSuggestion(s1.id);
      validator.confirmSuggestion(s2.id); // reference: 2 confirmed, 0 rejected
      validator.rejectSuggestion(s3.id);
      validator.rejectSuggestion(s4.id); // causal: 0 confirmed, 2 rejected

      const insights = validator.getAlgorithmInsights();

      expect(insights.userPreferences.preferredRelationshipTypes).toContain('reference');
      expect(insights.userPreferences.rejectedRelationshipTypes).toContain('causal');
    });
  });

  // ============================================================================
  // CLEANUP (4 tests)
  // ============================================================================

  describe('cleanup', () => {
    test('should remove old pending suggestions', () => {
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
      const rel = createTestRelationship();
      const suggestion = validator.createSuggestion(rel, 'A', 'B');
      (suggestion as any).suggestedAt = oldDate; // Manually set old date

      validator.cleanup(30); // Remove suggestions older than 30 days

      expect(validator.getPendingSuggestions().length).toBe(0);
    });

    test('should remove old validation history', () => {
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      const rel = createTestRelationship();
      const suggestion = validator.createSuggestion(rel, 'A', 'B');
      (suggestion as any).suggestedAt = oldDate;

      validator.confirmSuggestion(suggestion.id);
      validator.cleanup(30);

      expect(validator.getValidationHistory().length).toBe(0);
    });

    test('should keep recent suggestions', () => {
      const rel = createTestRelationship();
      validator.createSuggestion(rel, 'A', 'B');

      validator.cleanup(30);

      expect(validator.getPendingSuggestions().length).toBe(1);
    });

    test('should use default 30 days if not specified', () => {
      const rel = createTestRelationship();
      validator.createSuggestion(rel, 'A', 'B');

      validator.cleanup();

      expect(validator.getPendingSuggestions().length).toBe(1);
    });
  });

  // ============================================================================
  // GET ALL METHODS (3 tests)
  // ============================================================================

  describe('getAllPendingSuggestions / getValidationHistory / getAllSuggestions', () => {
    test('should get all pending suggestions without limit', () => {
      for (let i = 0; i < 15; i++) {
        const rel = createTestRelationship({ id: `rel-${i}` });
        validator.createSuggestion(rel, `A${i}`, `B${i}`);
      }

      const all = validator.getAllPendingSuggestions();
      expect(all.length).toBe(15);
    });

    test('should get validation history', () => {
      const rel1 = createTestRelationship();
      const rel2 = createTestRelationship();

      const s1 = validator.createSuggestion(rel1, 'A', 'B');
      const s2 = validator.createSuggestion(rel2, 'C', 'D');

      validator.confirmSuggestion(s1.id);
      validator.rejectSuggestion(s2.id);

      const history = validator.getValidationHistory();
      expect(history.length).toBe(2);
    });

    test('should get all suggestions (pending + history)', () => {
      const rel1 = createTestRelationship();
      const rel2 = createTestRelationship();
      const rel3 = createTestRelationship();

      const s1 = validator.createSuggestion(rel1, 'A', 'B');
      validator.createSuggestion(rel2, 'C', 'D'); // Pending
      const s3 = validator.createSuggestion(rel3, 'E', 'F');

      validator.confirmSuggestion(s1.id);
      validator.rejectSuggestion(s3.id);

      const all = validator.getAllSuggestions();
      expect(all.length).toBe(3);
    });
  });
});
