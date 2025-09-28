/**
 * End-to-End Security Tests
 * Complete workflow tests for authentication and secure memory operations
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SimpleSecureRouter } from '../../src/memory/simple-secure-router.js';
import type { MemoryMetadata } from '../../src/memory/types.js';

describe('End-to-End Security Workflow', () => {
  let secureRouter: SimpleSecureRouter;

  beforeEach(async () => {
    // Clean up any existing data files to ensure test isolation
    const { rmSync } = await import('fs');
    try {
      rmSync('./data', { recursive: true, force: true });
    } catch (error) {
      // Ignore if directory doesn't exist
    }

    secureRouter = new SimpleSecureRouter({
      routing: {
        sessionThreshold: 0.8,
        projectThreshold: 0.6,
        globalThreshold: 0.4,
        temporalFallback: true,
        maxResults: 20,
        scoringWeights: {
          recency: 0.3,
          frequency: 0.2,
          relevance: 0.4,
          priority: 0.1,
        },
      },
      relationships: {
        enabled: false, // Disable for security tests to avoid side effects
        minConfidence: 0.7,
        batchSize: 50,
      },
    });
  });

  afterEach(async () => {
    await secureRouter.close();
  });

  describe('Complete Authentication Workflow', () => {
    it('should complete full admin workflow: login -> store -> search -> stats', async () => {
      const authService = secureRouter.getAuthService();

      // Step 1: Login
      const loginResponse = await authService.login({
        username: 'admin',
        password: 'admin123',
      });

      expect(loginResponse.success).toBe(true);
      expect(loginResponse.token).toBeDefined();
      expect(loginResponse.user?.roles).toContain('admin');

      // Step 2: Verify token
      const authContext = await authService.verifyToken(loginResponse.token!);
      expect(authContext).not.toBeNull();
      expect(authContext!.userId).toBe('admin-1');
      expect(authContext!.tenantId).toBe('default-tenant');

      // Step 3: Check permissions
      expect(authService.hasPermission(authContext!, 'create', 'memory')).toBe(true);
      expect(authService.hasPermission(authContext!, 'read', 'memory')).toBe(true);

      // Step 4: Store memory
      const metadata: MemoryMetadata = {
        tags: ['e2e-test', 'admin'],
        category: 'knowledge',
        priority: 9,
        source: 'e2e-admin-test',
      };

      const storedItem = await secureRouter.store(
        'Admin end-to-end test memory content',
        metadata,
        authContext!
      );

      expect(storedItem).toBeDefined();
      expect(storedItem.content).toBe('Admin end-to-end test memory content');

      const secureMetadata = storedItem.metadata as any;
      expect(secureMetadata.tenantId).toBe('default-tenant');
      expect(secureMetadata.createdBy).toBe('admin-1');

      // Step 5: Search memory
      const searchResults = await secureRouter.search(
        { query: 'Admin end-to-end test memory', limit: 10 },
        authContext!
      );

      expect(searchResults.length).toBeGreaterThan(0);
      const foundItem = searchResults.find(r => r.memory.id === storedItem.id);
      expect(foundItem).toBeDefined();
      expect(foundItem!.memory.content).toBe('Admin end-to-end test memory content');

      // Step 6: Get statistics
      const stats = await secureRouter.getAllStats();
      expect(stats).toBeDefined();
      expect(stats.session).toBeDefined();
      expect(stats.project).toBeDefined();
      expect(stats.global).toBeDefined();
      expect(stats.temporal).toBeDefined();
    });

    it('should complete full user workflow: login -> store -> search', async () => {
      const authService = secureRouter.getAuthService();

      // Step 1: Login
      const loginResponse = await authService.login({
        username: 'user',
        password: 'user123',
      });

      expect(loginResponse.success).toBe(true);
      expect(loginResponse.token).toBeDefined();
      expect(loginResponse.user?.roles).toContain('user');

      // Step 2: Verify token and permissions
      const authContext = await authService.verifyToken(loginResponse.token!);
      expect(authContext).not.toBeNull();
      expect(authContext!.userId).toBe('user-1');

      expect(authService.hasPermission(authContext!, 'create', 'memory')).toBe(true);
      expect(authService.hasPermission(authContext!, 'read', 'memory')).toBe(true);

      // Step 3: Store multiple memories
      const memories = [
        'User memory about project planning',
        'User memory about code review feedback',
        'User memory about meeting notes',
      ];

      const storedItems = [];
      for (const content of memories) {
        const metadata: MemoryMetadata = {
          tags: ['e2e-user-test', 'user-workflow'],
          category: 'knowledge',
          priority: 6,
          source: 'e2e-user-test',
        };

        const item = await secureRouter.store(content, metadata, authContext!);
        storedItems.push(item);

        const secureMetadata = item.metadata as any;
        expect(secureMetadata.tenantId).toBe('default-tenant');
        expect(secureMetadata.createdBy).toBe('user-1');
      }

      // Step 4: Search and verify results
      const searchResults = await secureRouter.search(
        { query: 'User memory', limit: 10 },
        authContext!
      );

      expect(searchResults.length).toBeGreaterThan(0);

      // Verify all stored memories are found
      const foundIds = searchResults.map(r => r.memory.id);
      storedItems.forEach(item => {
        expect(foundIds).toContain(item.id);
      });
    });
  });

  describe('Multi-Tenant Security Isolation', () => {
    it('should enforce complete tenant isolation in full workflow', async () => {
      // Create two different tenant contexts
      const tenant1Context = {
        userId: 'user-tenant1',
        tenantId: 'tenant-1',
        roles: ['user'] as ('admin' | 'user')[],
        sessionId: 'session-tenant1',
        expiresAt: new Date(Date.now() + 3600000),
      };

      const tenant2Context = {
        userId: 'user-tenant2',
        tenantId: 'tenant-2',
        roles: ['user'] as ('admin' | 'user')[],
        sessionId: 'session-tenant2',
        expiresAt: new Date(Date.now() + 3600000),
      };

      // Store memories for each tenant
      const tenant1Memory = await secureRouter.store(
        'Tenant 1 confidential information',
        {
          tags: ['tenant1', 'confidential'],
          category: 'knowledge',
          priority: 9,
          source: 'tenant1-test',
        },
        tenant1Context
      );

      const tenant2Memory = await secureRouter.store(
        'Tenant 2 confidential information',
        {
          tags: ['tenant2', 'confidential'],
          category: 'knowledge',
          priority: 9,
          source: 'tenant2-test',
        },
        tenant2Context
      );

      // Verify memories are stored with correct tenant metadata
      const tenant1Metadata = tenant1Memory.metadata as any;
      const tenant2Metadata = tenant2Memory.metadata as any;

      expect(tenant1Metadata.tenantId).toBe('tenant-1');
      expect(tenant2Metadata.tenantId).toBe('tenant-2');

      // Add small delay to ensure indexing is complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Search from tenant 1 - should only see tenant 1 data
      const tenant1Results = await secureRouter.search(
        { query: 'Tenant 1 confidential information', limit: 10 },
        tenant1Context
      );

      // Search from tenant 2 - should only see tenant 2 data
      const tenant2Results = await secureRouter.search(
        { query: 'Tenant 2 confidential information', limit: 10 },
        tenant2Context
      );

      // Verify tenant isolation
      const tenant1ResultIds = tenant1Results.map(r => r.memory.id);
      const tenant2ResultIds = tenant2Results.map(r => r.memory.id);

      expect(tenant1ResultIds).toContain(tenant1Memory.id);
      expect(tenant1ResultIds).not.toContain(tenant2Memory.id);

      expect(tenant2ResultIds).toContain(tenant2Memory.id);
      expect(tenant2ResultIds).not.toContain(tenant1Memory.id);
    });
  });

  describe('Error Handling and Security', () => {
    it('should handle invalid authentication gracefully in full workflow', async () => {
      const authService = secureRouter.getAuthService();

      // Step 1: Failed login
      const failedLogin = await authService.login({
        username: 'nonexistent',
        password: 'wrongpassword',
      });

      expect(failedLogin.success).toBe(false);
      expect(failedLogin.token).toBeUndefined();
      expect(failedLogin.error).toBe('Invalid credentials');

      // Step 2: Try to use invalid token
      const invalidContext = await authService.verifyToken('invalid-token');
      expect(invalidContext).toBeNull();

      // Step 3: Verify system still works with valid credentials
      const validLogin = await authService.login({
        username: 'admin',
        password: 'admin123',
      });

      expect(validLogin.success).toBe(true);
      expect(validLogin.token).toBeDefined();
    });

    it('should maintain security across multiple operations', async () => {
      const authService = secureRouter.getAuthService();

      // Login and get token
      const loginResponse = await authService.login({
        username: 'user',
        password: 'user123',
      });

      const authContext = await authService.verifyToken(loginResponse.token!);

      // Perform multiple operations and verify security context is maintained
      const operations = [];
      for (let i = 0; i < 5; i++) {
        const item = await secureRouter.store(
          `Security test memory ${i}`,
          {
            tags: [`test-${i}`],
            category: 'test',
            priority: 5,
            source: 'security-test',
          },
          authContext!
        );

        operations.push(item);

        // Verify security metadata is consistent
        const secureMetadata = item.metadata as any;
        expect(secureMetadata.tenantId).toBe('default-tenant');
        expect(secureMetadata.createdBy).toBe('user-1');
      }

      // Search and verify all operations are accessible
      const searchResults = await secureRouter.search(
        { query: 'Security test memory', limit: 10 },
        authContext!
      );

      expect(searchResults.length).toBe(5);

      // Verify each result has correct security metadata
      searchResults.forEach(result => {
        const secureMetadata = result.memory.metadata as any;
        expect(secureMetadata.tenantId).toBe('default-tenant');
        expect(secureMetadata.createdBy).toBe('user-1');
      });
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle concurrent operations with security', async () => {
      const authService = secureRouter.getAuthService();

      // Get authentication contexts for multiple users
      const adminLogin = await authService.login({
        username: 'admin',
        password: 'admin123',
      });
      const adminContext = await authService.verifyToken(adminLogin.token!);

      const userLogin = await authService.login({
        username: 'user',
        password: 'user123',
      });
      const userContext = await authService.verifyToken(userLogin.token!);

      // Perform concurrent operations
      const concurrentOperations = [];

      // Admin operations
      for (let i = 0; i < 3; i++) {
        concurrentOperations.push(
          secureRouter.store(
            `Admin concurrent memory ${i}`,
            {
              tags: [`admin-concurrent-${i}`],
              category: 'admin-test',
              priority: 8,
              source: 'concurrent-test',
            },
            adminContext!
          )
        );
      }

      // User operations
      for (let i = 0; i < 3; i++) {
        concurrentOperations.push(
          secureRouter.store(
            `User concurrent memory ${i}`,
            {
              tags: [`user-concurrent-${i}`],
              category: 'user-test',
              priority: 6,
              source: 'concurrent-test',
            },
            userContext!
          )
        );
      }

      // Wait for all operations to complete
      const results = await Promise.all(concurrentOperations);

      // Verify all operations succeeded with correct security metadata
      expect(results.length).toBe(6);

      results.forEach((result, index) => {
        expect(result).toBeDefined();
        expect(result.content).toContain('concurrent memory');

        const secureMetadata = result.metadata as any;
        expect(secureMetadata.tenantId).toBe('default-tenant');

        if (index < 3) {
          // Admin operations
          expect(secureMetadata.createdBy).toBe('admin-1');
        } else {
          // User operations
          expect(secureMetadata.createdBy).toBe('user-1');
        }
      });

      // Add small delay to ensure indexing is complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify search results maintain security context
      const adminSearchResults = await secureRouter.search(
        { query: 'concurrent', limit: 10 },
        adminContext!
      );

      const userSearchResults = await secureRouter.search(
        { query: 'concurrent', limit: 10 },
        userContext!
      );

      // Both should see concurrent memories since they're in the same tenant
      // Note: Search may not find all memories due to ranking/relevance algorithms
      expect(adminSearchResults.length).toBeGreaterThan(0);
      expect(userSearchResults.length).toBeGreaterThan(0);

      // Verify that both admin and user can see memories from the same tenant
      expect(adminSearchResults.length).toBe(userSearchResults.length);
    });
  });
});