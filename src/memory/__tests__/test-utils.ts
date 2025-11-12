/**
 * Test utilities for memory system testing
 */

import type { MemoryItem, MemoryMetadata } from '../types.js';

export function createMockMemoryItem(overrides: Partial<MemoryItem> = {}): MemoryItem {
  const now = new Date();

  return {
    id: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    content: 'Test memory content',
    metadata: createMockMetadata(),
    createdAt: now,
    updatedAt: now,
    accessCount: 0,
    lastAccessedAt: now,
    ...overrides,
  };
}

export function createMockMetadata(overrides: Partial<MemoryMetadata> = {}): MemoryMetadata {
  return {
    tags: ['test'],
    category: 'knowledge',
    priority: 5,
    source: 'test',
    ...overrides,
  };
}

export function createTestMemoryItems(count: number, baseContent = 'Test content'): MemoryItem[] {
  return Array.from({ length: count }, (_, i) =>
    createMockMemoryItem({
      content: `${baseContent} ${i + 1}`,
      metadata: createMockMetadata({
        tags: [`tag-${i % 3}`],
        category: i % 2 === 0 ? 'knowledge' : 'task',
        priority: (i % 10) + 1,
      }),
    })
  );
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createTemporaryDirectory(): string {
  const path = `/tmp/claude/memory-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  // Create the directory synchronously
  const fs = require('fs');
  fs.mkdirSync(path, { recursive: true });
  return path;
}

export class MemoryTestHelper {
  static async waitForCondition(
    condition: () => boolean | Promise<boolean>,
    timeout = 5000,
    interval = 100
  ): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      if (await condition()) {
        return;
      }
      await delay(interval);
    }

    throw new Error(`Condition not met within ${timeout}ms`);
  }

  static assertMemoryItemsEqual(actual: MemoryItem, expected: Partial<MemoryItem>): void {
    expect(actual.id).toBeDefined();
    expect(actual.content).toBe(expected.content || actual.content);
    expect(actual.metadata).toMatchObject(expected.metadata || {});
    expect(actual.createdAt).toBeInstanceOf(Date);
    expect(actual.updatedAt).toBeInstanceOf(Date);
    expect(actual.lastAccessedAt).toBeInstanceOf(Date);
    expect(typeof actual.accessCount).toBe('number');
  }

  static assertValidMemoryStats(stats: any): void {
    expect(stats).toMatchObject({
      totalItems: expect.any(Number),
      totalSize: expect.any(Number),
      averageAccessCount: expect.any(Number),
      categoryCounts: expect.any(Object),
      tagCounts: expect.any(Object),
    });

    expect(stats.totalItems).toBeGreaterThanOrEqual(0);
    expect(stats.totalSize).toBeGreaterThanOrEqual(0);
    expect(stats.averageAccessCount).toBeGreaterThanOrEqual(0);
  }
}

// Add Jest custom matchers
declare global {
  namespace _jest {
    interface _Matchers<R> {
      toBeValidMemoryItem(): R;
      toBeValidMemoryResult(): R;
    }
  }
}

// Custom Jest matchers
beforeAll(() => {
  expect.extend({
    toBeValidMemoryItem(received: any) {
      const pass = (
        received &&
        typeof received.id === 'string' &&
        typeof received.content === 'string' &&
        typeof received.metadata === 'object' &&
        received.createdAt instanceof Date &&
        received.updatedAt instanceof Date &&
        received.lastAccessedAt instanceof Date &&
        typeof received.accessCount === 'number'
      );

      if (pass) {
        return {
          message: () => `expected ${received} not to be a valid memory item`,
          pass: true,
        };
      } else {
        return {
          message: () => `expected ${received} to be a valid memory item`,
          pass: false,
        };
      }
    },

    toBeValidMemoryResult(received: any) {
      const pass = (
        received &&
        received.memory &&
        typeof received.score === 'number' &&
        received.score >= 0 &&
        received.score <= 1 &&
        typeof received.source === 'string'
      );

      if (pass) {
        return {
          message: () => `expected ${received} not to be a valid memory result`,
          pass: true,
        };
      } else {
        return {
          message: () => `expected ${received} to be a valid memory result`,
          pass: false,
        };
      }
    },
  });
});

export const MOCK_MEMORY_CONTENTS = [
  'User wants to implement a new feature for the dashboard',
  'Bug found in the authentication system - users cannot log in with special characters in password',
  'Meeting notes: Discussed the new API design and decided to use GraphQL',
  'Code review feedback: Need to add more error handling in the payment processing module',
  'Performance optimization: Database queries taking too long, need to add indexing',
  'Security concern: API endpoints are not properly validating input parameters',
  'Feature request: Users want dark mode for the application',
  'Documentation update: API documentation is outdated and needs revision',
  'Testing strategy: Need to implement end-to-end tests for critical user flows',
  'Deployment issue: Production server is running out of disk space',
];

export const MOCK_CATEGORIES = [
  'task',
  'bug',
  'meeting',
  'review',
  'performance',
  'security',
  'feature',
  'documentation',
  'testing',
  'deployment',
];

export const MOCK_TAGS = [
  'urgent',
  'backend',
  'frontend',
  'api',
  'database',
  'ui',
  'ux',
  'security',
  'performance',
  'documentation',
];

export function createRealisticMemoryItems(count: number): MemoryItem[] {
  return Array.from({ length: count }, (_, i) => {
    const contentIndex = i % MOCK_MEMORY_CONTENTS.length;
    const categoryIndex = i % MOCK_CATEGORIES.length;
    const numTags = Math.floor(Math.random() * 3) + 1;
    const tags = Array.from(
      { length: numTags },
      () => MOCK_TAGS[Math.floor(Math.random() * MOCK_TAGS.length)]!
    );

    return createMockMemoryItem({
      content: MOCK_MEMORY_CONTENTS[contentIndex]!,
      metadata: createMockMetadata({
        category: MOCK_CATEGORIES[categoryIndex]!,
        tags: [...new Set(tags)], // Remove duplicates
        priority: Math.floor(Math.random() * 10) + 1,
        source: i % 4 === 0 ? 'user-input' : 'system',
        projectId: `project-${Math.floor(i / 5) + 1}`,
        sessionId: `session-${Math.floor(i / 10) + 1}`,
      }),
    });
  });
}