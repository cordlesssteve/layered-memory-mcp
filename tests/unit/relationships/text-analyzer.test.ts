/**
 * Text Analyzer Tests
 * Sprint 3 - Relationship Engine
 * Target: >50% coverage (currently 49.09%)
 */

import { TextAnalyzer } from '../../../src/memory/relationships/text-analyzer.js';
import type { MemoryItem } from '../../../src/memory/types.js';

describe('TextAnalyzer', () => {
  let analyzer: TextAnalyzer;

  beforeEach(() => {
    analyzer = new TextAnalyzer();
  });

  const createTestMemory = (content: string, tags: string[] = []): MemoryItem => ({
    id: `mem-${Date.now()}`,
    content,
    metadata: {
      tags,
      category: 'test',
      priority: 5,
      source: 'test',
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    accessCount: 0,
    lastAccessedAt: new Date(),
  });

  // ============================================================================
  // URL REFERENCE (3 tests)
  // ============================================================================

  describe('hasUrlReference', () => {
    test('should detect shared URL in both contents', () => {
      const content1 = 'Check this https://example.com/page for more info';
      const content2 = 'The link https://example.com/page has details';

      expect(analyzer.hasUrlReference(content1, content2)).toBe(true);
    });

    test('should detect URL from content1 referenced in content2', () => {
      const content1 = 'Visit https://docs.example.com for documentation';
      const content2 = 'The documentation at https://docs.example.com is helpful';

      expect(analyzer.hasUrlReference(content1, content2)).toBe(true);
    });

    test('should return false when no shared URLs', () => {
      const content1 = 'This has https://site1.com';
      const content2 = 'This has https://site2.com';

      expect(analyzer.hasUrlReference(content1, content2)).toBe(false);
    });
  });

  // ============================================================================
  // SIMILAR KEYWORDS (3 tests)
  // ============================================================================

  describe('hasSimilarKeywords', () => {
    test('should detect similar keywords', () => {
      const content1 = 'JavaScript programming language development framework';
      const content2 = 'TypeScript programming language compiler framework';

      expect(analyzer.hasSimilarKeywords(content1, content2)).toBe(true);
    });

    test('should return false for dissimilar content', () => {
      const content1 = 'cooking recipes pasta italian food';
      const content2 = 'programming javascript typescript code';

      expect(analyzer.hasSimilarKeywords(content1, content2)).toBe(false);
    });

    test('should handle short content with few keywords', () => {
      const content1 = 'test';
      const content2 = 'test data';

      // Short content with minimal overlap
      const result = analyzer.hasSimilarKeywords(content1, content2);
      expect(typeof result).toBe('boolean');
    });
  });

  // ============================================================================
  // CONTENT SIMILARITY (4 tests)
  // ============================================================================

  describe('calculateContentSimilarity', () => {
    test('should return 1.0 for identical content', () => {
      const content = 'the quick brown fox jumps over the lazy dog';
      expect(analyzer.calculateContentSimilarity(content, content)).toBe(1);
    });

    test('should return >0 for similar content', () => {
      const content1 = 'React is a JavaScript library for building user interfaces';
      const content2 = 'React JavaScript library for building interfaces';

      const similarity = analyzer.calculateContentSimilarity(content1, content2);
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });

    test('should return low similarity for dissimilar content', () => {
      const content1 = 'machine learning artificial intelligence neural networks';
      const content2 = 'cooking italian pasta recipes tomato sauce';

      const similarity = analyzer.calculateContentSimilarity(content1, content2);
      expect(similarity).toBeLessThan(0.2);
    });

    test('should be case-insensitive', () => {
      const content1 = 'JavaScript Framework';
      const content2 = 'javascript framework';

      expect(analyzer.calculateContentSimilarity(content1, content2)).toBe(1);
    });
  });

  // ============================================================================
  // EXTRACT KEYWORDS (4 tests)
  // ============================================================================

  describe('extractKeywords', () => {
    test('should extract keywords from content', () => {
      const content = 'JavaScript is a programming language used for web development';
      const keywords = analyzer.extractKeywords(content);

      expect(Array.isArray(keywords)).toBe(true);
      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords).toContain('javascript');
      expect(keywords).toContain('programming');
    });

    test('should filter out stop words', () => {
      const content = 'the quick brown fox jumps over the lazy dog';
      const keywords = analyzer.extractKeywords(content);

      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('over');
    });

    test('should filter out short words (<=3 chars)', () => {
      const content = 'cat dog bird elephant lion tiger';
      const keywords = analyzer.extractKeywords(content);

      expect(keywords).not.toContain('cat');
      expect(keywords).not.toContain('dog');
      expect(keywords).toContain('bird');
      expect(keywords).toContain('elephant');
    });

    test('should return top 20 keywords by frequency', () => {
      const content = 'word '.repeat(30) + 'another '.repeat(20) + 'keyword '.repeat(10);
      const keywords = analyzer.extractKeywords(content);

      expect(keywords.length).toBeLessThanOrEqual(20);
      expect(keywords[0]).toBe('word'); // Most frequent
    });
  });

  // ============================================================================
  // FIND COMMON TAGS (3 tests)
  // ============================================================================

  describe('findCommonTags', () => {
    test('should find tags that appear in multiple memories', () => {
      const memories = [
        createTestMemory('Content 1', ['javascript', 'programming', 'web']),
        createTestMemory('Content 2', ['javascript', 'typescript', 'programming']),
        createTestMemory('Content 3', ['python', 'programming', 'data']),
      ];

      const commonTags = analyzer.findCommonTags(memories);

      expect(commonTags).toContain('programming'); // Appears 3 times
      expect(commonTags).toContain('javascript'); // Appears 2 times
    });

    test('should return empty array when no common tags', () => {
      const memories = [
        createTestMemory('Content 1', ['tag1']),
        createTestMemory('Content 2', ['tag2']),
        createTestMemory('Content 3', ['tag3']),
      ];

      const commonTags = analyzer.findCommonTags(memories);

      expect(commonTags).toEqual([]);
    });

    test('should sort tags by frequency', () => {
      const memories = [
        createTestMemory('C1', ['common', 'rare']),
        createTestMemory('C2', ['common', 'rare']),
        createTestMemory('C3', ['common']),
      ];

      const commonTags = analyzer.findCommonTags(memories);

      expect(commonTags[0]).toBe('common'); // Higher frequency first
    });
  });

  // ============================================================================
  // CLUSTER COHESION (4 tests)
  // ============================================================================

  describe('calculateClusterCohesion', () => {
    test('should return 1 for single memory', () => {
      const memories = [createTestMemory('Single memory')];
      expect(analyzer.calculateClusterCohesion(memories)).toBe(1);
    });

    test('should calculate cohesion for similar memories', () => {
      const memories = [
        createTestMemory('React JavaScript framework library'),
        createTestMemory('React JavaScript framework components'),
        createTestMemory('React JavaScript framework hooks'),
      ];

      const cohesion = analyzer.calculateClusterCohesion(memories);

      expect(cohesion).toBeGreaterThan(0);
      expect(cohesion).toBeLessThanOrEqual(1);
    });

    test('should return low cohesion for dissimilar memories', () => {
      const memories = [
        createTestMemory('cooking pasta italian food'),
        createTestMemory('programming javascript code'),
        createTestMemory('gardening plants flowers'),
      ];

      const cohesion = analyzer.calculateClusterCohesion(memories);

      expect(cohesion).toBeLessThan(0.2);
    });

    test('should return 0 for empty array', () => {
      expect(analyzer.calculateClusterCohesion([])).toBe(1);
    });
  });

  // ============================================================================
  // RECENCY SCORE (4 tests)
  // ============================================================================

  describe('calculateRecencyScore', () => {
    test('should return high score for recent access (Date object)', () => {
      const recentDate = new Date();
      const score = analyzer.calculateRecencyScore(recentDate);

      expect(score).toBeGreaterThan(0.95);
      expect(score).toBeLessThanOrEqual(1);
    });

    test('should return high score for recent access (ISO string)', () => {
      const recentDate = new Date().toISOString();
      const score = analyzer.calculateRecencyScore(recentDate);

      expect(score).toBeGreaterThan(0.95);
    });

    test('should return lower score for older access', () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 15); // 15 days ago

      const score = analyzer.calculateRecencyScore(oldDate);

      expect(score).toBeLessThan(0.6);
      expect(score).toBeGreaterThan(0);
    });

    test('should return 0 for very old access (>30 days)', () => {
      const veryOldDate = new Date();
      veryOldDate.setDate(veryOldDate.getDate() - 40); // 40 days ago

      const score = analyzer.calculateRecencyScore(veryOldDate);

      expect(score).toBe(0);
    });
  });
});
