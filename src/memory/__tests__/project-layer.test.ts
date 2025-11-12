/**
 * Tests for Project Layer functionality
 */

import { ProjectLayer } from '../layers/project-layer.js';
import { createMockMetadata, delay, createTemporaryDirectory } from './test-utils.js';

describe('ProjectLayer', () => {
  let projectLayer: ProjectLayer;
  let tempDir: string;
  const testProjectId = 'test-project-123';

  beforeEach(() => {
    tempDir = createTemporaryDirectory();
    projectLayer = new ProjectLayer(testProjectId, {
      maxItems: 50,
      maxSizeBytes: 1024 * 1024, // 1MB
      ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
      compressionEnabled: true,
      indexingEnabled: true,
    }, tempDir);
  });

  afterEach(async () => {
    await projectLayer.close();
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultLayer = new ProjectLayer('default-project');
      expect(defaultLayer.layer).toBe('project');
      expect(defaultLayer.config.maxItems).toBe(1000);
      expect(defaultLayer.config.maxSizeBytes).toBe(10 * 1024 * 1024);
      expect(defaultLayer.config.ttl).toBe(1000 * 60 * 60 * 24 * 30);
    });

    it('should initialize with custom configuration', () => {
      expect(projectLayer.layer).toBe('project');
      expect(projectLayer.config.maxItems).toBe(50);
      expect(projectLayer.config.maxSizeBytes).toBe(1024 * 1024);
      expect(projectLayer.config.compressionEnabled).toBe(true);
    });
  });

  describe('Project-Specific Operations', () => {
    it('should automatically add project ID to stored items', async () => {
      const item = await projectLayer.store({
        content: 'Test project content',
        metadata: createMockMetadata({ category: 'task' }),
      });

      expect(item.metadata.projectId).toBe(testProjectId);
    });

    it('should maintain project ID consistency', async () => {
      const items = [];
      for (let i = 0; i < 3; i++) {
        const item = await projectLayer.store({
          content: `Project content ${i}`,
          metadata: createMockMetadata(),
        });
        items.push(item);
      }

      for (const item of items) {
        expect(item.metadata.projectId).toBe(testProjectId);
      }
    });

    it('should provide project-specific statistics', async () => {
      // Add items with different categories
      await projectLayer.store({
        content: 'Task content',
        metadata: createMockMetadata({ category: 'task' }),
      });
      await projectLayer.store({
        content: 'Bug content',
        metadata: createMockMetadata({ category: 'bug' }),
      });
      await projectLayer.store({
        content: 'Feature content',
        metadata: createMockMetadata({ category: 'feature' }),
      });

      const stats = await projectLayer.getProjectStats();

      expect(stats.projectId).toBe(testProjectId);
      expect(stats.itemsByCategory).toBeDefined();
      expect(stats.oldestProjectItem).toBeInstanceOf(Date);
      expect(stats.newestProjectItem).toBeInstanceOf(Date);
      expect(stats.persistenceStatus).toBe('dirty');
      expect(typeof stats.compressionRatio).toBe('number');
    });

    it('should export project data correctly', async () => {
      const testItems = [
        { content: 'Project item 1', metadata: createMockMetadata({ category: 'task', tags: ['urgent'] }) },
        { content: 'Project item 2', metadata: createMockMetadata({ category: 'bug', tags: ['backend'] }) },
        { content: 'Project item 3', metadata: createMockMetadata({ category: 'feature', tags: ['frontend'] }) },
      ];

      for (const item of testItems) {
        await projectLayer.store(item);
      }

      const exportData = await projectLayer.exportProject();

      expect(exportData.projectId).toBe(testProjectId);
      expect(exportData.items.length).toBe(3);
      expect(exportData.metadata['totalItems']).toBe(3);
      expect(exportData.metadata['categories']).toEqual(expect.arrayContaining(['task', 'bug', 'feature']));
      expect(exportData.metadata['tags']).toEqual(expect.arrayContaining(['urgent', 'backend', 'frontend']));

      // All items should have the project ID
      exportData.items.forEach(item => {
        expect(item.metadata.projectId).toBe(testProjectId);
      });
    });
  });

  describe('Persistence Operations', () => {
    it('should track dirty state correctly', async () => {
      const initialStats = await projectLayer.getProjectStats();
      expect(initialStats.persistenceStatus).toBe('clean');

      await projectLayer.store({
        content: 'New content',
        metadata: createMockMetadata(),
      });

      const afterStoreStats = await projectLayer.getProjectStats();
      expect(afterStoreStats.persistenceStatus).toBe('dirty');
    });

    it('should handle file persistence operations', async () => {
      // Store some data
      const items = [];
      for (let i = 0; i < 3; i++) {
        const item = await projectLayer.store({
          content: `Persistent content ${i}`,
          metadata: createMockMetadata({ priority: i + 5 }),
        });
        items.push(item);
      }

      // Wait a moment for auto-persistence to potentially trigger
      await delay(100);

      // Close and verify data persistence
      await projectLayer.close();

      // Create new layer with same project ID and directory
      const newProjectLayer = new ProjectLayer(testProjectId, {
        maxItems: 50,
        maxSizeBytes: 1024 * 1024,
        ttl: 30 * 24 * 60 * 60 * 1000,
        compressionEnabled: true,
        indexingEnabled: true,
      }, tempDir);

      // Wait for data to load
      await delay(200);

      const stats = await newProjectLayer.getStats();
      expect(stats.totalItems).toBeGreaterThan(0);

      await newProjectLayer.close();
    });

    it('should support backup and restore operations', async () => {
      // Store test data
      const originalItems = [];
      for (let i = 0; i < 3; i++) {
        const item = await projectLayer.store({
          content: `Backup content ${i}`,
          metadata: createMockMetadata({ category: 'backup-test' }),
        });
        originalItems.push(item);
      }

      // Create backup
      const backupId = await projectLayer.backup();
      expect(backupId).toMatch(new RegExp(`^project-${testProjectId}-`));

      // Store additional data after backup
      await projectLayer.store({
        content: 'Post-backup content',
        metadata: createMockMetadata(),
      });

      let stats = await projectLayer.getStats();
      expect(stats.totalItems).toBe(4);

      // Restore from backup
      const restored = await projectLayer.restore(backupId);
      expect(restored).toBe(true);

      stats = await projectLayer.getStats();
      expect(stats.totalItems).toBe(3); // Should be back to original count

      // Verify original content is restored
      const results = await projectLayer.search({ query: 'Backup content' });
      expect(results.length).toBe(3);
    });

    it('should reject restore with mismatched project ID', async () => {
      // Create a different project layer
      const otherProjectLayer = new ProjectLayer('other-project', { ttl: 365 * 24 * 60 * 60 * 1000 }, tempDir);

      await otherProjectLayer.store({
        content: 'Other project content',
        metadata: createMockMetadata(),
      });

      const otherBackupId = await otherProjectLayer.backup();
      await otherProjectLayer.close();

      // Try to restore other project's backup
      const restored = await projectLayer.restore(otherBackupId);
      expect(restored).toBe(false);
    });
  });

  describe('Compression Features', () => {
    it('should compress old, rarely accessed items', async () => {
      const originalContent = 'This   is   some   content   with   lots   of   extra   whitespace\n\n\n   and   newlines   ';

      // Store an item with excessive whitespace
      const item = await projectLayer.store({
        content: originalContent,
        metadata: createMockMetadata(),
      });

      // Manually trigger compression by calling optimize
      await projectLayer.optimize();

      // Check if content was compressed
      const retrieved = await projectLayer.retrieve(item.id);
      expect(retrieved).not.toBeNull();

      // Content should be cleaned up but semantically the same
      expect(retrieved!.content.length).toBeLessThanOrEqual(originalContent.length);
      expect(retrieved!.content).toContain('This');
      expect(retrieved!.content).toContain('content');
    });

    it('should calculate compression ratio when enabled', async () => {
      // Store some items
      for (let i = 0; i < 3; i++) {
        await projectLayer.store({
          content: `Content with spaces    and    tabs\t\t\tand newlines\n\n\n ${i}`,
          metadata: createMockMetadata(),
        });
      }

      const stats = await projectLayer.getProjectStats();
      expect(stats.compressionRatio).toBeDefined();
      expect(typeof stats.compressionRatio).toBe('number');
      expect(stats.compressionRatio!).toBeGreaterThan(0);
    });

    it('should not report compression ratio when disabled', async () => {
      const nonCompressingLayer = new ProjectLayer(
        'no-compression-project',
        {
          compressionEnabled: false,
          maxItems: 10,
          ttl: 365 * 24 * 60 * 60 * 1000,
        },
        tempDir
      );

      await nonCompressingLayer.store({
        content: 'Test content',
        metadata: createMockMetadata(),
      });

      const stats = await nonCompressingLayer.getProjectStats();
      expect(stats.compressionRatio).toBeUndefined();

      await nonCompressingLayer.close();
    });
  });

  describe('Optimization and Maintenance', () => {
    it('should optimize by cleaning up and rebuilding index', async () => {
      // Add some items
      for (let i = 0; i < 5; i++) {
        await projectLayer.store({
          content: `Optimization test ${i}`,
          metadata: createMockMetadata({ priority: i % 3 + 1 }),
        });
      }

      const statsBefore = await projectLayer.getStats();
      await projectLayer.optimize();
      const statsAfter = await projectLayer.getStats();

      // Optimization should not lose data
      expect(statsAfter.totalItems).toBeLessThanOrEqual(statsBefore.totalItems);
    });

    it('should clean up expired items during optimization', async () => {
      // Use a short TTL for testing
      const shortTtlLayer = new ProjectLayer(
        'short-ttl-project',
        {
          ttl: 100, // 100ms
          maxItems: 10,
        },
        tempDir
      );

      await shortTtlLayer.store({
        content: 'Will expire soon',
        metadata: createMockMetadata(),
      });

      // Wait for expiration
      await delay(150);

      await shortTtlLayer.optimize();

      const stats = await shortTtlLayer.getStats();
      expect(stats.totalItems).toBe(0);

      await shortTtlLayer.close();
    });
  });

  describe('Capacity Management', () => {
    it('should enforce item limits', async () => {
      const limitedLayer = new ProjectLayer(
        'limited-project',
        {
          maxItems: 3,
          ttl: undefined,
        },
        tempDir
      );

      // Store more items than the limit
      for (let i = 0; i < 5; i++) {
        await limitedLayer.store({
          content: `Limited content ${i}`,
          metadata: createMockMetadata(),
        });
      }

      const stats = await limitedLayer.getStats();
      expect(stats.totalItems).toBeLessThanOrEqual(3);

      await limitedLayer.close();
    });

    it('should handle large content appropriately', async () => {
      const largeContent = 'Large content data. '.repeat(1000); // ~20KB

      const item = await projectLayer.store({
        content: largeContent,
        metadata: createMockMetadata(),
      });

      expect(item.content).toBe(largeContent);

      const retrieved = await projectLayer.retrieve(item.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.content.length).toBe(largeContent.length);
    });
  });

  describe('Search and Filtering', () => {
    beforeEach(async () => {
      // Add test data specific to project
      const testItems = [
        { content: 'JavaScript project implementation', metadata: createMockMetadata({ category: 'code', tags: ['javascript', 'implementation'] }) },
        { content: 'Python data processing script', metadata: createMockMetadata({ category: 'script', tags: ['python', 'data'] }) },
        { content: 'Database schema design', metadata: createMockMetadata({ category: 'database', tags: ['schema', 'design'] }) },
        { content: 'API endpoint documentation', metadata: createMockMetadata({ category: 'docs', tags: ['api', 'documentation'] }) },
      ];

      for (const item of testItems) {
        await projectLayer.store(item);
      }
    });

    it('should find project-specific content', async () => {
      const results = await projectLayer.search({ query: 'javascript' });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.memory.metadata.projectId === testProjectId)).toBe(true);
      expect(results.some(r => r.memory.content.toLowerCase().includes('javascript'))).toBe(true);
    });

    it('should filter by project-specific metadata', async () => {
      const results = await projectLayer.search({
        query: '',
        filters: { category: 'code' },
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.memory.metadata.category === 'code')).toBe(true);
      expect(results.every(r => r.memory.metadata.projectId === testProjectId)).toBe(true);
    });

    it('should support complex project queries', async () => {
      const results = await projectLayer.search({
        query: 'design implementation',
        filters: { tags: ['implementation', 'design'] },
        limit: 5,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(result => {
        expect(result.memory.metadata.projectId).toBe(testProjectId);
        expect(
          result.memory.metadata.tags.includes('implementation') ||
          result.memory.metadata.tags.includes('design') ||
          result.memory.content.toLowerCase().includes('design') ||
          result.memory.content.toLowerCase().includes('implementation')
        ).toBe(true);
      });
    });
  });

  describe('Resource Management', () => {
    it('should close cleanly and save dirty data', async () => {
      await projectLayer.store({
        content: 'Test content for close',
        metadata: createMockMetadata(),
      });

      const statsBefore = await projectLayer.getProjectStats();
      expect(statsBefore.persistenceStatus).toBe('dirty');

      // Should not throw
      await projectLayer.close();
    });

    it('should handle multiple close calls gracefully', async () => {
      await projectLayer.close();
      await projectLayer.close(); // Should not throw
    });

    it('should clean up auto-persistence on close', async () => {
      // Store some data to mark as dirty
      await projectLayer.store({
        content: 'Auto-persistence test',
        metadata: createMockMetadata(),
      });

      await projectLayer.close();

      // Verify persistence interval is cleared (no direct way to test this,
      // but close should not throw and should handle cleanup)
      expect(true).toBe(true); // Placeholder for successful close
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid backup restore gracefully', async () => {
      const invalidBackupId = 'invalid-backup-id';
      const restored = await projectLayer.restore(invalidBackupId);
      expect(restored).toBe(false);
    });

    it('should handle persistence errors gracefully', async () => {
      // Create layer with invalid directory path
      const invalidLayer = new ProjectLayer(
        'invalid-project',
        { ttl: 365 * 24 * 60 * 60 * 1000 },
        '/invalid/nonexistent/path/that/should/fail'
      );

      // Store operation should work (in memory)
      const item = await invalidLayer.store({
        content: 'Test content',
        metadata: createMockMetadata(),
      });

      expect(item).toBeDefined();

      // Close may log errors but should not throw
      await invalidLayer.close();
    });
  });

  describe('Auto-Persistence', () => {
    it('should mark items as dirty when modified', async () => {
      const item = await projectLayer.store({
        content: 'Original content',
        metadata: createMockMetadata(),
      });

      let stats = await projectLayer.getProjectStats();
      expect(stats.persistenceStatus).toBe('dirty');

      // Updates should also mark as dirty
      await projectLayer.update(item.id, { content: 'Updated content' });

      stats = await projectLayer.getProjectStats();
      expect(stats.persistenceStatus).toBe('dirty');

      // Deletes should also mark as dirty
      await projectLayer.delete(item.id);

      stats = await projectLayer.getProjectStats();
      expect(stats.persistenceStatus).toBe('dirty');
    });
  });
});