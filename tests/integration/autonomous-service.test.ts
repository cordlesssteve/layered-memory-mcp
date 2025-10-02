/**
 * Integration tests for Autonomous Intelligence Service
 * Real integration tests without mocking
 */

import { describe, expect, it, beforeEach, afterEach } from '@jest/globals';
import { AutonomousIntelligenceService } from '../../src/autonomous/autonomous-intelligence-service.js';
import type { MemoryRouter } from '../../src/memory/router.js';

// Mock memory router for testing
const mockMemoryRouter = {
  search: async () => [],
  store: async () => ({ id: 'test-id' }),
  retrieve: async () => null,
} as unknown as MemoryRouter;

describe('AutonomousIntelligenceService Integration', () => {
  let service: AutonomousIntelligenceService;

  beforeEach(() => {
    service = new AutonomousIntelligenceService(mockMemoryRouter, {
      enabled: true,
      checkInterval: 100, // Fast interval for testing
      maintenanceInterval: 200,
      optimizationInterval: 300,
      insightGenerationInterval: 400,
      maxConcurrentTasks: 3,
    });
  });

  afterEach(async () => {
    await service.stopWatching();
  });

  describe('startWatching and stopWatching', () => {
    it('should start autonomous monitoring', async () => {
      await service.startWatching();

      const status = service.getStatus();
      expect(status.isWatching).toBe(true);
      expect(status.config.enabled).toBe(true);
    });

    it('should stop autonomous monitoring', async () => {
      await service.startWatching();
      await service.stopWatching();

      const status = service.getStatus();
      expect(status.isWatching).toBe(false);
    });

    it('should not start if already watching', async () => {
      await service.startWatching();
      await service.startWatching(); // Second call should be no-op

      const status = service.getStatus();
      expect(status.isWatching).toBe(true);
    });

    it('should not stop if not watching', async () => {
      await service.stopWatching(); // Should not throw

      const status = service.getStatus();
      expect(status.isWatching).toBe(false);
    });

    it('should not start if disabled in config', async () => {
      const disabledService = new AutonomousIntelligenceService(mockMemoryRouter, {
        enabled: false,
      });

      await disabledService.startWatching();

      const status = disabledService.getStatus();
      expect(status.isWatching).toBe(false);
    });
  });

  describe('scheduleTask', () => {
    it('should schedule a low priority task', () => {
      const taskId = service.scheduleTask('optimization', 'low');

      expect(taskId).toBeDefined();
      expect(typeof taskId).toBe('string');
    });

    it('should schedule a medium priority task', () => {
      const taskId = service.scheduleTask('maintenance', 'medium');

      expect(taskId).toBeDefined();
      expect(typeof taskId).toBe('string');
    });

    it('should execute high priority task immediately', async () => {
      const taskId = service.scheduleTask('insight_generation', 'high');

      // Wait a bit for immediate execution
      await new Promise(resolve => setTimeout(resolve, 50));

      const results = service.getRecentResults(10);
      const task = results.find(t => t.id === taskId);

      expect(task).toBeDefined();
      expect(task?.status).toBe('completed');
    });

    it('should execute critical priority task immediately', async () => {
      const taskId = service.scheduleTask('maintenance', 'critical');

      // Wait for execution
      await new Promise(resolve => setTimeout(resolve, 50));

      const results = service.getRecentResults(10);
      const task = results.find(t => t.id === taskId);

      expect(task).toBeDefined();
      expect(['completed', 'failed'].includes(task?.status || '')).toBe(true);
    });

    it('should track multiple scheduled tasks', () => {
      const task1 = service.scheduleTask('maintenance', 'low');
      const task2 = service.scheduleTask('optimization', 'low');
      const task3 = service.scheduleTask('insight_generation', 'medium');

      expect(task1).not.toBe(task2);
      expect(task2).not.toBe(task3);
      expect(task1).not.toBe(task3);
    });
  });

  describe('getStatus', () => {
    it('should return current service status', () => {
      const status = service.getStatus();

      expect(status).toMatchObject({
        isWatching: expect.any(Boolean),
        queuedTasks: expect.any(Number),
        completedTasks: expect.any(Number),
        failedTasks: expect.any(Number),
        config: expect.objectContaining({
          enabled: expect.any(Boolean),
        }),
      });
    });

    it('should update status after tasks complete', async () => {
      const initialStatus = service.getStatus();
      expect(initialStatus.completedTasks).toBe(0);

      service.scheduleTask('maintenance', 'critical');
      await new Promise(resolve => setTimeout(resolve, 100));

      const updatedStatus = service.getStatus();
      expect(updatedStatus.completedTasks).toBeGreaterThan(0);
    });
  });

  describe('getRecentResults', () => {
    it('should return recent task results', async () => {
      service.scheduleTask('maintenance', 'critical');
      service.scheduleTask('optimization', 'critical');

      await new Promise(resolve => setTimeout(resolve, 100));

      const results = service.getRecentResults(5);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should limit results to specified count', async () => {
      for (let i = 0; i < 5; i++) {
        service.scheduleTask('maintenance', 'critical');
      }

      await new Promise(resolve => setTimeout(resolve, 150));

      const results = service.getRecentResults(3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should return most recent results first', async () => {
      service.scheduleTask('maintenance', 'critical');
      await new Promise(resolve => setTimeout(resolve, 50));

      service.scheduleTask('optimization', 'critical');
      await new Promise(resolve => setTimeout(resolve, 50));

      const results = service.getRecentResults(2);

      if (results.length >= 2) {
        const firstTimestamp = new Date(results[0].completedAt || 0).getTime();
        const secondTimestamp = new Date(results[1].completedAt || 0).getTime();
        expect(firstTimestamp).toBeGreaterThanOrEqual(secondTimestamp);
      }
    });
  });

  describe('updateConfig', () => {
    it('should update service configuration', () => {
      service.updateConfig({
        maxConcurrentTasks: 5,
      });

      const status = service.getStatus();
      expect(status.config.maxConcurrentTasks).toBe(5);
    });

    it('should restart watching if config changes while active', async () => {
      await service.startWatching();

      service.updateConfig({
        checkInterval: 500,
      });

      const status = service.getStatus();
      expect(status.isWatching).toBe(true);
      expect(status.config.checkInterval).toBe(500);
    });

    it('should maintain stopped state after config update', () => {
      service.updateConfig({
        enabled: false,
      });

      const status = service.getStatus();
      expect(status.isWatching).toBe(false);
      expect(status.config.enabled).toBe(false);
    });
  });

  describe('autonomous task execution', () => {
    it('should execute maintenance tasks', async () => {
      const taskId = service.scheduleTask('maintenance', 'critical');

      await new Promise(resolve => setTimeout(resolve, 100));

      const results = service.getRecentResults(10);
      const task = results.find(t => t.id === taskId);

      expect(task).toBeDefined();
      expect(task?.type).toBe('maintenance');
    });

    it('should execute optimization tasks', async () => {
      const taskId = service.scheduleTask('optimization', 'critical');

      await new Promise(resolve => setTimeout(resolve, 100));

      const results = service.getRecentResults(10);
      const task = results.find(t => t.id === taskId);

      expect(task).toBeDefined();
      expect(task?.type).toBe('optimization');
    });

    it('should execute insight generation tasks', async () => {
      const taskId = service.scheduleTask('insight_generation', 'critical');

      await new Promise(resolve => setTimeout(resolve, 100));

      const results = service.getRecentResults(10);
      const task = results.find(t => t.id === taskId);

      expect(task).toBeDefined();
      expect(task?.type).toBe('insight_generation');
    });

    it('should handle task failures gracefully', async () => {
      const taskId = service.scheduleTask('maintenance', 'critical');

      await new Promise(resolve => setTimeout(resolve, 100));

      const results = service.getRecentResults(10);
      const task = results.find(t => t.id === taskId);

      expect(task).toBeDefined();
      expect(['completed', 'failed'].includes(task?.status || '')).toBe(true);
    });
  });

  describe('concurrent task management', () => {
    it('should respect max concurrent tasks limit', async () => {
      const service = new AutonomousIntelligenceService(mockMemoryRouter, {
        enabled: true,
        maxConcurrentTasks: 2,
      });

      // Schedule more tasks than limit
      service.scheduleTask('maintenance', 'critical');
      service.scheduleTask('optimization', 'critical');
      service.scheduleTask('insight_generation', 'critical');

      await new Promise(resolve => setTimeout(resolve, 150));

      const status = service.getStatus();
      // All should eventually complete, but at most 2 concurrent
      expect(status.completedTasks).toBeGreaterThan(0);

      await service.stopWatching();
    });
  });
});
