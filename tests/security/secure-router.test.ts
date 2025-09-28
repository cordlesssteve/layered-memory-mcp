/**
 * Security Tests - Secure Memory Router
 * Tests for tenant-aware memory operations and security filtering
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SimpleSecureRouter } from '../../src/memory/simple-secure-router.js';
import { SimpleAuthService, type SimpleAuthContext } from '../../src/security/simple-auth.js';
import type { MemoryMetadata } from '../../src/memory/types.js';

describe('SimpleSecureRouter', () => {
  let secureRouter: SimpleSecureRouter;
  let authService: SimpleAuthService;
  let adminContext: SimpleAuthContext;
  let userContext: SimpleAuthContext;
  let tenant2Context: SimpleAuthContext;

  beforeEach(async () => {
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
    });

    authService = secureRouter.getAuthService();

    // Create test contexts
    const adminLogin = await authService.login({
      username: 'admin',
      password: 'admin123',
    });
    adminContext = (await authService.verifyToken(adminLogin.token!))!;

    const userLogin = await authService.login({
      username: 'user',
      password: 'user123',
    });
    userContext = (await authService.verifyToken(userLogin.token!))!;

    // Create a context for a different tenant (simulated)
    tenant2Context = {
      userId: 'user-2',
      tenantId: 'tenant-2',
      roles: ['user'],
      sessionId: 'session-2',
      expiresAt: new Date(Date.now() + 3600000),
    };
  });

  afterEach(async () => {
    await secureRouter.close();
  });

  describe('Secure Memory Storage', () => {
    it('should store memory with security metadata', async () => {
      const metadata: MemoryMetadata = {
        tags: ['test', 'security'],
        category: 'knowledge',
        priority: 8,
        source: 'security-test',
      };

      const item = await secureRouter.store('Test secure memory content', metadata, adminContext);

      expect(item).toBeDefined();
      expect(item.id).toBeDefined();
      expect(item.content).toBe('Test secure memory content');
      expect(item.metadata.tags).toContain('test');
      expect(item.metadata.tags).toContain('security');

      // Check secure metadata
      const secureMetadata = item.metadata as any;
      expect(secureMetadata.tenantId).toBe(adminContext.tenantId);
      expect(secureMetadata.createdBy).toBe(adminContext.userId);
    });

    it('should store memory without context (system mode)', async () => {
      const metadata: MemoryMetadata = {
        tags: ['system'],
        category: 'system',
        priority: 5,
        source: 'system',
      };

      const item = await secureRouter.store('System memory content', metadata);

      expect(item).toBeDefined();
      expect(item.content).toBe('System memory content');

      // Check default security metadata
      const secureMetadata = item.metadata as any;
      expect(secureMetadata.tenantId).toBe('default-tenant');
      expect(secureMetadata.createdBy).toBe('system');
    });

    it('should store memories for different tenants', async () => {
      const metadata: MemoryMetadata = {
        tags: ['tenant-test'],
        category: 'knowledge',
        priority: 5,
        source: 'tenant-test',
      };

      // Store for default tenant
      const item1 = await secureRouter.store('Default tenant memory', metadata, adminContext);

      // Store for different tenant
      const item2 = await secureRouter.store('Tenant 2 memory', metadata, tenant2Context);

      // Verify tenant isolation
      const secureMetadata1 = item1.metadata as any;
      const secureMetadata2 = item2.metadata as any;

      expect(secureMetadata1.tenantId).toBe('default-tenant');
      expect(secureMetadata2.tenantId).toBe('tenant-2');
    });
  });

  describe('Tenant-Aware Search', () => {
    let searchRouter: SimpleSecureRouter;
    let searchAdminContext: SimpleAuthContext;
    let searchUserContext: SimpleAuthContext;
    let searchTenant2Context: SimpleAuthContext;

    beforeEach(async () => {
      // Clean up any existing data files to ensure test isolation
      const { rmSync } = await import('fs');
      try {
        rmSync('./data', { recursive: true, force: true });
      } catch (error) {
        // Ignore if directory doesn't exist
      }

      // Create a fresh router for search tests
      searchRouter = new SimpleSecureRouter({
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
      });

      const searchAuthService = searchRouter.getAuthService();

      // Create fresh test contexts
      const adminLogin = await searchAuthService.login({
        username: 'admin',
        password: 'admin123',
      });
      searchAdminContext = (await searchAuthService.verifyToken(adminLogin.token!))!;

      const userLogin = await searchAuthService.login({
        username: 'user',
        password: 'user123',
      });
      searchUserContext = (await searchAuthService.verifyToken(userLogin.token!))!;

      searchTenant2Context = {
        userId: 'user-2',
        tenantId: 'tenant-2',
        roles: ['user'],
        sessionId: 'session-2',
        expiresAt: new Date(Date.now() + 3600000),
      };

      // Setup test data
      const metadata: MemoryMetadata = {
        tags: ['search-test'],
        category: 'knowledge',
        priority: 7,
        source: 'search-test',
      };

      // Store memories for different tenants
      await searchRouter.store('Default tenant searchable content', metadata, searchAdminContext);
      await searchRouter.store('Another default tenant memory', metadata, searchUserContext);
      await searchRouter.store('Tenant 2 searchable content', metadata, searchTenant2Context);
      await searchRouter.store('System memory without tenant', metadata);
    });

    afterEach(async () => {
      await searchRouter.close();
    });

    it('should filter search results by tenant', async () => {
      const query = { query: 'searchable', limit: 10 };

      // Search as default tenant user
      const defaultResults = await searchRouter.search(query, searchAdminContext);

      // Search as tenant 2 user
      const tenant2Results = await searchRouter.search(query, searchTenant2Context);

      // Default tenant should see default tenant memories + system memories
      expect(defaultResults.length).toBeGreaterThan(0);

      // Tenant 2 should see tenant 2 memories + system memories
      expect(tenant2Results.length).toBeGreaterThan(0);

      // Verify tenant isolation
      const defaultTenantIds = defaultResults.map(r => (r.memory.metadata as any).tenantId);
      const tenant2TenantIds = tenant2Results.map(r => (r.memory.metadata as any).tenantId);

      // Default tenant should not see tenant 2 data
      expect(defaultTenantIds).not.toContain('tenant-2');

      // Tenant 2 should not see default tenant data
      expect(tenant2TenantIds).not.toContain('default-tenant');
    });

    it('should return all results when no context provided (system mode)', async () => {
      const query = { query: 'searchable', limit: 10 };

      const systemResults = await searchRouter.search(query);

      // System mode should see all memories
      expect(systemResults.length).toBeGreaterThan(0);

      const tenantIds = systemResults.map(
        r => (r.memory.metadata as any).tenantId || 'default-tenant'
      );
      expect(tenantIds).toContain('default-tenant');
      expect(tenantIds).toContain('tenant-2');
    });

    it('should handle search with no results', async () => {
      const query = { query: 'uniquenonexistentquery999zzz', limit: 10 };

      const results = await searchRouter.search(query, searchAdminContext);

      expect(results).toEqual([]);
    });
  });

  describe('Security Metadata Validation', () => {
    it('should add tenant metadata to all stored memories', async () => {
      const metadata: MemoryMetadata = {
        tags: ['metadata-test'],
        category: 'test',
        priority: 6,
        source: 'metadata-test',
      };

      const item = await secureRouter.store('Metadata test content', metadata, userContext);

      const secureMetadata = item.metadata as any;
      expect(secureMetadata.tenantId).toBeDefined();
      expect(secureMetadata.createdBy).toBeDefined();
      expect(secureMetadata.tenantId).toBe(userContext.tenantId);
      expect(secureMetadata.createdBy).toBe(userContext.userId);
    });

    it('should preserve original metadata while adding security fields', async () => {
      const originalMetadata: MemoryMetadata = {
        tags: ['preserve', 'original'],
        category: 'preservation-test',
        priority: 9,
        source: 'preservation-test',
        projectId: 'test-project',
        sessionId: 'test-session',
      };

      const item = await secureRouter.store('Preservation test', originalMetadata, adminContext);

      // Check original metadata preserved
      expect(item.metadata.tags).toEqual(['preserve', 'original']);
      expect(item.metadata.category).toBe('preservation-test');
      expect(item.metadata.priority).toBe(9);
      expect(item.metadata.source).toBe('preservation-test');
      expect(item.metadata.projectId).toBe('test-project');
      expect(item.metadata.sessionId).toBe('test-session');

      // Check security metadata added
      const secureMetadata = item.metadata as any;
      expect(secureMetadata.tenantId).toBe(adminContext.tenantId);
      expect(secureMetadata.createdBy).toBe(adminContext.userId);
    });
  });

  describe('Router Method Delegation', () => {
    it('should delegate retrieve method', async () => {
      const metadata: MemoryMetadata = {
        tags: ['retrieve-test'],
        category: 'test',
        priority: 5,
        source: 'retrieve-test',
      };

      const stored = await secureRouter.store('Retrieve test content', metadata, adminContext);
      const retrieved = await secureRouter.retrieve(stored.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(stored.id);
      expect(retrieved?.content).toBe('Retrieve test content');
    });

    it('should delegate stats method', async () => {
      const stats = await secureRouter.getAllStats();

      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
      expect(stats.session).toBeDefined();
      expect(stats.project).toBeDefined();
      expect(stats.global).toBeDefined();
      expect(stats.temporal).toBeDefined();
    });

    it('should delegate delete method', async () => {
      const metadata: MemoryMetadata = {
        tags: ['delete-test'],
        category: 'test',
        priority: 5,
        source: 'delete-test',
      };

      const stored = await secureRouter.store('Delete test content', metadata, adminContext);
      const deleted = await secureRouter.delete(stored.id);

      expect(deleted).toBe(true);

      const retrieved = await secureRouter.retrieve(stored.id);
      expect(retrieved).toBeNull();
    });
  });
});
