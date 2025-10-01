/**
 * Security Integration Tests for MonitoredMemoryRouter
 * Tests rate limiting and request validation features
 */

import { MonitoredMemoryRouter } from '../../src/memory/monitored-router.js';
import type { MemoryMetadata } from '../../src/memory/types.js';

describe('MonitoredMemoryRouter Security Integration', () => {
  describe('Rate Limiting', () => {
    it('should allow operations within rate limit', async () => {
      const router = new MonitoredMemoryRouter({
        security: {
          rateLimiting: {
            enabled: true,
            windowMs: 1000,
            maxRequests: 5,
          },
        },
      });

      const metadata: MemoryMetadata = {
        tags: ['rate-limit-test'],
        category: 'task',
        priority: 5,
        source: 'test-client',
      };

      // Should succeed - within limit
      for (let i = 0; i < 5; i++) {
        await router.store(`Test content ${i}`, metadata);
      }

      await router.close();
    });

    it('should enforce rate limits and block excessive requests', async () => {
      const router = new MonitoredMemoryRouter({
        security: {
          rateLimiting: {
            enabled: true,
            windowMs: 1000,
            maxRequests: 3,
          },
        },
      });

      const metadata: MemoryMetadata = {
        tags: ['rate-limit-test'],
        category: 'task',
        priority: 5,
        source: 'test-client',
      };

      // First 3 should succeed
      await router.store('Test 1', metadata);
      await router.store('Test 2', metadata);
      await router.store('Test 3', metadata);

      // 4th should fail
      await expect(router.store('Test 4', metadata)).rejects.toThrow('Rate limit exceeded');

      await router.close();
    });

    it('should reset rate limit after window expires', async () => {
      const router = new MonitoredMemoryRouter({
        security: {
          rateLimiting: {
            enabled: true,
            windowMs: 100, // Short window for testing
            maxRequests: 2,
          },
        },
      });

      const metadata: MemoryMetadata = {
        tags: ['rate-limit-test'],
        category: 'task',
        priority: 5,
        source: 'test-client',
      };

      // Use up limit
      await router.store('Test 1', metadata);
      await router.store('Test 2', metadata);

      // Wait for window to reset
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should succeed after reset
      await router.store('Test 3', metadata);

      await router.close();
    }, 10000);

    it('should track rate limits per client', async () => {
      const router = new MonitoredMemoryRouter({
        security: {
          rateLimiting: {
            enabled: true,
            windowMs: 1000,
            maxRequests: 2,
          },
        },
      });

      const client1Metadata: MemoryMetadata = {
        tags: ['test'],
        category: 'task',
        priority: 5,
        source: 'client-1',
      };

      const client2Metadata: MemoryMetadata = {
        tags: ['test'],
        category: 'task',
        priority: 5,
        source: 'client-2',
      };

      // Both clients should have independent limits
      await router.store('Client 1 - Request 1', client1Metadata);
      await router.store('Client 1 - Request 2', client1Metadata);

      await router.store('Client 2 - Request 1', client2Metadata);
      await router.store('Client 2 - Request 2', client2Metadata);

      // Both should now be at limit
      await expect(router.store('Client 1 - Request 3', client1Metadata)).rejects.toThrow(
        'Rate limit exceeded'
      );
      await expect(router.store('Client 2 - Request 3', client2Metadata)).rejects.toThrow(
        'Rate limit exceeded'
      );

      await router.close();
    });

    it('should apply rate limiting to update operations', async () => {
      const router = new MonitoredMemoryRouter({
        security: {
          rateLimiting: {
            enabled: true,
            windowMs: 1000,
            maxRequests: 2,
          },
        },
      });

      const metadata: MemoryMetadata = {
        tags: ['test'],
        category: 'task',
        priority: 5,
        source: 'test-client',
      };

      // Store initial item
      const item = await router.store('Initial content', metadata);

      // Update should count against limit - need to provide metadata with same source
      await router.update(item.id, { content: 'Updated 1', metadata });

      // Should now be at limit (store + update = 2)
      await expect(router.update(item.id, { content: 'Updated 2', metadata })).rejects.toThrow(
        'Rate limit exceeded'
      );

      await router.close();
    });

    it('should apply rate limiting to delete operations', async () => {
      const router = new MonitoredMemoryRouter({
        security: {
          rateLimiting: {
            enabled: true,
            windowMs: 1000,
            maxRequests: 2,
          },
        },
      });

      const metadata: MemoryMetadata = {
        tags: ['test'],
        category: 'task',
        priority: 5,
        source: 'test-client',
      };

      // Store two items (uses 'test-client' key slots)
      const item1 = await router.store('Content 1', metadata);
      const item2 = await router.store('Content 2', metadata);

      // First delete should succeed (uses up 1 slot for 'anonymous' key)
      await router.delete(item1.id);

      // Second delete should succeed (uses up 2nd slot for 'anonymous' key)
      await router.delete(item2.id);

      // Third delete should fail - anonymous key now at limit
      await expect(router.delete(item1.id)).rejects.toThrow('Rate limit exceeded');

      await router.close();
    });

    it('should work without rate limiting when disabled', async () => {
      const router = new MonitoredMemoryRouter({
        security: {
          rateLimiting: {
            enabled: false,
          },
        },
      });

      const metadata: MemoryMetadata = {
        tags: ['test'],
        category: 'task',
        priority: 5,
        source: 'test-client',
      };

      // Should allow many operations without limit
      for (let i = 0; i < 10; i++) {
        await router.store(`Content ${i}`, metadata);
      }

      await router.close();
    });
  });

  describe('Request Validation', () => {
    it('should accept valid memory content', async () => {
      const router = new MonitoredMemoryRouter({
        security: {
          requestValidation: {
            enabled: true,
          },
          rateLimiting: {
            enabled: false,
          },
        },
      });

      const metadata: MemoryMetadata = {
        tags: ['valid-test'],
        category: 'task',
        priority: 5,
        source: 'test-client',
      };

      const item = await router.store('Valid content for testing', metadata);
      expect(item.content).toBe('Valid content for testing');

      await router.close();
    });

    it('should reject content with script tags', async () => {
      const router = new MonitoredMemoryRouter({
        security: {
          requestValidation: {
            enabled: true,
          },
          rateLimiting: {
            enabled: false,
          },
        },
      });

      const metadata: MemoryMetadata = {
        tags: ['validation-test'],
        category: 'task',
        priority: 5,
        source: 'test-client',
      };

      await expect(router.store('<script>alert("xss")</script>', metadata)).rejects.toThrow(
        'Validation failed'
      );

      await router.close();
    });

    it('should reject content with javascript: protocol', async () => {
      const router = new MonitoredMemoryRouter({
        security: {
          requestValidation: {
            enabled: true,
          },
          rateLimiting: {
            enabled: false,
          },
        },
      });

      const metadata: MemoryMetadata = {
        tags: ['validation-test'],
        category: 'task',
        priority: 5,
        source: 'test-client',
      };

      await expect(router.store('Click here: javascript:alert(1)', metadata)).rejects.toThrow(
        'Validation failed'
      );

      await router.close();
    });

    it('should reject content with data: protocol', async () => {
      const router = new MonitoredMemoryRouter({
        security: {
          requestValidation: {
            enabled: true,
          },
          rateLimiting: {
            enabled: false,
          },
        },
      });

      const metadata: MemoryMetadata = {
        tags: ['validation-test'],
        category: 'task',
        priority: 5,
        source: 'test-client',
      };

      await expect(
        router.store('Image: data:text/html,<script>alert(1)</script>', metadata)
      ).rejects.toThrow('Validation failed');

      await router.close();
    });

    it('should validate tags format', async () => {
      const router = new MonitoredMemoryRouter({
        security: {
          requestValidation: {
            enabled: true,
          },
          rateLimiting: {
            enabled: false,
          },
        },
      });

      const metadata: MemoryMetadata = {
        tags: ['invalid tag with spaces'], // Invalid - spaces not allowed
        category: 'task',
        priority: 5,
        source: 'test-client',
      };

      await expect(router.store('Valid content', metadata)).rejects.toThrow('Validation failed');

      await router.close();
    });

    it('should validate priority range', async () => {
      const router = new MonitoredMemoryRouter({
        security: {
          requestValidation: {
            enabled: true,
          },
          rateLimiting: {
            enabled: false,
          },
        },
      });

      const metadata: MemoryMetadata = {
        tags: ['test'],
        category: 'task',
        priority: 15, // Invalid - max is 10
        source: 'test-client',
      };

      await expect(router.store('Valid content', metadata)).rejects.toThrow('Validation failed');

      await router.close();
    });

    it('should validate content length limits', async () => {
      const router = new MonitoredMemoryRouter({
        security: {
          requestValidation: {
            enabled: true,
          },
          rateLimiting: {
            enabled: false,
          },
        },
      });

      const metadata: MemoryMetadata = {
        tags: ['test'],
        category: 'task',
        priority: 5,
        source: 'test-client',
      };

      // Create content over 100KB limit
      const largeContent = 'x'.repeat(100001);

      await expect(router.store(largeContent, metadata)).rejects.toThrow('Validation failed');

      await router.close();
    });

    it('should validate update operations', async () => {
      const router = new MonitoredMemoryRouter({
        security: {
          requestValidation: {
            enabled: true,
          },
          rateLimiting: {
            enabled: false,
          },
        },
      });

      const metadata: MemoryMetadata = {
        tags: ['test'],
        category: 'task',
        priority: 5,
        source: 'test-client',
      };

      const item = await router.store('Initial content', metadata);

      // Invalid update
      await expect(router.update(item.id, { content: '<script>xss</script>' })).rejects.toThrow(
        'Validation failed'
      );

      await router.close();
    });

    it('should work without validation when disabled', async () => {
      const router = new MonitoredMemoryRouter({
        security: {
          requestValidation: {
            enabled: false,
          },
          rateLimiting: {
            enabled: false,
          },
        },
      });

      const metadata: MemoryMetadata = {
        tags: ['test'],
        category: 'task',
        priority: 5,
        source: 'test-client',
      };

      // Should accept content that would normally be rejected
      // Note: We're not testing actual XSS execution, just validation bypass
      const item = await router.store('Content with <script> tag mention', metadata);
      expect(item.content).toContain('script');

      await router.close();
    });
  });

  describe('Security Metrics', () => {
    it('should record metrics when monitoring is enabled', async () => {
      const router = new MonitoredMemoryRouter({
        security: {
          rateLimiting: {
            enabled: true,
            windowMs: 1000,
            maxRequests: 1,
          },
        },
        monitoring: {
          enabled: true,
        },
      });

      const metadata: MemoryMetadata = {
        tags: ['test'],
        category: 'task',
        priority: 5,
        source: 'test-client',
      };

      // Store should succeed
      await router.store('Content 1', metadata);

      // This should be rate limited
      let rateLimited = false;
      try {
        await router.store('Content 2', metadata);
      } catch (error) {
        rateLimited = true;
      }

      // Verify rate limiting worked
      expect(rateLimited).toBe(true);

      // Monitoring system should be active
      const stats = router.getMonitoringStats();
      expect(stats.enabled).toBe(true);

      await router.close();
    });
  });

  describe('Combined Security Features', () => {
    it('should enforce both rate limiting and validation', async () => {
      const router = new MonitoredMemoryRouter({
        security: {
          rateLimiting: {
            enabled: true,
            windowMs: 1000,
            maxRequests: 4, // Need 4 to allow: 1 validation failure + 3 successful stores
          },
          requestValidation: {
            enabled: true,
          },
        },
      });

      const metadata: MemoryMetadata = {
        tags: ['test'],
        category: 'task',
        priority: 5,
        source: 'test-client',
      };

      // Validation should reject (but still counts against rate limit)
      await expect(router.store('<script>xss</script>', metadata)).rejects.toThrow(
        'Validation failed'
      );

      // Valid content should work within rate limits
      await router.store('Valid content 1', metadata);
      await router.store('Valid content 2', metadata);
      await router.store('Valid content 3', metadata);

      // Rate limit should kick in (validation failure + 3 stores + 1 more = 5, exceeds limit of 4)
      await expect(router.store('Valid content 4', metadata)).rejects.toThrow(
        'Rate limit exceeded'
      );

      await router.close();
    });
  });
});
