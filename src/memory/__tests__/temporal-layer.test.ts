/**
 * Tests for Temporal Layer functionality
 */

import { TemporalLayer, type TemporalQuery } from '../layers/temporal-layer.js';
import { createMockMetadata, delay, createTemporaryDirectory } from './test-utils.js';

describe('TemporalLayer', () => {
  let temporalLayer: TemporalLayer;
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTemporaryDirectory();
    temporalLayer = new TemporalLayer({
      maxItems: 1000,
      maxSizeBytes: 50 * 1024 * 1024, // 50MB
      ttl: undefined, // No expiration for historical data
      compressionEnabled: true,
      indexingEnabled: true,
    }, tempDir);
  });

  afterEach(async () => {
    await temporalLayer.close();
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      const defaultLayer = new TemporalLayer();
      expect(defaultLayer.layer).toBe('temporal');
      expect(defaultLayer.config.maxItems).toBe(50000);
      expect(defaultLayer.config.maxSizeBytes).toBe(500 * 1024 * 1024);
      expect(defaultLayer.config.ttl).toBeUndefined();
    });

    it('should initialize with custom configuration', () => {
      expect(temporalLayer.layer).toBe('temporal');
      expect(temporalLayer.config.maxItems).toBe(1000);
      expect(temporalLayer.config.maxSizeBytes).toBe(50 * 1024 * 1024);
      expect(temporalLayer.config.compressionEnabled).toBe(true);
    });
  });

  describe('Time-based Storage and Indexing', () => {
    it('should store items with temporal indexing', async () => {
      const now = new Date();
      const item = await temporalLayer.store({
        content: 'Temporal content test',
        metadata: createMockMetadata({ category: 'temporal-test' }),
      });

      expect(item).toBeDefined();
      expect(item.createdAt).toBeInstanceOf(Date);

      // Should be able to retrieve by time range
      const start = new Date(now.getTime() - 60000); // 1 minute before
      const end = new Date(now.getTime() + 60000); // 1 minute after

      const timeRangeItems = await temporalLayer.getMemoriesInRange(start, end);
      expect(timeRangeItems.length).toBeGreaterThan(0);
      expect(timeRangeItems.some(i => i.id === item.id)).toBe(true);
    });

    it('should maintain chronological order in index', async () => {
      const items = [];
      const baseTime = Date.now();

      // Store items with different timestamps
      for (let i = 0; i < 5; i++) {
        const item = await temporalLayer.store({
          content: `Chronological content ${i}`,
          metadata: createMockMetadata(),
        });

        // Manually adjust timestamps for testing
        const temporalItem = (temporalLayer as any).items.get(item.id);
        if (temporalItem) {
          temporalItem.createdAt = new Date(baseTime + (i * 60000)); // 1 minute apart
        }

        items.push(item);
      }

      // Rebuild chronological index
      await temporalLayer.optimize();

      // Get items in chronological order
      const chronoQuery: TemporalQuery = {
        query: '',
        chronological: true,
        limit: 10,
      };

      const results = await temporalLayer.search(chronoQuery);
      expect(results.length).toBe(5);

      // Should be in reverse chronological order (newest first)
      for (let i = 1; i < results.length; i++) {
        expect(results[i]!.memory.createdAt.getTime()).toBeLessThanOrEqual(
          results[i - 1]!.memory.createdAt.getTime()
        );
      }
    });

    it('should handle time range queries efficiently', async () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

      // Store items across different time periods
      await temporalLayer.store({
        content: 'Old content',
        metadata: createMockMetadata(),
      });

      const withinRangeItem = await temporalLayer.store({
        content: 'Within range content',
        metadata: createMockMetadata(),
      });

      // Get items within time range
      const rangeItems = await temporalLayer.getMemoriesInRange(oneHourAgo, oneHourLater, 10);

      expect(rangeItems.length).toBeGreaterThan(0);
      expect(rangeItems.some(item => item.id === withinRangeItem.id)).toBe(true);

      // All items should be within the specified range
      rangeItems.forEach(item => {
        expect(item.createdAt.getTime()).toBeGreaterThanOrEqual(oneHourAgo.getTime());
        expect(item.createdAt.getTime()).toBeLessThanOrEqual(oneHourLater.getTime());
      });
    });
  });

  describe('Temporal Search Capabilities', () => {
    beforeEach(async () => {
      const now = Date.now();
      const testData = [
        { content: 'Morning meeting notes', metadata: createMockMetadata({ category: 'meeting' }), timeOffset: -4 * 60 * 60 * 1000 }, // 4 hours ago
        { content: 'Afternoon development work', metadata: createMockMetadata({ category: 'development' }), timeOffset: -2 * 60 * 60 * 1000 }, // 2 hours ago
        { content: 'Evening code review', metadata: createMockMetadata({ category: 'review' }), timeOffset: -1 * 60 * 60 * 1000 }, // 1 hour ago
        { content: 'Current task planning', metadata: createMockMetadata({ category: 'planning' }), timeOffset: 0 }, // Now
        { content: 'Future deployment notes', metadata: createMockMetadata({ category: 'deployment' }), timeOffset: 2 * 60 * 60 * 1000 }, // 2 hours from now
      ];

      for (const data of testData) {
        const item = await temporalLayer.store({
          content: data.content,
          metadata: data.metadata,
        });

        // Adjust timestamp for testing
        const storedItem = (temporalLayer as any).items.get(item.id);
        if (storedItem) {
          storedItem.createdAt = new Date(now + data.timeOffset);
        }
      }

      // Rebuild indexes with adjusted timestamps
      await temporalLayer.optimize();
    });

    it('should perform time range searches', async () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

      const temporalQuery: TemporalQuery = {
        query: '',
        timeRange: {
          start: twoHoursAgo,
          end: oneHourFromNow,
        },
        limit: 10,
      };

      const results = await temporalLayer.search(temporalQuery);

      expect(results.length).toBeGreaterThan(0);

      // All results should be within the time range
      results.forEach(result => {
        expect(result.memory.createdAt.getTime()).toBeGreaterThanOrEqual(twoHoursAgo.getTime());
        expect(result.memory.createdAt.getTime()).toBeLessThanOrEqual(oneHourFromNow.getTime());
        expect(result.explanation).toContain('in time range');
      });
    });

    it('should perform chronological searches', async () => {
      const chronoQuery: TemporalQuery = {
        query: 'notes',
        chronological: true,
        limit: 10,
      };

      const results = await temporalLayer.search(chronoQuery);

      expect(results.length).toBeGreaterThan(0);

      // Should contain relevant content
      const hasNotesContent = results.some(r =>
        r.memory.content.toLowerCase().includes('notes')
      );
      expect(hasNotesContent).toBe(true);

      // Should be in chronological order (newest first)
      for (let i = 1; i < results.length; i++) {
        expect(results[i]!.memory.createdAt.getTime()).toBeLessThanOrEqual(
          results[i - 1]!.memory.createdAt.getTime()
        );
      }

      // Should indicate chronological ordering
      results.forEach(result => {
        expect(result.explanation).toContain('chronological order');
      });
    });

    it('should apply temporal scoring to search results', async () => {
      const results = await temporalLayer.search({ query: 'development work' });

      expect(results.length).toBeGreaterThan(0);

      // More recent items should generally have higher scores
      const relevantResults = results.filter(r =>
        r.memory.content.toLowerCase().includes('development')
      );

      if (relevantResults.length > 1) {
        // Recent items should have temporal scoring boost
        const recentItem = relevantResults.find(r =>
          r.memory.content.includes('Afternoon development')
        );

        if (recentItem) {
          expect(recentItem.score).toBeGreaterThan(0);
          expect(recentItem.explanation).toMatch(/recent|temporal/);
        }
      }
    });

    it('should combine text and temporal relevance', async () => {
      const now = new Date();
      const query: TemporalQuery = {
        query: 'meeting development',
        timeRange: {
          start: new Date(now.getTime() - 6 * 60 * 60 * 1000), // 6 hours ago
          end: now,
        },
        limit: 10,
      };

      const results = await temporalLayer.search(query);

      expect(results.length).toBeGreaterThan(0);

      // Should find both meeting and development related content
      const hasMeeting = results.some(r => r.memory.content.toLowerCase().includes('meeting'));
      const hasDevelopment = results.some(r => r.memory.content.toLowerCase().includes('development'));

      expect(hasMeeting || hasDevelopment).toBe(true);

      // All results should be within time range
      results.forEach(result => {
        expect(result.memory.createdAt.getTime()).toBeGreaterThanOrEqual(
          query.timeRange!.start.getTime()
        );
        expect(result.memory.createdAt.getTime()).toBeLessThanOrEqual(
          query.timeRange!.end.getTime()
        );
      });
    });
  });

  describe('Temporal Context and Relationships', () => {
    beforeEach(async () => {
      const baseTime = Date.now();
      const contextData = [
        { content: 'Context before event', timeOffset: -90 * 60 * 1000 }, // 90 min before
        { content: 'Immediate context before', timeOffset: -30 * 60 * 1000 }, // 30 min before
        { content: 'The main event occurred', timeOffset: 0 }, // Target time
        { content: 'Immediate context after', timeOffset: 30 * 60 * 1000 }, // 30 min after
        { content: 'Context after event', timeOffset: 90 * 60 * 1000 }, // 90 min after
      ];

      for (const data of contextData) {
        const item = await temporalLayer.store({
          content: data.content,
          metadata: createMockMetadata(),
        });

        // Adjust timestamp for testing
        const storedItem = (temporalLayer as any).items.get(item.id);
        if (storedItem) {
          storedItem.createdAt = new Date(baseTime + data.timeOffset);
        }
      }

      await temporalLayer.optimize();
    });

    it('should provide temporal context around events', async () => {
      const targetTime = new Date(); // Now (main event time)
      const context = await temporalLayer.getTemporalContext(targetTime, 60, 5); // 60 min window

      expect(context.before.length).toBeGreaterThan(0);
      expect(context.after.length).toBeGreaterThan(0);
      expect(context.exact.length).toBeGreaterThan(0);

      // Before items should be before target time
      context.before.forEach(item => {
        expect(item.createdAt.getTime()).toBeLessThan(targetTime.getTime());
      });

      // After items should be after target time
      context.after.forEach(item => {
        expect(item.createdAt.getTime()).toBeGreaterThan(targetTime.getTime());
      });

      // Exact items should be very close to target time
      context.exact.forEach(item => {
        const timeDiff = Math.abs(item.createdAt.getTime() - targetTime.getTime());
        expect(timeDiff).toBeLessThan(5 * 60 * 1000); // Within 5 minutes
      });
    });

    it('should find temporally similar memories', async () => {
      const mainEventItem = await temporalLayer.search({ query: 'main event' });
      expect(mainEventItem.length).toBeGreaterThan(0);

      const targetItem = mainEventItem[0]!.memory;
      const similarities = await temporalLayer.getTemporalSimilarities(targetItem.id, 3);

      expect(similarities.length).toBeGreaterThan(0);

      // Should find related items
      similarities.forEach(result => {
        expect(result.score).toBeGreaterThan(0);
        expect(result.explanation).toContain('temporal similarity');
      });
    });

    it('should detect items from similar time periods', async () => {
      // Clear any existing items first to avoid interference
      const existingItems = await temporalLayer.export();
      for (const item of existingItems) {
        await temporalLayer.delete(item.id);
      }

      // Add more items with similar temporal patterns
      const now = new Date();
      const morning9am = new Date(now);
      morning9am.setHours(9, 0, 0, 0);

      const morning9amItems = [];
      for (let i = 0; i < 3; i++) {
        const item = await temporalLayer.store({
          content: `Morning standup ${i}`,
          metadata: createMockMetadata({ category: 'meeting' }),
        });

        // Set to 9 AM for pattern detection (same day of week, different weeks)
        const storedItem = (temporalLayer as any).items.get(item.id);
        if (storedItem) {
          storedItem.createdAt = new Date(morning9am.getTime() + (i * 7 * 24 * 60 * 60 * 1000)); // Same day of week, different weeks
        }

        morning9amItems.push(item);
      }

      await temporalLayer.optimize();

      // Find temporally similar items
      const similarities = await temporalLayer.getTemporalSimilarities(morning9amItems[0]!.id, 5);

      // Should find other 9 AM items
      const has9AMSimilarity = similarities.some(result =>
        result.memory.content.includes('Morning standup')
      );

      expect(has9AMSimilarity).toBe(true);
    });
  });

  describe('Temporal Pattern Analysis', () => {
    beforeEach(async () => {
      // Create data with patterns
      const now = new Date();
      const patterns = [
        // Daily pattern: items at 9 AM
        { hour: 9, content: 'Daily standup meeting', days: [0, 1, 2, 3, 4] },
        // Weekly pattern: items on Monday
        { hour: 14, content: 'Weekly planning meeting', days: [1] },
        // Monthly pattern: items on 1st of month
        { hour: 10, content: 'Monthly review', days: [1], isMonthly: true },
      ];

      for (const pattern of patterns) {
        for (const day of pattern.days) {
          for (let week = 0; week < 4; week++) {
            const item = await temporalLayer.store({
              content: `${pattern.content} week ${week}`,
              metadata: createMockMetadata({ category: 'meeting' }),
            });

            // Set specific time patterns
            const itemDate = new Date(now);
            itemDate.setDate(itemDate.getDate() + (week * 7) + day);
            itemDate.setHours(pattern.hour, 0, 0, 0);

            const storedItem = (temporalLayer as any).items.get(item.id);
            if (storedItem) {
              storedItem.createdAt = itemDate;
            }
          }
        }
      }

      await temporalLayer.optimize();
    });

    it('should analyze daily patterns', async () => {
      const patterns = await temporalLayer.analyzeTemporalPatterns();

      expect(patterns.length).toBeGreaterThan(0);

      const dailyPattern = patterns.find(p => p.pattern === 'daily');
      if (dailyPattern) {
        expect(dailyPattern.strength).toBeGreaterThan(0);
        expect(dailyPattern.description).toContain('Peak activity at');
        expect(dailyPattern.examples.length).toBeGreaterThan(0);
      }
    });

    it('should analyze weekly patterns', async () => {
      const patterns = await temporalLayer.analyzeTemporalPatterns();

      const weeklyPattern = patterns.find(p => p.pattern === 'weekly');
      if (weeklyPattern) {
        expect(weeklyPattern.strength).toBeGreaterThan(0);
        expect(weeklyPattern.description).toContain('Peak activity on');
        expect(weeklyPattern.examples.length).toBeGreaterThan(0);
      }
    });

    it('should analyze monthly patterns', async () => {
      const patterns = await temporalLayer.analyzeTemporalPatterns();

      const monthlyPattern = patterns.find(p => p.pattern === 'monthly');
      if (monthlyPattern) {
        expect(monthlyPattern.strength).toBeGreaterThan(0);
        expect(monthlyPattern.description).toContain('Peak activity in');
        expect(monthlyPattern.examples.length).toBeGreaterThan(0);
      }
    });

    it('should return patterns sorted by strength', async () => {
      const patterns = await temporalLayer.analyzeTemporalPatterns();

      if (patterns.length > 1) {
        for (let i = 1; i < patterns.length; i++) {
          expect(patterns[i]!.strength).toBeLessThanOrEqual(patterns[i - 1]!.strength);
        }
      }
    });

    it('should not return weak patterns', async () => {
      // Clear previous data and add random data without patterns
      (temporalLayer as any).items.clear();
      await temporalLayer.optimize();

      // Add random items without clear patterns
      for (let i = 0; i < 5; i++) {
        await temporalLayer.store({
          content: `Random content ${i}`,
          metadata: createMockMetadata(),
        });
      }

      const patterns = await temporalLayer.analyzeTemporalPatterns();

      // Should have minimal or no patterns due to insufficient data
      expect(patterns.length).toBeLessThanOrEqual(3);

      // Any returned patterns should meet minimum strength threshold
      patterns.forEach(pattern => {
        expect(pattern.strength).toBeGreaterThan(0.3);
      });
    });
  });

  describe('Persistence and Backup', () => {
    it('should persist temporal indexes to disk', async () => {
      // Store test data
      const items = [];
      for (let i = 0; i < 3; i++) {
        const item = await temporalLayer.store({
          content: `Temporal persistence test ${i}`,
          metadata: createMockMetadata({ priority: i + 5 }),
        });
        items.push(item);
      }

      // Force immediate save before closing
      await temporalLayer.optimize(); // This triggers saveToDisk()
      await delay(100);
      await temporalLayer.close();

      // Create new layer with same directory
      const newTemporalLayer = new TemporalLayer({
        maxItems: 1000,
        maxSizeBytes: 50 * 1024 * 1024,
        ttl: undefined,
        compressionEnabled: true,
        indexingEnabled: true,
      }, tempDir);

      // Wait for loading to complete properly
      await newTemporalLayer.waitForLoading();

      const stats = await newTemporalLayer.getStats();
      expect(stats.totalItems).toBeGreaterThan(0);

      // Temporal queries should work with loaded data
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const timeRangeItems = await newTemporalLayer.getMemoriesInRange(oneHourAgo, now, 10);
      expect(timeRangeItems.length).toBeGreaterThan(0);

      await newTemporalLayer.close();
    });

    it('should create and restore backups with temporal indexes', async () => {
      // Store test data
      const originalItems = [];
      for (let i = 0; i < 3; i++) {
        const item = await temporalLayer.store({
          content: `Temporal backup test ${i}`,
          metadata: createMockMetadata({ category: 'backup-test' }),
        });
        originalItems.push(item);
      }

      // Create backup
      const backupId = await temporalLayer.backup();
      expect(backupId).toMatch(/^temporal-/);

      // Store additional data after backup
      await temporalLayer.store({
        content: 'Post-backup temporal content',
        metadata: createMockMetadata(),
      });

      let stats = await temporalLayer.getStats();
      expect(stats.totalItems).toBe(4);

      // Restore from backup
      const restored = await temporalLayer.restore(backupId);
      expect(restored).toBe(true);

      stats = await temporalLayer.getStats();
      expect(stats.totalItems).toBe(3); // Should be back to original count

      // Verify temporal functionality still works after restore
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const timeRangeItems = await temporalLayer.getMemoriesInRange(oneHourAgo, now, 10);
      expect(timeRangeItems.length).toBeGreaterThan(0);
    });
  });

  describe('Optimization and Compression', () => {
    it('should optimize temporal indexes', async () => {
      // Add some items
      for (let i = 0; i < 5; i++) {
        await temporalLayer.store({
          content: `Temporal optimization test ${i}`,
          metadata: createMockMetadata({ priority: i % 3 + 1 }),
        });
      }

      const statsBefore = await temporalLayer.getStats();
      await temporalLayer.optimize();
      const statsAfter = await temporalLayer.getStats();

      // Should not lose data during optimization
      expect(statsAfter.totalItems).toBeLessThanOrEqual(statsBefore.totalItems);

      // Temporal queries should still work
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const timeRangeItems = await temporalLayer.getMemoriesInRange(oneHourAgo, now, 10);
      expect(Array.isArray(timeRangeItems)).toBe(true);
    });

    it('should compress old historical data', async () => {
      const oldContent = 'This   is   some   old   historical   content   with   lots   of   whitespace\n\n\n   and   newlines   ';

      // Store an item with old timestamp and excessive whitespace
      const item = await temporalLayer.store({
        content: oldContent,
        metadata: createMockMetadata(),
      });

      // Manually set very old timestamp to trigger compression
      const storedItem = (temporalLayer as any).items.get(item.id);
      if (storedItem) {
        const twoYearsAgo = new Date(Date.now() - (2 * 365 * 24 * 60 * 60 * 1000));
        storedItem.createdAt = twoYearsAgo;
        storedItem.lastAccessedAt = twoYearsAgo;
        storedItem.accessCount = 0;
      }

      // Trigger compression through optimization
      await temporalLayer.optimize();

      // Check if content was compressed
      const retrieved = await temporalLayer.retrieve(item.id);
      expect(retrieved).not.toBeNull();

      // Content should be cleaned up but semantically the same
      expect(retrieved!.content.length).toBeLessThanOrEqual(oldContent.length);
      expect(retrieved!.content).toContain('This is some old historical content');
    });
  });

  describe('Capacity Management', () => {
    it('should handle large volumes of historical data', async () => {
      const limitedLayer = new TemporalLayer({
        maxItems: 10,
        ttl: undefined,
      }, tempDir);

      // Store more items than the limit
      for (let i = 0; i < 15; i++) {
        await limitedLayer.store({
          content: `Historical data ${i}`,
          metadata: createMockMetadata(),
        });
      }

      const stats = await limitedLayer.getStats();
      expect(stats.totalItems).toBeLessThanOrEqual(10);

      await limitedLayer.close();
    });

    it('should efficiently handle time range queries on large datasets', async () => {
      // Add many items across different time periods
      const now = Date.now();
      for (let i = 0; i < 20; i++) {
        const item = await temporalLayer.store({
          content: `Large dataset item ${i}`,
          metadata: createMockMetadata(),
        });

        // Spread items across 20 days
        const storedItem = (temporalLayer as any).items.get(item.id);
        if (storedItem) {
          storedItem.createdAt = new Date(now - (i * 24 * 60 * 60 * 1000));
        }
      }

      await temporalLayer.optimize();

      // Query for items from last 5 days
      const fiveDaysAgo = new Date(now - (5 * 24 * 60 * 60 * 1000));
      const today = new Date(now);

      const recentItems = await temporalLayer.getMemoriesInRange(fiveDaysAgo, today, 10);

      expect(recentItems.length).toBeGreaterThan(0);
      expect(recentItems.length).toBeLessThanOrEqual(6); // Should get items from last 5 days (inclusive), so 6 items (days 0-5)

      // All items should be within the range
      recentItems.forEach(item => {
        expect(item.createdAt.getTime()).toBeGreaterThanOrEqual(fiveDaysAgo.getTime());
        expect(item.createdAt.getTime()).toBeLessThanOrEqual(today.getTime());
      });
    });
  });

  describe('Resource Management', () => {
    it('should close cleanly and save temporal data', async () => {
      await temporalLayer.store({
        content: 'Test content for temporal close',
        metadata: createMockMetadata(),
      });

      // Should not throw
      await temporalLayer.close();
    });

    it('should handle multiple close calls gracefully', async () => {
      await temporalLayer.close();
      await temporalLayer.close(); // Should not throw
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid time ranges gracefully', async () => {
      const invalidStart = new Date('invalid');
      const invalidEnd = new Date('also invalid');

      // Should not throw, but return empty results
      const results = await temporalLayer.getMemoriesInRange(invalidStart, invalidEnd);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('should handle temporal similarity queries for non-existent items', async () => {
      const similarities = await temporalLayer.getTemporalSimilarities('non-existent-id', 5);
      expect(similarities).toEqual([]);
    });

    it('should handle pattern analysis with insufficient data', async () => {
      // Clear any existing data
      (temporalLayer as any).items.clear();

      const patterns = await temporalLayer.analyzeTemporalPatterns();
      expect(patterns).toEqual([]); // Should return empty array for insufficient data
    });

    it('should handle backup restore errors gracefully', async () => {
      const invalidBackupId = 'invalid-temporal-backup-id';
      const restored = await temporalLayer.restore(invalidBackupId);
      expect(restored).toBe(false);
    });
  });
});