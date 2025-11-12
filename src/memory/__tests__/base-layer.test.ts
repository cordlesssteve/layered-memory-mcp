/**
 * Tests for BaseMemoryLayer functionality
 */

import { BaseMemoryLayer } from '../base-layer.js';
import type { MemoryLayerConfig } from '../types.js';
import { createMockMetadata, createTestMemoryItems, MemoryTestHelper } from './test-utils.js';

// Create a concrete test implementation of BaseMemoryLayer
class TestMemoryLayer extends BaseMemoryLayer {
  constructor(config: MemoryLayerConfig = { ttl: undefined }) {
    super('session', config);
  }

  async optimize(): Promise<void> {
    // Test implementation - just cleanup
    await this.cleanup();
  }

  async backup(): Promise<string> {
    return `test-backup-${Date.now()}`;
  }

  async restore(_backupId: string): Promise<boolean> {
    return true;
  }
}

describe('BaseMemoryLayer', () => {
  let layer: TestMemoryLayer;

  beforeEach(() => {
    layer = new TestMemoryLayer({
      maxItems: 100,
      maxSizeBytes: 1024 * 1024, // 1MB
      ttl: 60 * 60 * 1000, // 1 hour
      compressionEnabled: false,
      indexingEnabled: true,
    });
  });

  afterEach(async () => {
    // Clean up after each test
    const items = await layer.export();
    for (const item of items) {
      await layer.delete(item.id);
    }
  });

  describe('Store Operations', () => {
    it('should store a memory item successfully', async () => {
      const content = 'Test memory content';
      const metadata = createMockMetadata({ priority: 7 });

      const stored = await layer.store({ content, metadata });

      expect(stored).toBeValidMemoryItem();
      expect(stored.content).toBe(content);
      expect(stored.metadata).toMatchObject(metadata);
      expect(stored.id).toBeDefined();
      expect(stored.createdAt).toBeInstanceOf(Date);
      expect(stored.updatedAt).toBeInstanceOf(Date);
      expect(stored.accessCount).toBe(0);
    });

    it('should generate unique IDs for each item', async () => {
      const items = [];

      for (let i = 0; i < 5; i++) {
        const stored = await layer.store({
          content: `Content ${i}`,
          metadata: createMockMetadata(),
        });
        items.push(stored);
      }

      const ids = items.map(item => item.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(items.length);
    });

    it('should update timestamps correctly', async () => {
      const before = Date.now();

      const stored = await layer.store({
        content: 'Test content',
        metadata: createMockMetadata(),
      });

      const after = Date.now();

      expect(stored.createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(stored.createdAt.getTime()).toBeLessThanOrEqual(after);
      expect(stored.updatedAt.getTime()).toBe(stored.createdAt.getTime());
      expect(stored.lastAccessedAt.getTime()).toBe(stored.createdAt.getTime());
    });
  });

  describe('Retrieve Operations', () => {
    it('should retrieve stored items by ID', async () => {
      const stored = await layer.store({
        content: 'Test retrieval',
        metadata: createMockMetadata(),
      });

      const retrieved = await layer.retrieve(stored.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(stored.id);
      expect(retrieved!.content).toBe(stored.content);
      expect(retrieved!.accessCount).toBe(1); // Should increment on retrieval
    });

    it('should return null for non-existent items', async () => {
      const retrieved = await layer.retrieve('non-existent-id');
      expect(retrieved).toBeNull();
    });

    it('should track access count and last accessed time', async () => {
      const stored = await layer.store({
        content: 'Access tracking test',
        metadata: createMockMetadata(),
      });

      expect(stored.accessCount).toBe(0);

      const firstRetrieval = await layer.retrieve(stored.id);
      expect(firstRetrieval!.accessCount).toBe(1);
      // lastAccessedAt should be updated on retrieval
      expect(firstRetrieval!.lastAccessedAt.getTime()).toBeGreaterThanOrEqual(stored.lastAccessedAt.getTime());

      const secondRetrieval = await layer.retrieve(stored.id);
      expect(secondRetrieval!.accessCount).toBe(2);
      // accessCount increments show that tracking is working
    });
  });

  describe('Search Operations', () => {
    beforeEach(async () => {
      // Add test data
      const testItems = [
        { content: 'JavaScript programming tutorial', metadata: createMockMetadata({ category: 'tutorial', tags: ['programming', 'javascript'] }) },
        { content: 'Python data analysis guide', metadata: createMockMetadata({ category: 'guide', tags: ['programming', 'python', 'data'] }) },
        { content: 'Database design principles', metadata: createMockMetadata({ category: 'reference', tags: ['database', 'design'] }) },
        { content: 'API documentation standards', metadata: createMockMetadata({ category: 'documentation', tags: ['api', 'standards'] }) },
      ];

      for (const item of testItems) {
        await layer.store(item);
      }
    });

    it('should find items by content keywords', async () => {
      const results = await layer.search({ query: 'tutorial' });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.memory.content.toLowerCase().includes('tutorial'))).toBe(true);
    });

    it('should find items by tags', async () => {
      const results = await layer.search({ query: 'javascript' });

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.memory.metadata.tags.includes('javascript'))).toBe(true);
    });

    it('should find items by category', async () => {
      const results = await layer.search({ query: 'tutorial' });

      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.memory.metadata.category === 'tutorial')).toBe(true);
    });

    it('should return results with scores', async () => {
      const results = await layer.search({ query: 'programming' });

      for (const result of results) {
        expect(result).toBeValidMemoryResult();
        expect(result.score).toBeGreaterThan(0);
        expect(result.score).toBeLessThanOrEqual(1);
        expect(result.source).toBe('session');
      }
    });

    it('should respect limit parameter', async () => {
      const results = await layer.search({ query: 'programming', limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should support offset parameter', async () => {
      const allResults = await layer.search({ query: 'programming' });

      if (allResults.length > 1) {
        const offsetResults = await layer.search({ query: 'programming', offset: 1 });
        expect(offsetResults.length).toBe(allResults.length - 1);
      }
    });

    it('should filter by category', async () => {
      const results = await layer.search({
        query: '',
        filters: { category: 'tutorial' }
      });

      expect(results.every(r => r.memory.metadata.category === 'tutorial')).toBe(true);
    });

    it('should filter by tags', async () => {
      const results = await layer.search({
        query: '',
        filters: { tags: ['programming'] }
      });

      expect(results.every(r => r.memory.metadata.tags.includes('programming'))).toBe(true);
    });

    it('should filter by priority range', async () => {
      const results = await layer.search({
        query: '',
        filters: { priority: { min: 7, max: 10 } }
      });

      expect(results.every(r => r.memory.metadata.priority >= 7 && r.memory.metadata.priority <= 10)).toBe(true);
    });
  });

  describe('Update Operations', () => {
    it('should update content successfully', async () => {
      const stored = await layer.store({
        content: 'Original content',
        metadata: createMockMetadata(),
      });

      // Small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 20));

      const newContent = 'Updated content';
      const updated = await layer.update(stored.id, { content: newContent });

      expect(updated).not.toBeNull();
      expect(updated!.content).toBe(newContent);
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(stored.updatedAt.getTime());
      expect(updated!.id).toBe(stored.id);
    });

    it('should update metadata successfully', async () => {
      const stored = await layer.store({
        content: 'Test content',
        metadata: createMockMetadata({ priority: 5 }),
      });

      const newMetadata = createMockMetadata({ priority: 8, tags: ['updated'] });
      const updated = await layer.update(stored.id, { metadata: newMetadata });

      expect(updated).not.toBeNull();
      expect(updated!.metadata).toMatchObject(newMetadata);
      expect(updated!.content).toBe(stored.content); // Should not change
    });

    it('should return null for non-existent items', async () => {
      const updated = await layer.update('non-existent-id', { content: 'new content' });
      expect(updated).toBeNull();
    });
  });

  describe('Delete Operations', () => {
    it('should delete items successfully', async () => {
      const stored = await layer.store({
        content: 'To be deleted',
        metadata: createMockMetadata(),
      });

      const deleted = await layer.delete(stored.id);
      expect(deleted).toBe(true);

      const retrieved = await layer.retrieve(stored.id);
      expect(retrieved).toBeNull();
    });

    it('should return false for non-existent items', async () => {
      const deleted = await layer.delete('non-existent-id');
      expect(deleted).toBe(false);
    });
  });

  describe('Bulk Operations', () => {
    it('should store multiple items in bulk', async () => {
      const items = createTestMemoryItems(5);
      const itemsToStore = items.map(item => ({
        content: item.content,
        metadata: item.metadata,
      }));

      const stored = await layer.bulkStore(itemsToStore);

      expect(stored.length).toBe(5);
      stored.forEach(item => {
        expect(item).toBeValidMemoryItem();
      });
    });

    it('should delete multiple items in bulk', async () => {
      const items = createTestMemoryItems(3);
      const stored = [];

      for (const item of items) {
        const s = await layer.store({
          content: item.content,
          metadata: item.metadata,
        });
        stored.push(s);
      }

      const ids = stored.map(item => item.id);
      const deletedCount = await layer.bulkDelete(ids);

      expect(deletedCount).toBe(3);

      for (const id of ids) {
        const retrieved = await layer.retrieve(id);
        expect(retrieved).toBeNull();
      }
    });
  });

  describe('Statistics', () => {
    it('should return accurate statistics', async () => {
      const items = createTestMemoryItems(5);

      for (const item of items) {
        await layer.store({
          content: item.content,
          metadata: item.metadata,
        });
      }

      const stats = await layer.getStats();
      MemoryTestHelper.assertValidMemoryStats(stats);
      expect(stats.totalItems).toBe(5);
      expect(stats.totalSize).toBeGreaterThan(0);
    });

    it('should return empty statistics for empty layer', async () => {
      const stats = await layer.getStats();
      MemoryTestHelper.assertValidMemoryStats(stats);
      expect(stats.totalItems).toBe(0);
      expect(stats.totalSize).toBe(0);
    });
  });

  describe('Export and Import', () => {
    it('should export all items', async () => {
      const items = createTestMemoryItems(3);

      for (const item of items) {
        await layer.store({
          content: item.content,
          metadata: item.metadata,
        });
      }

      const exported = await layer.export();
      expect(exported.length).toBe(3);
      exported.forEach(item => {
        expect(item).toBeValidMemoryItem();
      });
    });

    it('should import items successfully', async () => {
      const items = createTestMemoryItems(2);
      const importedCount = await layer.import(items);

      expect(importedCount).toBe(2);

      const stats = await layer.getStats();
      expect(stats.totalItems).toBe(2);
    });
  });

  describe('Capacity Management', () => {
    it('should enforce item count limits', async () => {
      const limitedLayer = new TestMemoryLayer({
        maxItems: 3,
        ttl: undefined,
      });

      // Store items up to limit
      for (let i = 0; i < 5; i++) {
        await limitedLayer.store({
          content: `Content ${i}`,
          metadata: createMockMetadata(),
        });
      }

      const stats = await limitedLayer.getStats();
      expect(stats.totalItems).toBeLessThanOrEqual(3);
    });
  });

  describe('Abstract Methods', () => {
    it('should implement required abstract methods', async () => {
      expect(typeof layer.optimize).toBe('function');
      expect(typeof layer.backup).toBe('function');
      expect(typeof layer.restore).toBe('function');

      // Test they can be called
      await layer.optimize();
      const backupId = await layer.backup();
      expect(typeof backupId).toBe('string');

      const restored = await layer.restore(backupId);
      expect(typeof restored).toBe('boolean');
    });
  });
});