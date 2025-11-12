/**
 * Tests for Session Layer functionality
 */

import { SessionLayer } from '../layers/session-layer.js';
import { createMockMetadata, delay } from './test-utils.js';

describe('SessionLayer', () => {
  let sessionLayer: SessionLayer;

  beforeEach(() => {
    sessionLayer = new SessionLayer({
      maxItems: 20,
      maxSizeBytes: 512 * 1024, // 512KB
      ttl: 1000, // 1 second for testing
      compressionEnabled: false,
      indexingEnabled: true,
    });
  });

  afterEach(async () => {
    // Clean up
    await sessionLayer.clear();
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultLayer = new SessionLayer();
      expect(defaultLayer.layer).toBe('session');
      expect(defaultLayer.config.maxItems).toBe(50);
      expect(defaultLayer.config.maxSizeBytes).toBe(1024 * 1024);
    });

    it('should initialize with custom configuration', () => {
      expect(sessionLayer.layer).toBe('session');
      expect(sessionLayer.config.maxItems).toBe(20);
      expect(sessionLayer.config.maxSizeBytes).toBe(512 * 1024);
    });
  });

  describe('Session-Specific Operations', () => {
    it('should clear all session data', async () => {
      // Add some items
      for (let i = 0; i < 3; i++) {
        await sessionLayer.store({
          content: `Session content ${i}`,
          metadata: createMockMetadata(),
        });
      }

      let stats = await sessionLayer.getStats();
      expect(stats.totalItems).toBe(3);

      await sessionLayer.clear();

      stats = await sessionLayer.getStats();
      expect(stats.totalItems).toBe(0);
    });

    it('should track session activity', async () => {
      const initialStats = await sessionLayer.getSessionStats();
      expect(initialStats.recentActivity.stores).toBe(0);
      expect(initialStats.recentActivity.searches).toBe(0);
      expect(initialStats.recentActivity.retrievals).toBe(0);

      // Perform operations
      const stored = await sessionLayer.store({
        content: 'Test content',
        metadata: createMockMetadata(),
      });

      await sessionLayer.search({ query: 'test' });
      await sessionLayer.retrieve(stored.id);

      const updatedStats = await sessionLayer.getSessionStats();
      expect(updatedStats.recentActivity.stores).toBe(1);
      expect(updatedStats.recentActivity.searches).toBe(1);
      expect(updatedStats.recentActivity.retrievals).toBe(1);
    });

    it('should calculate session statistics', async () => {

      // Add items with different priorities and access patterns
      const items = [];
      for (let i = 0; i < 3; i++) {
        const item = await sessionLayer.store({
          content: `Content ${i}`,
          metadata: createMockMetadata({ priority: i + 5 }),
        });
        items.push(item);

        // Access the first item multiple times
        if (i === 0) {
          await sessionLayer.retrieve(item.id);
          await sessionLayer.retrieve(item.id);
          await sessionLayer.retrieve(item.id);
        }
      }

      const stats = await sessionLayer.getSessionStats();

      expect(stats.activeMinutes).toBeGreaterThanOrEqual(0);
      expect(stats.averageItemAge).toBeGreaterThanOrEqual(0);
      expect(stats.mostAccessedItem).toBeDefined();
      expect(stats.mostAccessedItem!.id).toBe(items[0]!.id);
      expect(stats.mostAccessedItem!.accessCount).toBe(3);
    });

    it('should identify promotion candidates', async () => {
      // Add items with different characteristics
      const items = [];

      // High priority item
      items.push(await sessionLayer.store({
        content: 'High priority content',
        metadata: createMockMetadata({ priority: 9 }),
      }));

      // Frequently accessed item
      const frequentItem = await sessionLayer.store({
        content: 'Frequently accessed content',
        metadata: createMockMetadata({ priority: 5 }),
      });
      // Access it multiple times
      for (let i = 0; i < 4; i++) {
        await sessionLayer.retrieve(frequentItem.id);
      }
      items.push(frequentItem);

      // Item tagged for promotion
      items.push(await sessionLayer.store({
        content: 'Tagged for promotion',
        metadata: createMockMetadata({ tags: ['promote', 'important'] }),
      }));

      // Regular item (should not be promoted)
      items.push(await sessionLayer.store({
        content: 'Regular content',
        metadata: createMockMetadata({ priority: 3 }),
      }));

      const candidates = await sessionLayer.getPromotionCandidates();

      expect(candidates.length).toBe(3); // First three items should be candidates
      expect(candidates).toContain(items[0]!.id); // High priority
      expect(candidates).toContain(items[1]!.id); // Frequently accessed
      expect(candidates).toContain(items[2]!.id); // Tagged for promotion
      expect(candidates).not.toContain(items[3]!.id); // Regular item
    });
  });

  describe('TTL and Cleanup', () => {
    it('should automatically clean up expired items', async () => {
      // Store an item
      await sessionLayer.store({
        content: 'Will expire soon',
        metadata: createMockMetadata(),
      });

      let stats = await sessionLayer.getStats();
      expect(stats.totalItems).toBe(1);

      // Wait for TTL to expire
      await delay(1100); // TTL is 1000ms

      // Trigger cleanup
      const cleaned = await sessionLayer.cleanup();
      expect(cleaned).toBe(1);

      stats = await sessionLayer.getStats();
      expect(stats.totalItems).toBe(0);
    });

    it('should not remove items that are not expired', async () => {
      // Use a longer TTL for this test
      const longTtlLayer = new SessionLayer({
        ttl: 60000, // 1 minute
        maxItems: 10,
        maxSizeBytes: 1024 * 1024,
        compressionEnabled: false,
        indexingEnabled: true,
      });

      await longTtlLayer.store({
        content: 'Should not expire',
        metadata: createMockMetadata(),
      });

      const cleaned = await longTtlLayer.cleanup();
      expect(cleaned).toBe(0);

      const stats = await longTtlLayer.getStats();
      expect(stats.totalItems).toBe(1);

      await longTtlLayer.clear();
    });
  });

  describe('Capacity Management', () => {
    it('should enforce item limits', async () => {
      const limitedLayer = new SessionLayer({
        maxItems: 3,
        ttl: undefined,
        compressionEnabled: false,
        indexingEnabled: true,
      });

      // Store more items than the limit
      for (let i = 0; i < 5; i++) {
        await limitedLayer.store({
          content: `Content ${i}`,
          metadata: createMockMetadata(),
        });
      }

      const stats = await limitedLayer.getStats();
      expect(stats.totalItems).toBeLessThanOrEqual(3);

      await limitedLayer.clear();
    });

    it('should remove least recently accessed items when over capacity', async () => {
      const limitedLayer = new SessionLayer({
        maxItems: 2,
        ttl: undefined,
        compressionEnabled: false,
        indexingEnabled: true,
      });

      // Store items and access them in specific order
      const item1 = await limitedLayer.store({
        content: 'First item',
        metadata: createMockMetadata(),
      });

      const item2 = await limitedLayer.store({
        content: 'Second item',
        metadata: createMockMetadata(),
      });

      // Add a small delay to ensure distinct timestamps
      await delay(10);

      // Access first item to make it more recently used
      await limitedLayer.retrieve(item1.id);

      // Add another delay to ensure the access time is clearly different
      await delay(10);

      // Add third item (should evict second item)
      await limitedLayer.store({
        content: 'Third item',
        metadata: createMockMetadata(),
      });

      const stats = await limitedLayer.getStats();
      expect(stats.totalItems).toBe(2);

      // First item should still exist (recently accessed)
      const retrieved1 = await limitedLayer.retrieve(item1.id);
      expect(retrieved1).not.toBeNull();

      // Second item should be evicted
      const retrieved2 = await limitedLayer.retrieve(item2.id);
      expect(retrieved2).toBeNull();

      await limitedLayer.clear();
    });
  });

  describe('Backup and Restore', () => {
    it('should create backup (ephemeral)', async () => {
      const backupId = await sessionLayer.backup();
      expect(typeof backupId).toBe('string');
      expect(backupId).toMatch(/^session-backup-\d+$/);
    });

    it('should not support restore (intentionally)', async () => {
      const backupId = await sessionLayer.backup();
      const restored = await sessionLayer.restore(backupId);
      expect(restored).toBe(false);
    });
  });

  describe('Optimization', () => {
    it('should optimize by cleaning up and rebuilding index', async () => {
      // Add some items
      for (let i = 0; i < 5; i++) {
        await sessionLayer.store({
          content: `Content ${i}`,
          metadata: createMockMetadata(),
        });
      }

      const statsBefore = await sessionLayer.getStats();
      await sessionLayer.optimize();
      const statsAfter = await sessionLayer.getStats();

      // Should not change item count for unexpired items
      expect(statsAfter.totalItems).toBeLessThanOrEqual(statsBefore.totalItems);
    });
  });

  describe('Session Context', () => {
    it('should maintain session context for related items', async () => {
      const sessionId = 'test-session-123';

      // Store items with same session ID
      const items = [];
      for (let i = 0; i < 3; i++) {
        const item = await sessionLayer.store({
          content: `Session content ${i}`,
          metadata: createMockMetadata({ sessionId }),
        });
        items.push(item);
      }

      // Search by session ID
      const results = await sessionLayer.search({
        query: '',
        filters: { sessionId },
      });

      expect(results.length).toBe(3);
      results.forEach(result => {
        expect(result.memory.metadata.sessionId).toBe(sessionId);
      });
    });

    it('should support rapid access patterns typical of conversations', async () => {
      const conversationItems = [
        'User asked about JavaScript arrays',
        'Explained array methods like map, filter, reduce',
        'User wanted example of reduce function',
        'Provided reduce example with sum calculation',
        'User asked about performance differences',
        'Discussed time complexity of array methods',
      ];

      const storedItems = [];
      for (const content of conversationItems) {
        const item = await sessionLayer.store({
          content,
          metadata: createMockMetadata({
            category: 'conversation',
            tags: ['javascript', 'arrays'],
          }),
        });
        storedItems.push(item);
      }

      // Simulate rapid access pattern
      for (const item of storedItems) {
        await sessionLayer.retrieve(item.id);
      }

      // Search for related content
      const results = await sessionLayer.search({
        query: 'array javascript',
        limit: 10,
      });

      expect(results.length).toBe(conversationItems.length);
      expect(results.every(r => r.memory.metadata.tags.includes('javascript'))).toBe(true);
    });
  });
});