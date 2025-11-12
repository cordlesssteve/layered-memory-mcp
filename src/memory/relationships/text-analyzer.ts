/**
 * Text analysis utilities for relationship detection
 */

import type { MemoryItem } from '../types.js';

export class TextAnalyzer {
  private readonly stopWords = new Set([
    'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'may', 'might', 'must', 'can', 'shall', 'a', 'an', 'as', 'if', 'when', 'where',
    'why', 'how', 'what', 'who', 'which', 'from', 'up', 'out', 'down', 'off', 'over'
  ]);

  hasUrlReference(content1: string, content2: string): boolean {
    const urlPattern = /https?:\/\/[^\s]+/g;
    const urls1 = content1.match(urlPattern) || [];
    const urls2 = content2.match(urlPattern) || [];

    return urls1.some(url => content2.includes(url)) || urls2.some(url => content1.includes(url));
  }

  hasSimilarKeywords(content1: string, content2: string): boolean {
    const keywords1 = this.extractKeywords(content1);
    const keywords2 = this.extractKeywords(content2);

    const commonKeywords = keywords1.filter(kw => keywords2.includes(kw));
    return commonKeywords.length >= Math.min(3, Math.min(keywords1.length, keywords2.length) / 2);
  }

  calculateContentSimilarity(content1: string, content2: string): number {
    // Simple word-based similarity calculation
    const words1 = new Set(content1.toLowerCase().split(/\s+/));
    const words2 = new Set(content2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  extractKeywords(content: string): string[] {
    // Simple keyword extraction (in production, use more sophisticated NLP)
    const words = content
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !this.isStopWord(word));

    // Count frequency and return top words
    const wordCount = new Map<string, number>();
    words.forEach(word => {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    });

    return Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  }

  findCommonTags(memories: MemoryItem[]): string[] {
    const tagCount = new Map<string, number>();

    memories.forEach(memory => {
      memory.metadata.tags.forEach(tag => {
        tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
      });
    });

    return Array.from(tagCount.entries())
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }

  calculateClusterCohesion(memories: MemoryItem[]): number {
    if (memories.length < 2) return 1;

    let totalSimilarity = 0;
    let pairCount = 0;

    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const memory1 = memories[i];
        const memory2 = memories[j];
        if (memory1 && memory2) {
          totalSimilarity += this.calculateContentSimilarity(memory1.content, memory2.content);
          pairCount++;
        }
      }
    }

    return pairCount > 0 ? totalSimilarity / pairCount : 0;
  }

  calculateRecencyScore(lastAccessedAt: Date | string): number {
    const now = new Date();

    // Handle both Date objects and ISO strings
    const accessTime = lastAccessedAt instanceof Date
      ? lastAccessedAt.getTime()
      : new Date(lastAccessedAt).getTime();

    const daysSinceAccess = (now.getTime() - accessTime) / (1000 * 60 * 60 * 24);
    return Math.max(0, 1 - daysSinceAccess / 30); // Decay over 30 days
  }

  private isStopWord(word: string): boolean {
    return this.stopWords.has(word);
  }
}