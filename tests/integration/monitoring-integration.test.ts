/**
 * Integration tests for Monitoring Integration
 * Real integration tests without mocking
 */

import { describe, expect, it } from '@jest/globals';
import {
  MonitoredSecurityMiddleware,
  createMonitoringIntegration,
} from '../../src/monitoring/monitoring-integration.js';
import { TelemetrySystem } from '../../src/monitoring/telemetry.js';
import { PerformanceMonitor } from '../../src/monitoring/performance-monitor.js';
import type { Environment } from '../../src/config/environment.js';

const testEnv: Environment = {
  nodeEnv: 'test',
  port: 3000,
  logLevel: 'info',
  enableTelemetry: true,
  enablePerformanceMonitoring: true,
};

describe('MonitoringIntegration', () => {
  describe('MonitoredSecurityMiddleware', () => {
    it('should create monitored security middleware', () => {
      const telemetry = new TelemetrySystem();
      const performanceMonitor = new PerformanceMonitor(telemetry);

      const middleware = new MonitoredSecurityMiddleware(testEnv, telemetry, performanceMonitor);

      expect(middleware).toBeDefined();
    });

    it('should track security check performance', async () => {
      const telemetry = new TelemetrySystem();
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
      expect(perfStats.totalOperations).toBeGreaterThan(0);
    });

    it('should record security metrics for allowed requests', async () => {
      const telemetry = new TelemetrySystem();
      const performanceMonitor = new PerformanceMonitor(telemetry);

      const middleware = new MonitoredSecurityMiddleware(testEnv, telemetry, performanceMonitor, {
        enabled: true,
        requireAuth: false,
      });

      await middleware.checkRequest('allowed_test', {
        sessionId: 'test-session',
      });

      const metrics = telemetry.getMetrics();
      const securityMetrics = metrics.filter(m => m.name === 'security_check');

      expect(securityMetrics.length).toBeGreaterThan(0);
    });

    it('should record security metrics for blocked requests', async () => {
      const telemetry = new TelemetrySystem();
      const performanceMonitor = new PerformanceMonitor(telemetry);

      const middleware = new MonitoredSecurityMiddleware(testEnv, telemetry, performanceMonitor, {
        enabled: true,
        requireAuth: true,
        allowedUsers: [],
      });

      await middleware.checkRequest('blocked_test', {
        sessionId: 'test-session',
      });

      const metrics = telemetry.getMetrics();
      const blockedMetrics = metrics.filter(m => m.name === 'security_blocked');

      expect(blockedMetrics.length).toBeGreaterThan(0);
    });
  });

  describe('createMonitoringIntegration', () => {
    it('should create complete monitoring integration', () => {
      const integration = createMonitoringIntegration(testEnv, {
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

      expect(integration).toBeDefined();
      expect(integration.telemetry).toBeDefined();
      expect(integration.performanceMonitor).toBeDefined();
      expect(integration.middleware).toBeDefined();
    });

    it('should integrate telemetry with performance monitor', () => {
      const integration = createMonitoringIntegration(testEnv);

      expect(integration.telemetry).toBeDefined();
      expect(integration.performanceMonitor).toBeDefined();

      // Performance monitor should use the telemetry system
      const perfStats = integration.performanceMonitor.getStats();
      expect(perfStats).toBeDefined();
    });

    it('should allow disabling telemetry', () => {
      const integration = createMonitoringIntegration(testEnv, {
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

      expect(integration).toBeDefined();
    });
  });

  describe('integrated monitoring flow', () => {
    it('should track end-to-end request flow', async () => {
      const integration = createMonitoringIntegration(testEnv);

      // Track an operation
      const result = await integration.performanceMonitor.trackOperation(
        'test_operation',
        async () => {
          return { success: true };
        }
      );

      expect(result.success).toBe(true);

      // Check telemetry
      const telemetryStats = integration.telemetry.getStats();
      expect(telemetryStats.totalMetrics).toBeGreaterThan(0);

      // Check performance
      const perfStats = integration.performanceMonitor.getStats();
      expect(perfStats.totalOperations).toBeGreaterThan(0);
    });

    it('should track multiple concurrent operations', async () => {
      const integration = createMonitoringIntegration(testEnv);

      const operations = [
        integration.performanceMonitor.trackOperation('op1', async () => ({ result: 1 })),
        integration.performanceMonitor.trackOperation('op2', async () => ({ result: 2 })),
        integration.performanceMonitor.trackOperation('op3', async () => ({ result: 3 })),
      ];

      const results = await Promise.all(operations);

      expect(results).toHaveLength(3);
      expect(results[0].result).toBe(1);
      expect(results[1].result).toBe(2);
      expect(results[2].result).toBe(3);

      const perfStats = integration.performanceMonitor.getStats();
      expect(perfStats.totalOperations).toBeGreaterThanOrEqual(3);
    });

    it('should record performance alerts for slow operations', async () => {
      const integration = createMonitoringIntegration(testEnv, {
        telemetry: { enabled: true, metricsRetentionMs: 60000, exportMetrics: false },
        performance: { enabled: true, slowOperationMs: 10, alerting: true },
        healthChecks: { enabled: false, intervalMs: 5000 },
      });

      let alertReceived = false;
      integration.performanceMonitor.onAlert(alert => {
        alertReceived = true;
        expect(alert.type).toBe('slow_operation');
      });

      await integration.performanceMonitor.trackOperation('slow_test', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { done: true };
      });

      expect(alertReceived).toBe(true);
    });

    it('should maintain separate metric namespaces', async () => {
      const integration = createMonitoringIntegration(testEnv);

      // Record different types of metrics
      integration.telemetry.recordMetric({
        name: 'custom_metric_1',
        value: 100,
        unit: 'count',
      });

      integration.telemetry.recordMetric({
        name: 'custom_metric_2',
        value: 200,
        unit: 'ms',
      });

      const metrics = integration.telemetry.getMetrics();
      const metric1 = metrics.find((m: any) => m.name === 'custom_metric_1');
      const metric2 = metrics.find((m: any) => m.name === 'custom_metric_2');

      expect(metric1).toBeDefined();
      expect(metric1?.value).toBe(100);

      expect(metric2).toBeDefined();
      expect(metric2?.value).toBe(200);
    });
  });
});
