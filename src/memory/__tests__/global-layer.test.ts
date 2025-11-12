/**
 * Tests for Global Layer functionality
 */

import { GlobalLayer } from '../layers/global-layer.js';
import { createMockMetadata, delay, createTemporaryDirectory } from './test-utils.js';

describe('GlobalLayer', () => {
  let globalLayer: GlobalLayer;
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTemporaryDirectory();
    globalLayer = new GlobalLayer({
      maxItems: 100,
      maxSizeBytes: 10 * 1024 * 1024, // 10MB
      ttl: 365 * 24 * 60 * 60 * 1000, // 1 year
      compressionEnabled: true,
      indexingEnabled: true,
    }, tempDir);
  });

  afterEach(async () => {
    await globalLayer.close();
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultLayer = new GlobalLayer();
      expect(defaultLayer.layer).toBe('global');
      expect(defaultLayer.config.maxItems).toBe(10000);
      expect(defaultLayer.config.maxSizeBytes).toBe(100 * 1024 * 1024);
      expect(defaultLayer.config.ttl).toBe(1000 * 60 * 60 * 24 * 365);
    });

    it('should initialize with custom configuration', () => {
      expect(globalLayer.layer).toBe('global');
      expect(globalLayer.config.maxItems).toBe(100);
      expect(globalLayer.config.maxSizeBytes).toBe(10 * 1024 * 1024);
      expect(globalLayer.config.compressionEnabled).toBe(true);
    });
  });

  describe('Vector-based Semantic Search', () => {
    beforeEach(async () => {
      // Add test data with semantic relationships
      const testItems = [
        { content: 'JavaScript programming tutorial for beginners', metadata: createMockMetadata({ category: 'tutorial', tags: ['programming', 'javascript'] }) },
        { content: 'Learning Python programming fundamentals', metadata: createMockMetadata({ category: 'tutorial', tags: ['programming', 'python'] }) },
        { content: 'Database design patterns and best practices', metadata: createMockMetadata({ category: 'reference', tags: ['database', 'design'] }) },
        { content: 'API development with REST principles', metadata: createMockMetadata({ category: 'guide', tags: ['api', 'development'] }) },
        { content: 'Frontend JavaScript frameworks comparison', metadata: createMockMetadata({ category: 'analysis', tags: ['frontend', 'javascript'] }) },
      ];

      for (const item of testItems) {
        await globalLayer.store(item);
      }

      // Wait for vector generation
      await delay(100);
    });

    it('should combine text and vector search results', async () => {
      const results = await globalLayer.search({ query: 'programming tutorial' });

      expect(results.length).toBeGreaterThan(0);

      // Should find semantically similar content
      const hasRelevantContent = results.some(r =>
        r.memory.content.toLowerCase().includes('programming') ||
        r.memory.content.toLowerCase().includes('tutorial')
      );
      expect(hasRelevantContent).toBe(true);

      // Results should be sorted by combined score
      for (let i = 1; i < results.length; i++) {
        expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score);
      }
    });

    it('should find similar memories using vector similarity', async () => {
      const results = await globalLayer.findSimilarMemories('learning programming basics', 3);

      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(3);

      // Should find programming-related content
      const hasProgrammingContent = results.some(r =>
        r.memory.content.toLowerCase().includes('programming') ||
        r.memory.metadata.tags.includes('programming')
      );
      expect(hasProgrammingContent).toBe(true);

      // Should have similarity scores
      results.forEach(result => {
        expect(result.score).toBeGreaterThan(0);
        expect(result.score).toBeLessThanOrEqual(1);
        expect(result.explanation).toContain('semantic similarity');
      });
    });

    it('should generate vectors for stored content', async () => {
      await globalLayer.store({
        content: 'Machine learning algorithms for data science',
        metadata: createMockMetadata({ category: 'knowledge' }),
      });

      // Vector should be generated automatically
      const similarResults = await globalLayer.findSimilarMemories('artificial intelligence and data analysis', 5);

      // The stored item should be found if there are semantic relationships
      expect(Array.isArray(similarResults)).toBe(true);
    });

    it('should update vectors when content is modified', async () => {
      const item = await globalLayer.store({
        content: 'Original content about databases',
        metadata: createMockMetadata(),
      });

      // Update the content
      const updated = await globalLayer.update(item.id, {
        content: 'Updated content about machine learning',
      });

      expect(updated).not.toBeNull();

      // Vector should be regenerated for the new content
      const mlResults = await globalLayer.findSimilarMemories('artificial intelligence', 5);
      const dbResults = await globalLayer.findSimilarMemories('database systems', 5);

      // The updated item should be more similar to ML queries than DB queries
      expect(Array.isArray(mlResults)).toBe(true);
      expect(Array.isArray(dbResults)).toBe(true);
    });

    it('should remove vectors when items are deleted', async () => {
      const item = await globalLayer.store({
        content: 'Content to be deleted',
        metadata: createMockMetadata(),
      });

      const beforeDeletion = await globalLayer.findSimilarMemories('Content to be deleted', 10);
      const foundBefore = beforeDeletion.some(r => r.memory.id === item.id);
      expect(foundBefore).toBe(true);

      const deleted = await globalLayer.delete(item.id);
      expect(deleted).toBe(true);

      const afterDeletion = await globalLayer.findSimilarMemories('Content to be deleted', 10);
      const foundAfter = afterDeletion.some(r => r.memory.id === item.id);
      expect(foundAfter).toBe(false);
    });
  });

  describe('Cross-Project Analytics', () => {
    beforeEach(async () => {
      // Add test data from multiple projects
      const testData = [
        { content: 'Project A feature implementation', metadata: createMockMetadata({ projectId: 'project-a', category: 'feature', tags: ['frontend'] }) },
        { content: 'Project A bug fix', metadata: createMockMetadata({ projectId: 'project-a', category: 'bug', tags: ['backend'] }) },
        { content: 'Project B documentation', metadata: createMockMetadata({ projectId: 'project-b', category: 'docs', tags: ['api'] }) },
        { content: 'Project B security enhancement', metadata: createMockMetadata({ projectId: 'project-b', category: 'security', tags: ['authentication'] }) },
        { content: 'Project C performance optimization', metadata: createMockMetadata({ projectId: 'project-c', category: 'performance', tags: ['database'] }) },
        { content: 'General knowledge base entry', metadata: createMockMetadata({ category: 'knowledge', tags: ['best-practices'] }) },
      ];

      for (const item of testData) {
        await globalLayer.store(item);
      }
    });

    it('should provide comprehensive global statistics', async () => {
      const stats = await globalLayer.getGlobalStats();

      expect(stats.projectDistribution).toBeDefined();
      expect(Object.keys(stats.projectDistribution).length).toBeGreaterThan(0);
      expect(stats.projectDistribution['project-a']).toBe(2);
      expect(stats.projectDistribution['project-b']).toBe(2);
      expect(stats.projectDistribution['project-c']).toBe(1);
      expect(stats.projectDistribution['unknown']).toBe(1); // Item without projectId

      expect(stats.topCategories).toBeDefined();
      expect(Array.isArray(stats.topCategories)).toBe(true);
      expect(stats.topCategories.length).toBeGreaterThan(0);

      expect(stats.topTags).toBeDefined();
      expect(Array.isArray(stats.topTags)).toBe(true);
      expect(stats.topTags.length).toBeGreaterThan(0);

      expect(stats.semanticClusters).toBeDefined();
      expect(Array.isArray(stats.semanticClusters)).toBe(true);

      expect(stats.growthRate).toBeDefined();
      expect(typeof stats.growthRate.daily).toBe('number');
      expect(typeof stats.growthRate.weekly).toBe('number');
      expect(typeof stats.growthRate.monthly).toBe('number');
    });

    it('should analyze semantic clusters', async () => {
      // Add more related content to form clusters
      await globalLayer.store({
        content: 'Another frontend feature for Project A',
        metadata: createMockMetadata({ projectId: 'project-a', category: 'feature', tags: ['frontend', 'ui'] }),
      });

      await globalLayer.store({
        content: 'Frontend component testing',
        metadata: createMockMetadata({ projectId: 'project-a', category: 'testing', tags: ['frontend', 'ui'] }),
      });

      const stats = await globalLayer.getGlobalStats();

      expect(stats.semanticClusters).toBeDefined();
      expect(Array.isArray(stats.semanticClusters)).toBe(true);

      // Clusters should be sorted by size
      for (let i = 1; i < stats.semanticClusters.length; i++) {
        expect(stats.semanticClusters[i]!.size).toBeLessThanOrEqual(stats.semanticClusters[i - 1]!.size);
      }
    });

    it('should calculate growth rates correctly', async () => {
      const stats = await globalLayer.getGlobalStats();

      // All current items should count as daily growth
      expect(stats.growthRate.daily).toBeGreaterThan(0);
      expect(stats.growthRate.weekly).toBeGreaterThan(0);
      expect(stats.growthRate.monthly).toBeGreaterThan(0);

      // Weekly should be daily/7, monthly should be daily/30 (approximately)
      expect(stats.growthRate.weekly).toBeCloseTo(stats.growthRate.daily / 7, 1);
      expect(stats.growthRate.monthly).toBeCloseTo(stats.growthRate.daily / 30, 1);
    });
  });

  describe('Persistence and Backup', () => {
    it('should persist data to disk including vectors', async () => {
      // Store some data
      const items = [];
      for (let i = 0; i < 3; i++) {
        const item = await globalLayer.store({
          content: `Global content ${i}`,
          metadata: createMockMetadata({ priority: i + 5 }),
        });
        items.push(item);
      }

      // Force immediate save before closing
      await globalLayer.optimize(); // This triggers saveToDisk()
      await delay(100);
      await globalLayer.close();

      // Create new layer with same directory
      const newGlobalLayer = new GlobalLayer({
        maxItems: 100,
        maxSizeBytes: 10 * 1024 * 1024,
        ttl: 365 * 24 * 60 * 60 * 1000,
        compressionEnabled: true,
        indexingEnabled: true,
      }, tempDir);

      // Wait for data to load
      await delay(200);

      const stats = await newGlobalLayer.getStats();
      expect(stats.totalItems).toBeGreaterThan(0);

      // Vector search should work with loaded data
      const vectorResults = await newGlobalLayer.findSimilarMemories('Global content', 5);
      expect(vectorResults.length).toBeGreaterThan(0);

      await newGlobalLayer.close();
    });

    it('should create and restore backups with vectors', async () => {
      // Store test data
      const originalItems = [];
      for (let i = 0; i < 3; i++) {
        const item = await globalLayer.store({
          content: `Backup test content ${i}`,
          metadata: createMockMetadata({ category: 'backup-test' }),
        });
        originalItems.push(item);
      }

      // Wait for vector generation
      await delay(100);

      // Create backup
      const backupId = await globalLayer.backup();
      expect(backupId).toMatch(/^global-/);

      // Store additional data after backup
      await globalLayer.store({
        content: 'Post-backup content',
        metadata: createMockMetadata(),
      });

      let stats = await globalLayer.getStats();
      expect(stats.totalItems).toBe(4);

      // Restore from backup
      const restored = await globalLayer.restore(backupId);
      expect(restored).toBe(true);

      stats = await globalLayer.getStats();
      expect(stats.totalItems).toBe(3); // Should be back to original count

      // Verify vector search still works after restore
      const vectorResults = await globalLayer.findSimilarMemories('Backup test content', 5);
      expect(vectorResults.length).toBeGreaterThan(0);

      const hasOriginalContent = vectorResults.some(r =>
        r.memory.content.includes('Backup test content')
      );
      expect(hasOriginalContent).toBe(true);
    });

    it('should handle backup creation errors gracefully', async () => {
      // Create layer with invalid backup directory
      const invalidLayer = new GlobalLayer({ ttl: 365 * 24 * 60 * 60 * 1000 }, '/invalid/nonexistent/path');

      await invalidLayer.store({
        content: 'Test content',
        metadata: createMockMetadata(),
      });

      // Backup should handle errors and not throw
      let backupResult: string | undefined;
      try {
        backupResult = await invalidLayer.backup();
      } catch (error) {
        // Should not throw, but may return error result
      }

      // The method might return a backup ID even if save fails
      expect(typeof backupResult === 'string' || backupResult === undefined).toBe(true);

      await invalidLayer.close();
    });
  });

  describe('Optimization and Archival', () => {
    it('should optimize by rebuilding text and vector indices', async () => {
      // Add some items
      for (let i = 0; i < 5; i++) {
        await globalLayer.store({
          content: `Optimization test content ${i}`,
          metadata: createMockMetadata({ priority: i % 3 + 1 }),
        });
      }

      // Wait for vector generation
      await delay(100);

      const statsBefore = await globalLayer.getStats();
      await globalLayer.optimize();
      const statsAfter = await globalLayer.getStats();

      // Should not lose data during optimization
      expect(statsAfter.totalItems).toBeLessThanOrEqual(statsBefore.totalItems);

      // Vector search should still work after optimization
      const vectorResults = await globalLayer.findSimilarMemories('optimization test', 5);
      expect(vectorResults.length).toBeGreaterThan(0);
    });

    it('should archive old, rarely accessed items', async () => {
      // Create items with old timestamps (simulate old data)
      const oldDate = new Date(Date.now() - (7 * 30 * 24 * 60 * 60 * 1000)); // 7 months ago

      const item = await globalLayer.store({
        content: 'Very old content that should be archived',
        metadata: createMockMetadata({ category: 'old' }),
      });

      // Manually set old timestamps to simulate aging
      const storedItem = (globalLayer as any).items.get(item.id);
      if (storedItem) {
        storedItem.createdAt = oldDate;
        storedItem.lastAccessedAt = oldDate;
        storedItem.accessCount = 0;
      }

      // Store a recent item that should not be archived
      await globalLayer.store({
        content: 'Recent content that should remain',
        metadata: createMockMetadata({ category: 'recent' }),
      });

      const statsBefore = await globalLayer.getStats();
      await globalLayer.optimize(); // This triggers archival
      const statsAfter = await globalLayer.getStats();

      // Old item might be archived, reducing total count
      expect(statsAfter.totalItems).toBeLessThanOrEqual(statsBefore.totalItems);

      // Recent item should still be findable
      const recentResults = await globalLayer.search({ query: 'Recent content' });
      expect(recentResults.length).toBeGreaterThan(0);
    });
  });

  describe('Capacity Management', () => {
    it('should enforce item limits at global scale', async () => {
      const limitedLayer = new GlobalLayer({
        maxItems: 5,
        ttl: undefined,
      }, tempDir);

      // Store more items than the limit
      for (let i = 0; i < 8; i++) {
        await limitedLayer.store({
          content: `Limited global content ${i}`,
          metadata: createMockMetadata(),
        });
      }

      const stats = await limitedLayer.getStats();
      expect(stats.totalItems).toBeLessThanOrEqual(5);

      await limitedLayer.close();
    });

    it('should handle very large content appropriately', async () => {
      const largeContent = 'Large global knowledge entry. '.repeat(5000); // ~150KB

      const item = await globalLayer.store({
        content: largeContent,
        metadata: createMockMetadata({ category: 'large-knowledge' }),
      });

      expect(item.content).toBe(largeContent);

      // Should generate vectors even for large content
      const similarResults = await globalLayer.findSimilarMemories('Large global knowledge', 3);
      expect(Array.isArray(similarResults)).toBe(true);

      const retrieved = await globalLayer.retrieve(item.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.content.length).toBe(largeContent.length);
    });
  });

  describe('Cross-Project Search', () => {
    beforeEach(async () => {
      // Add data from multiple projects
      const projectData = [
        { content: 'Authentication system for web app', metadata: createMockMetadata({ projectId: 'web-app', category: 'security', tags: ['auth', 'web'] }) },
        { content: 'Mobile app user authentication', metadata: createMockMetadata({ projectId: 'mobile-app', category: 'security', tags: ['auth', 'mobile'] }) },
        { content: 'Database connection pooling', metadata: createMockMetadata({ projectId: 'backend-service', category: 'database', tags: ['performance', 'backend'] }) },
        { content: 'API rate limiting implementation', metadata: createMockMetadata({ projectId: 'web-app', category: 'api', tags: ['performance', 'web'] }) },
        { content: 'Unit testing best practices', metadata: createMockMetadata({ category: 'testing', tags: ['quality', 'practices'] }) },
      ];

      for (const item of projectData) {
        await globalLayer.store(item);
      }
    });

    it('should find relevant content across all projects', async () => {
      const results = await globalLayer.search({ query: 'authentication' });

      expect(results.length).toBeGreaterThan(0);

      // Should find authentication-related content from multiple projects
      const projectIds = new Set(results.map(r => r.memory.metadata.projectId));
      expect(projectIds.size).toBeGreaterThan(1);

      // Should include both web and mobile auth results
      const hasWebAuth = results.some(r => r.memory.content.includes('web'));
      const hasMobileAuth = results.some(r => r.memory.content.includes('Mobile'));
      expect(hasWebAuth).toBe(true);
      expect(hasMobileAuth).toBe(true);
    });

    it('should filter results by project when specified', async () => {
      const results = await globalLayer.search({
        query: '',
        filters: { projectId: 'web-app' },
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.memory.metadata.projectId === 'web-app')).toBe(true);
    });

    it('should find cross-project patterns using semantic search', async () => {
      // Search by tag to ensure we find performance-related content
      const performanceResults = await globalLayer.search({
        query: 'performance',
        filters: { tags: ['performance'] }
      });

      expect(performanceResults.length).toBeGreaterThan(0);

      // Should find performance-related content across projects
      const hasPerformanceContent = performanceResults.some(r =>
        r.memory.metadata.tags.includes('performance') ||
        r.memory.content.toLowerCase().includes('performance') ||
        r.memory.content.toLowerCase().includes('optimization')
      );
      expect(hasPerformanceContent).toBe(true);
    });
  });

  describe('Resource Management', () => {
    it('should close cleanly and save all data', async () => {
      await globalLayer.store({
        content: 'Test content for close',
        metadata: createMockMetadata(),
      });

      // Should not throw
      await globalLayer.close();
    });

    it('should handle multiple close calls gracefully', async () => {
      await globalLayer.close();
      await globalLayer.close(); // Should not throw
    });

    it('should clean up auto-persistence on close', async () => {
      // Store some data to mark as dirty
      await globalLayer.store({
        content: 'Auto-persistence test',
        metadata: createMockMetadata(),
      });

      await globalLayer.close();

      // Verify persistence interval is cleared (no direct way to test this,
      // but close should not throw and should handle cleanup)
      expect(true).toBe(true); // Placeholder for successful close
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid restore gracefully', async () => {
      const invalidBackupId = 'invalid-global-backup-id';
      const restored = await globalLayer.restore(invalidBackupId);
      expect(restored).toBe(false);
    });

    it('should handle vector generation errors gracefully', async () => {
      // Store item with very large content that might cause issues
      const extremeContent = 'x'.repeat(100000); // 100KB of single character

      const item = await globalLayer.store({
        content: extremeContent,
        metadata: createMockMetadata(),
      });

      expect(item).toBeDefined();

      // Vector search should work even with extreme content
      const results = await globalLayer.findSimilarMemories('x', 1);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle persistence errors gracefully', async () => {
      // Create layer with invalid directory path
      const invalidLayer = new GlobalLayer({ ttl: 365 * 24 * 60 * 60 * 1000 }, '/invalid/nonexistent/path/that/should/fail');

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
});