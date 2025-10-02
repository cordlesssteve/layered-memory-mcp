/**
 * Integration tests for Monitoring Integration
 * Real integration tests without mocking
 */

import { describe, expect, it } from '@jest/globals';
import {
  MonitoredSecurityMiddleware,
  createMonitoringService,
} from '../../src/monitoring/monitoring-integration.js';
import { TelemetrySystem } from '../../src/monitoring/telemetry.js';
import { PerformanceMonitor } from '../../src/monitoring/performance-monitor.js';
import type { Environment } from '../../src/config/environment.js';

const testEnv: Environment = {
  nodeEnv: 'test',
  logLevel: 'info',
  telemetryEnabled: true,
  performanceMonitoringEnabled: true,
} as Environment;

describe('MonitoringIntegration', () => {
  describe('MonitoredSecurityMiddleware', () => {
    it('should create monitored security middleware', () => {
      const telemetry = new TelemetrySystem(testEnv);
      const performanceMonitor = new PerformanceMonitor(telemetry);

      const middleware = new MonitoredSecurityMiddleware(testEnv, telemetry, performanceMonitor);

      expect(middleware).toBeDefined();
    });

    it('should track security check performance', async () => {
      const telemetry = new TelemetrySystem(testEnv);
      const performanceMonitor = new PerformanceMonitor(telemetry);

      const middleware = new MonitoredSecurityMiddleware(testEnv, telemetry, performanceMonitor, {
        enabled: true,
        requireAuth: false,
        rateLimit: { enabled: false },
        validation: { enabled: false },
      });

      const result = await middleware.checkRequest('test_request', {
        sessionId: 'test-session',
      });

      expect(result).toBeDefined();
      expect(result.allowed).toBeDefined();

      const perfStats = performanceMonitor.getStats();
      expect(perfStats.activeOperations).toBeGreaterThanOrEqual(0);
    });

    it('should record security metrics for allowed requests', async () => {
      const telemetry = new TelemetrySystem(testEnv);
      const performanceMonitor = new PerformanceMonitor(telemetry);

      const middleware = new MonitoredSecurityMiddleware(testEnv, telemetry, performanceMonitor, {
        enabled: true,
        requireAuth: false,
      });

      await middleware.checkRequest('allowed_test', {
        sessionId: 'test-session',
      });

      const metrics = telemetry.getMetrics('security_check');

      expect(metrics.length).toBeGreaterThan(0);
    });

    it('should record security metrics for blocked requests', async () => {
      const telemetry = new TelemetrySystem(testEnv);
      const performanceMonitor = new PerformanceMonitor(telemetry);

      const middleware = new MonitoredSecurityMiddleware(testEnv, telemetry, performanceMonitor, {
        enabled: true,
        requireAuth: true,
        allowedUsers: [],
      });

      await middleware.checkRequest('blocked_test', {
        sessionId: 'test-session',
      });

      const metrics = telemetry.getMetrics('security_blocked');

      expect(metrics.length).toBeGreaterThan(0);
    });
  });

  describe('createMonitoringService', () => {
    it('should create complete monitoring service', () => {
      const service = createMonitoringService(testEnv, {
        telemetry: {
          enabled: true,
          metricsRetentionMs: 60000,
          exportMetrics: false,
        },
        performance: {
          enabled: true,
          slowOperationMs: 1000,
          alerting: false,
        },
        healthChecks: {
          enabled: true,
          intervalMs: 5000,
        },
      });

      expect(service).toBeDefined();
      expect(service.getTelemetry()).toBeDefined();
      expect(service.getPerformanceMonitor()).toBeDefined();
      expect(service.createMonitoredRouter).toBeDefined();
    });

    it('should integrate telemetry with performance monitor', () => {
      const service = createMonitoringService(testEnv);

      expect(service.getTelemetry()).toBeDefined();
      expect(service.getPerformanceMonitor()).toBeDefined();

      // Performance monitor should use the telemetry system
      const perfStats = service.getPerformanceMonitor().getStats();
      expect(perfStats).toBeDefined();
    });

    it('should allow disabling telemetry', () => {
      const service = createMonitoringService(testEnv, {
        telemetry: {
          enabled: false,
          metricsRetentionMs: 60000,
          exportMetrics: false,
        },
        performance: {
          enabled: true,
          slowOperationMs: 1000,
          alerting: false,
        },
        healthChecks: {
          enabled: false,
          intervalMs: 5000,
        },
      });

      expect(service).toBeDefined();
    });
  });

  describe('integrated monitoring flow', () => {
    it('should track end-to-end request flow', async () => {
      const service = createMonitoringService(testEnv);

      // Track an operation
      const result = await service
        .getPerformanceMonitor()
        .trackOperation('test_operation', async () => {
          return { success: true };
        });

      expect(result.success).toBe(true);

      // Check telemetry
      const metricNames = service.getTelemetry().getMetricNames();
      expect(metricNames.length).toBeGreaterThan(0);

      // Check performance
      const perfStats = service.getPerformanceMonitor().getStats();
      expect(perfStats.activeOperations).toBeGreaterThanOrEqual(0);
    });

    it('should track multiple concurrent operations', async () => {
      const service = createMonitoringService(testEnv);
      const performanceMonitor = service.getPerformanceMonitor();

      const operations = [
        performanceMonitor.trackOperation('op1', async () => ({ result: 1 })),
        performanceMonitor.trackOperation('op2', async () => ({ result: 2 })),
        performanceMonitor.trackOperation('op3', async () => ({ result: 3 })),
      ];

      const results = await Promise.all(operations);

      expect(results).toHaveLength(3);
      expect(results[0]?.result).toBe(1);
      expect(results[1]?.result).toBe(2);
      expect(results[2]?.result).toBe(3);

      const perfStats = performanceMonitor.getStats();
      expect(perfStats.performanceMetrics.requestCount).toBeGreaterThanOrEqual(3);
    });

    it('should record performance alerts for slow operations', async () => {
      const service = createMonitoringService(testEnv, {
        telemetry: { enabled: true, metricsRetentionMs: 60000, exportMetrics: false },
        performance: { enabled: true, slowOperationMs: 10, alerting: true },
        healthChecks: { enabled: false, intervalMs: 5000 },
      });

      const performanceMonitor = service.getPerformanceMonitor();
      let alertReceived = false;
      performanceMonitor.onAlert(alert => {
        alertReceived = true;
        expect(alert.type).toBe('slow_operation');
      });

      await performanceMonitor.trackOperation('slow_test', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { done: true };
      });

      expect(alertReceived).toBe(true);
    });

    it('should maintain separate metric namespaces', async () => {
      const service = createMonitoringService(testEnv);
      const telemetry = service.getTelemetry();

      // Record different types of metrics
      telemetry.recordMetric({
        name: 'custom_metric_1',
        value: 100,
        unit: 'count',
      });

      telemetry.recordMetric({
        name: 'custom_metric_2',
        value: 200,
        unit: 'duration_ms',
      });

      const [metric1] = telemetry.getMetrics('custom_metric_1');
      const [metric2] = telemetry.getMetrics('custom_metric_2');

      expect(metric1).toBeDefined();
      expect(metric1?.value).toBe(100);

      expect(metric2).toBeDefined();
      expect(metric2?.value).toBe(200);
    });
  });
});
