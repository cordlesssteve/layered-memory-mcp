/**
 * Version Tracker Tests
 * Sprint 3 - Relationship Engine
 * Target: >35% coverage (currently 21.73%)
 */

import { VersionTracker } from '../../../src/memory/relationships/version-tracker.js';

describe('VersionTracker', () => {
  let tracker: VersionTracker;

  beforeEach(() => {
    tracker = new VersionTracker();
  });

  // ============================================================================
  // TRACK VERSION (6 tests)
  // ============================================================================

  describe('trackVersion', () => {
    test('should track a new version', () => {
      const version = tracker.trackVersion(
        'mem-1',
        'created',
        { content: { old: '', new: 'New content' } },
        'user-1'
      );

      expect(version).toBeDefined();
      expect(version.id).toBe('mem-1-v1');
      expect(version.memoryId).toBe('mem-1');
      expect(version.version).toBe(1);
      expect(version.changeType).toBe('created');
      expect(version.createdBy).toBe('user-1');
      expect(version.changes.content).toEqual({ old: '', new: 'New content' });
    });

    test('should increment version numbers', () => {
      const v1 = tracker.trackVersion('mem-1', 'created', {}, 'user-1');
      const v2 = tracker.trackVersion('mem-1', 'updated', {}, 'user-1');
      const v3 = tracker.trackVersion('mem-1', 'updated', {}, 'user-1');

      expect(v1.version).toBe(1);
      expect(v2.version).toBe(2);
      expect(v3.version).toBe(3);
    });

    test('should track versions for different memories independently', () => {
      const v1 = tracker.trackVersion('mem-1', 'created', {}, 'user-1');
      const v2 = tracker.trackVersion('mem-2', 'created', {}, 'user-1');

      expect(v1.id).toBe('mem-1-v1');
      expect(v2.id).toBe('mem-2-v1');
    });

    test('should handle parent version ID', () => {
      const v1 = tracker.trackVersion('mem-1', 'created', {}, 'user-1');
      const v2 = tracker.trackVersion('mem-1', 'updated', {}, 'user-1', v1.id);

      expect(v2.parentVersionId).toBe(v1.id);
    });

    test('should track different change types', () => {
      const created = tracker.trackVersion('mem-1', 'created', {}, 'user-1');
      const updated = tracker.trackVersion('mem-2', 'updated', {}, 'user-1');
      const merged = tracker.trackVersion('mem-3', 'merged', {}, 'user-1');
      const split = tracker.trackVersion('mem-4', 'split', {}, 'user-1');
      const archived = tracker.trackVersion('mem-5', 'archived', {}, 'user-1');

      expect(created.changeType).toBe('created');
      expect(updated.changeType).toBe('updated');
      expect(merged.changeType).toBe('merged');
      expect(split.changeType).toBe('split');
      expect(archived.changeType).toBe('archived');
    });

    test('should set createdAt timestamp', () => {
      const before = new Date();
      const version = tracker.trackVersion('mem-1', 'created', {}, 'user-1');
      const after = new Date();

      expect(version.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(version.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  // ============================================================================
  // GET VERSIONS (3 tests)
  // ============================================================================

  describe('getVersions', () => {
    test('should return all versions for a memory', () => {
      tracker.trackVersion('mem-1', 'created', {}, 'user-1');
      tracker.trackVersion('mem-1', 'updated', {}, 'user-1');
      tracker.trackVersion('mem-1', 'updated', {}, 'user-1');

      const versions = tracker.getVersions('mem-1');

      expect(versions.length).toBe(3);
      expect(versions[0]!.version).toBe(1);
      expect(versions[1]!.version).toBe(2);
      expect(versions[2]!.version).toBe(3);
    });

    test('should return empty array for memory with no versions', () => {
      const versions = tracker.getVersions('non-existent');
      expect(versions).toEqual([]);
    });

    test('should return versions for specific memory only', () => {
      tracker.trackVersion('mem-1', 'created', {}, 'user-1');
      tracker.trackVersion('mem-1', 'updated', {}, 'user-1');
      tracker.trackVersion('mem-2', 'created', {}, 'user-1');

      const versionsForMem1 = tracker.getVersions('mem-1');
      const versionsForMem2 = tracker.getVersions('mem-2');

      expect(versionsForMem1.length).toBe(2);
      expect(versionsForMem2.length).toBe(1);
    });
  });

  // ============================================================================
  // GET LATEST VERSION (4 tests)
  // ============================================================================

  describe('getLatestVersion', () => {
    test('should return the latest version', () => {
      tracker.trackVersion('mem-1', 'created', {}, 'user-1');
      tracker.trackVersion('mem-1', 'updated', {}, 'user-1');
      const v3 = tracker.trackVersion('mem-1', 'updated', {}, 'user-1');

      const latest = tracker.getLatestVersion('mem-1');

      expect(latest).toEqual(v3);
      expect(latest?.version).toBe(3);
    });

    test('should return null for memory with no versions', () => {
      const latest = tracker.getLatestVersion('non-existent');
      expect(latest).toBeNull();
    });

    test('should return first version if only one exists', () => {
      const v1 = tracker.trackVersion('mem-1', 'created', {}, 'user-1');
      const latest = tracker.getLatestVersion('mem-1');

      expect(latest).toEqual(v1);
      expect(latest?.version).toBe(1);
    });

    test('should handle multiple memories independently', () => {
      tracker.trackVersion('mem-1', 'created', {}, 'user-1');
      tracker.trackVersion('mem-2', 'created', {}, 'user-1');
      tracker.trackVersion('mem-2', 'updated', {}, 'user-1');

      const latest1 = tracker.getLatestVersion('mem-1');
      const latest2 = tracker.getLatestVersion('mem-2');

      expect(latest1?.version).toBe(1);
      expect(latest2?.version).toBe(2);
    });
  });

  // ============================================================================
  // GET VERSION BY ID (4 tests)
  // ============================================================================

  describe('getVersionById', () => {
    test('should find a version by ID', () => {
      tracker.trackVersion('mem-1', 'created', {}, 'user-1');
      const v2 = tracker.trackVersion('mem-1', 'updated', {}, 'user-1');

      const found = tracker.getVersionById(v2.id);

      expect(found).toEqual(v2);
      expect(found?.id).toBe('mem-1-v2');
    });

    test('should return null for non-existent version ID', () => {
      tracker.trackVersion('mem-1', 'created', {}, 'user-1');

      const found = tracker.getVersionById('non-existent-id');

      expect(found).toBeNull();
    });

    test('should search across all memories', () => {
      tracker.trackVersion('mem-1', 'created', {}, 'user-1');
      const v2 = tracker.trackVersion('mem-2', 'created', {}, 'user-1');
      tracker.trackVersion('mem-3', 'created', {}, 'user-1');

      const found = tracker.getVersionById(v2.id);

      expect(found).toEqual(v2);
      expect(found?.memoryId).toBe('mem-2');
    });

    test('should find any version regardless of position', () => {
      const v1 = tracker.trackVersion('mem-1', 'created', {}, 'user-1');
      tracker.trackVersion('mem-1', 'updated', {}, 'user-1');
      tracker.trackVersion('mem-1', 'updated', {}, 'user-1');

      const found = tracker.getVersionById(v1.id);

      expect(found).toEqual(v1);
      expect(found?.version).toBe(1);
    });
  });

  // ============================================================================
  // GET VERSION EVOLUTION PATH (4 tests)
  // ============================================================================

  describe('getVersionEvolutionPath', () => {
    test('should return versions sorted by version number', () => {
      tracker.trackVersion('mem-1', 'created', {}, 'user-1');
      tracker.trackVersion('mem-1', 'updated', {}, 'user-1');
      tracker.trackVersion('mem-1', 'updated', {}, 'user-1');

      const path = tracker.getVersionEvolutionPath('mem-1');

      expect(path.length).toBe(3);
      expect(path[0]!.version).toBe(1);
      expect(path[1]!.version).toBe(2);
      expect(path[2]!.version).toBe(3);
    });

    test('should return empty array for non-existent memory', () => {
      const path = tracker.getVersionEvolutionPath('non-existent');
      expect(path).toEqual([]);
    });

    test('should return single version for memory with one version', () => {
      tracker.trackVersion('mem-1', 'created', {}, 'user-1');

      const path = tracker.getVersionEvolutionPath('mem-1');

      expect(path.length).toBe(1);
      expect(path[0]!.version).toBe(1);
    });

    test('should maintain chronological order', () => {
      const v1 = tracker.trackVersion('mem-1', 'created', {}, 'user-1');
      const v2 = tracker.trackVersion('mem-1', 'updated', {}, 'user-1');
      const v3 = tracker.trackVersion('mem-1', 'merged', {}, 'user-1');

      const path = tracker.getVersionEvolutionPath('mem-1');

      expect(path[0]!.id).toBe(v1.id);
      expect(path[1]!.id).toBe(v2.id);
      expect(path[2]!.id).toBe(v3.id);
    });
  });

  // ============================================================================
  // ALL VERSIONS GETTER (3 tests)
  // ============================================================================

  describe('allVersions', () => {
    test('should return all versions for all memories', () => {
      tracker.trackVersion('mem-1', 'created', {}, 'user-1');
      tracker.trackVersion('mem-1', 'updated', {}, 'user-1');
      tracker.trackVersion('mem-2', 'created', {}, 'user-1');

      const all = tracker.allVersions;

      expect(all.size).toBe(2);
      expect(all.get('mem-1')?.length).toBe(2);
      expect(all.get('mem-2')?.length).toBe(1);
    });

    test('should return a copy of the versions map', () => {
      tracker.trackVersion('mem-1', 'created', {}, 'user-1');

      const all1 = tracker.allVersions;
      const all2 = tracker.allVersions;

      expect(all1).not.toBe(all2); // Different instances
      expect(all1.size).toBe(all2.size); // Same content
    });

    test('should return empty map when no versions exist', () => {
      const all = tracker.allVersions;

      expect(all.size).toBe(0);
      expect(all instanceof Map).toBe(true);
    });
  });

  // ============================================================================
  // INTEGRATION TESTS (3 tests)
  // ============================================================================

  describe('Integration', () => {
    test('should track complete version history with metadata changes', () => {
      const v1 = tracker.trackVersion(
        'mem-1',
        'created',
        { content: { old: '', new: 'Initial content' } },
        'user-1'
      );

      const v2 = tracker.trackVersion(
        'mem-1',
        'updated',
        {
          content: { old: 'Initial content', new: 'Updated content' },
          metadata: { old: { priority: 5 }, new: { priority: 8 } },
        },
        'user-1',
        v1.id
      );

      tracker.trackVersion(
        'mem-1',
        'merged',
        {
          content: { old: 'Updated content', new: 'Merged content' },
        },
        'user-2',
        v2.id
      );

      const history = tracker.getVersionEvolutionPath('mem-1');

      expect(history.length).toBe(3);
      expect(history[0]!.changeType).toBe('created');
      expect(history[1]!.changeType).toBe('updated');
      expect(history[1]!.parentVersionId).toBe(v1.id);
      expect(history[2]!.changeType).toBe('merged');
      expect(history[2]!.parentVersionId).toBe(v2.id);
    });

    test('should handle branching version history', () => {
      const v1 = tracker.trackVersion('mem-1', 'created', {}, 'user-1');

      // Create two branches from v1
      tracker.trackVersion('mem-2', 'split', {}, 'user-1', v1.id);
      tracker.trackVersion('mem-3', 'split', {}, 'user-1', v1.id);

      const mem2Versions = tracker.getVersions('mem-2');
      const mem3Versions = tracker.getVersions('mem-3');

      expect(mem2Versions.length).toBe(1);
      expect(mem3Versions.length).toBe(1);
      expect(mem2Versions[0]!.parentVersionId).toBe(v1.id);
      expect(mem3Versions[0]!.parentVersionId).toBe(v1.id);
    });

    test('should track versions with complex change structures', () => {
      const complexChanges = {
        content: {
          old: 'Old content',
          new: 'New content',
        },
        metadata: {
          old: { tags: ['old-tag'], priority: 5 },
          new: { tags: ['new-tag', 'updated'], priority: 8 },
        },
      };

      const version = tracker.trackVersion('mem-1', 'updated', complexChanges, 'user-1');

      expect(version.changes).toEqual(complexChanges);
      expect(version.changes.content?.old).toBe('Old content');
      expect(version.changes.metadata?.new).toEqual({
        tags: ['new-tag', 'updated'],
        priority: 8,
      });
    });
  });
});
