/**
 * Core Security Tests - Basic Authentication and Authorization
 * Focused tests for the essential security functionality
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SimpleSecureRouter } from '../../src/memory/simple-secure-router.js';
import { SimpleAuthService } from '../../src/security/simple-auth.js';
import type { MemoryMetadata } from '../../src/memory/types.js';

describe('Core Security Functionality', () => {
  let secureRouter: SimpleSecureRouter;
  let authService: SimpleAuthService;

  beforeEach(() => {
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
    authService = secureRouter.getAuthService();
  });

  afterEach(async () => {
    await secureRouter.close();
  });

  describe('Authentication System', () => {
    it('should authenticate admin user successfully', async () => {
      const result = await authService.login({
        username: 'admin',
        password: 'admin123',
      });

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user?.username).toBe('admin');
      expect(result.user?.roles).toContain('admin');
      expect(result.user?.tenantId).toBe('default-tenant');
    });

    it('should authenticate regular user successfully', async () => {
      const result = await authService.login({
        username: 'user',
        password: 'user123',
      });

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user?.username).toBe('user');
      expect(result.user?.roles).toContain('user');
      expect(result.user?.tenantId).toBe('default-tenant');
    });

    it('should reject invalid credentials', async () => {
      const result = await authService.login({
        username: 'admin',
        password: 'wrongpassword',
      });

      expect(result.success).toBe(false);
      expect(result.token).toBeUndefined();
      expect(result.user).toBeUndefined();
      expect(result.error).toBe('Invalid credentials');
    });
  });

  describe('Token Validation', () => {
    it('should validate admin token correctly', async () => {
      const loginResult = await authService.login({
        username: 'admin',
        password: 'admin123',
      });

      const context = await authService.verifyToken(loginResult.token!);

      expect(context).not.toBeNull();
      expect(context?.userId).toBe('admin-1');
      expect(context?.tenantId).toBe('default-tenant');
      expect(context?.roles).toContain('admin');
      expect(context?.sessionId).toBeDefined();
      expect(context?.expiresAt).toBeInstanceOf(Date);
      expect(context?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should validate user token correctly', async () => {
      const loginResult = await authService.login({
        username: 'user',
        password: 'user123',
      });

      const context = await authService.verifyToken(loginResult.token!);

      expect(context).not.toBeNull();
      expect(context?.userId).toBe('user-1');
      expect(context?.tenantId).toBe('default-tenant');
      expect(context?.roles).toContain('user');
    });

    it('should reject invalid tokens', async () => {
      const invalidTokens = [
        'invalid-token',
        '',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid',
        'not.a.jwt.token',
      ];

      for (const token of invalidTokens) {
        const context = await authService.verifyToken(token);
        expect(context).toBeNull();
      }
    });
  });

  describe('Permission System', () => {
    let adminContext: any;
    let userContext: any;

    beforeEach(async () => {
      const adminLogin = await authService.login({
        username: 'admin',
        password: 'admin123',
      });
      adminContext = await authService.verifyToken(adminLogin.token!);

      const userLogin = await authService.login({
        username: 'user',
        password: 'user123',
      });
      userContext = await authService.verifyToken(userLogin.token!);
    });

    it('should grant admin comprehensive permissions', () => {
      // Memory operations
      expect(authService.hasPermission(adminContext, 'create', 'memory')).toBe(true);
      expect(authService.hasPermission(adminContext, 'read', 'memory')).toBe(true);
      expect(authService.hasPermission(adminContext, 'update', 'memory')).toBe(true);
      expect(authService.hasPermission(adminContext, 'delete', 'memory')).toBe(true);

      // System operations
      expect(authService.hasPermission(adminContext, 'admin', 'system')).toBe(true);
      expect(authService.hasPermission(adminContext, 'create', 'user')).toBe(true);
      expect(authService.hasPermission(adminContext, 'read', 'audit')).toBe(true);
    });

    it('should grant user memory permissions only', () => {
      // Memory operations - should be allowed
      expect(authService.hasPermission(userContext, 'create', 'memory')).toBe(true);
      expect(authService.hasPermission(userContext, 'read', 'memory')).toBe(true);
      expect(authService.hasPermission(userContext, 'update', 'memory')).toBe(true);
      expect(authService.hasPermission(userContext, 'delete', 'memory')).toBe(true);

      // System operations - should be denied
      expect(authService.hasPermission(userContext, 'admin', 'system')).toBe(false);
      expect(authService.hasPermission(userContext, 'create', 'user')).toBe(false);
      expect(authService.hasPermission(userContext, 'read', 'audit')).toBe(false);
      expect(authService.hasPermission(userContext, 'delete', 'system')).toBe(false);
    });
  });

  describe('Secure Memory Storage', () => {
    it('should store memory with admin context', async () => {
      const adminLogin = await authService.login({
        username: 'admin',
        password: 'admin123',
      });
      const adminContext = await authService.verifyToken(adminLogin.token!);

      const metadata: MemoryMetadata = {
        tags: ['admin-test', 'secure'],
        category: 'knowledge',
        priority: 9,
        source: 'security-test',
      };

      const item = await secureRouter.store(
        'Admin secure memory content',
        metadata,
        adminContext!
      );

      expect(item).toBeDefined();
      expect(item.id).toBeDefined();
      expect(item.content).toBe('Admin secure memory content');
      expect(item.metadata.tags).toEqual(['admin-test', 'secure']);
      expect(item.metadata.category).toBe('knowledge');
      expect(item.metadata.priority).toBe(9);

      // Check security metadata
      const secureMetadata = item.metadata as any;
      expect(secureMetadata.tenantId).toBe('default-tenant');
      expect(secureMetadata.createdBy).toBe('admin-1');
    });

    it('should store memory with user context', async () => {
      const userLogin = await authService.login({
        username: 'user',
        password: 'user123',
      });
      const userContext = await authService.verifyToken(userLogin.token!);

      const metadata: MemoryMetadata = {
        tags: ['user-test'],
        category: 'personal',
        priority: 6,
        source: 'user-test',
      };

      const item = await secureRouter.store(
        'User secure memory content',
        metadata,
        userContext!
      );

      expect(item).toBeDefined();
      expect(item.content).toBe('User secure memory content');

      const secureMetadata = item.metadata as any;
      expect(secureMetadata.tenantId).toBe('default-tenant');
      expect(secureMetadata.createdBy).toBe('user-1');
    });

    it('should store memory without context (system mode)', async () => {
      const metadata: MemoryMetadata = {
        tags: ['system'],
        category: 'system',
        priority: 5,
        source: 'system',
      };

      const item = await secureRouter.store(
        'System memory content',
        metadata
      );

      expect(item).toBeDefined();
      expect(item.content).toBe('System memory content');

      const secureMetadata = item.metadata as any;
      expect(secureMetadata.tenantId).toBe('default-tenant');
      expect(secureMetadata.createdBy).toBe('system');
    });
  });

  describe('Multi-Tenant Context', () => {
    it('should handle different tenant contexts', async () => {
      // Create a simulated different tenant context
      const tenant2Context = {
        userId: 'user-tenant2',
        tenantId: 'tenant-2',
        roles: ['user'] as ('admin' | 'user')[],
        sessionId: 'session-tenant2',
        expiresAt: new Date(Date.now() + 3600000),
      };

      const metadata: MemoryMetadata = {
        tags: ['tenant-test'],
        category: 'knowledge',
        priority: 7,
        source: 'tenant-test',
      };

      // Store for default tenant
      const defaultItem = await secureRouter.store(
        'Default tenant memory',
        metadata,
        // Use admin context for default tenant
        (await authService.verifyToken(
          (await authService.login({ username: 'admin', password: 'admin123' })).token!
        ))!
      );

      // Store for tenant 2
      const tenant2Item = await secureRouter.store(
        'Tenant 2 memory',
        metadata,
        tenant2Context
      );

      // Verify tenant metadata
      const defaultMetadata = defaultItem.metadata as any;
      const tenant2Metadata = tenant2Item.metadata as any;

      expect(defaultMetadata.tenantId).toBe('default-tenant');
      expect(tenant2Metadata.tenantId).toBe('tenant-2');
      expect(defaultMetadata.createdBy).toBe('admin-1');
      expect(tenant2Metadata.createdBy).toBe('user-tenant2');
    });
  });

  describe('Memory Retrieval and Management', () => {
    it('should retrieve stored memories by ID', async () => {
      const adminLogin = await authService.login({
        username: 'admin',
        password: 'admin123',
      });
      const adminContext = await authService.verifyToken(adminLogin.token!);

      const metadata: MemoryMetadata = {
        tags: ['retrieve-test'],
        category: 'test',
        priority: 8,
        source: 'retrieve-test',
      };

      const stored = await secureRouter.store(
        'Retrievable memory content',
        metadata,
        adminContext!
      );

      const retrieved = await secureRouter.retrieve(stored.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(stored.id);
      expect(retrieved?.content).toBe('Retrievable memory content');
      expect(retrieved?.metadata.tags).toEqual(['retrieve-test']);
    });

    it('should delete memories', async () => {
      const userLogin = await authService.login({
        username: 'user',
        password: 'user123',
      });
      const userContext = await authService.verifyToken(userLogin.token!);

      const metadata: MemoryMetadata = {
        tags: ['delete-test'],
        category: 'temporary',
        priority: 3,
        source: 'delete-test',
      };

      const stored = await secureRouter.store(
        'Memory to be deleted',
        metadata,
        userContext!
      );

      const deleteResult = await secureRouter.delete(stored.id);
      expect(deleteResult).toBe(true);

      const retrieved = await secureRouter.retrieve(stored.id);
      expect(retrieved).toBeNull();
    });

    it('should provide memory statistics', async () => {
      const stats = await secureRouter.getAllStats();

      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
      expect(stats.session).toBeDefined();
      expect(stats.project).toBeDefined();
      expect(stats.global).toBeDefined();
      expect(stats.temporal).toBeDefined();

      // Verify stats structure
      Object.values(stats).forEach(layerStats => {
        expect(layerStats).toBeDefined();
        expect(typeof layerStats.totalItems).toBe('number');
        expect(typeof layerStats.totalSize).toBe('number');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed login requests gracefully', async () => {
      const invalidRequests = [
        { username: '', password: '' },
        { username: null as any, password: undefined as any },
        { username: 'test', password: '' },
        { username: '', password: 'test' },
      ];

      for (const request of invalidRequests) {
        const result = await authService.login(request);
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('should handle storage with invalid contexts gracefully', async () => {
      const metadata: MemoryMetadata = {
        tags: ['error-test'],
        category: 'test',
        priority: 5,
        source: 'error-test',
      };

      // This should work (context is optional)
      const result = await secureRouter.store(
        'Error test content',
        metadata,
        undefined
      );

      expect(result).toBeDefined();
      expect(result.content).toBe('Error test content');

      const secureMetadata = result.metadata as any;
      expect(secureMetadata.tenantId).toBe('default-tenant');
      expect(secureMetadata.createdBy).toBe('system');
    });
  });
});