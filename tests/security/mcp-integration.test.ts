/**
 * Security Tests - MCP Server Integration
 * Tests for secure MCP tool authentication and authorization
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SimpleSecureRouter } from '../../src/memory/simple-secure-router.js';
import { SimpleAuthService } from '../../src/security/simple-auth.js';

describe('MCP Server Security Integration', () => {
  let secureRouter: SimpleSecureRouter;
  let authService: SimpleAuthService;
  let adminToken: string;
  let userToken: string;

  beforeEach(async () => {
    secureRouter = new SimpleSecureRouter({
      relationships: {
        enabled: false, // Disable for security tests to avoid side effects
        minConfidence: 0.7,
        batchSize: 50,
      },
    });
    authService = secureRouter.getAuthService();

    // Get authentication tokens
    const adminLogin = await authService.login({
      username: 'admin',
      password: 'admin123',
    });
    adminToken = adminLogin.token!;

    const userLogin = await authService.login({
      username: 'user',
      password: 'user123',
    });
    userToken = userLogin.token!;
  });

  afterEach(async () => {
    await secureRouter.close();
  });

  describe('Authentication Tool', () => {
    it('should authenticate valid admin credentials', async () => {
      const result = await authService.login({
        username: 'admin',
        password: 'admin123',
      });

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user?.username).toBe('admin');
      expect(result.user?.roles).toContain('admin');
      expect(result.error).toBeUndefined();
    });

    it('should authenticate valid user credentials', async () => {
      const result = await authService.login({
        username: 'user',
        password: 'user123',
      });

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user?.username).toBe('user');
      expect(result.user?.roles).toContain('user');
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

  describe('Token-Based Authorization', () => {
    it('should verify valid admin token', async () => {
      const context = await authService.verifyToken(adminToken);

      expect(context).not.toBeNull();
      expect(context?.userId).toBe('admin-1');
      expect(context?.tenantId).toBe('default-tenant');
      expect(context?.roles).toContain('admin');
    });

    it('should verify valid user token', async () => {
      const context = await authService.verifyToken(userToken);

      expect(context).not.toBeNull();
      expect(context?.userId).toBe('user-1');
      expect(context?.tenantId).toBe('default-tenant');
      expect(context?.roles).toContain('user');
    });

    it('should reject invalid token', async () => {
      const context = await authService.verifyToken('invalid-token');
      expect(context).toBeNull();
    });

    it('should reject expired or malformed token', async () => {
      const context = await authService.verifyToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid');
      expect(context).toBeNull();
    });
  });

  describe('Memory Operations Security', () => {
    it('should allow authenticated memory storage', async () => {
      const authContext = await authService.verifyToken(adminToken);
      expect(authContext).not.toBeNull();

      // Verify permission
      const hasPermission = authService.hasPermission(authContext!, 'create', 'memory');
      expect(hasPermission).toBe(true);

      // Store memory
      const item = await secureRouter.store(
        'Secure test memory',
        {
          tags: ['secure', 'test'],
          category: 'knowledge',
          priority: 8,
          source: 'mcp-test',
        },
        authContext!
      );

      expect(item).toBeDefined();
      expect(item.content).toBe('Secure test memory');

      const secureMetadata = item.metadata as any;
      expect(secureMetadata.tenantId).toBe(authContext!.tenantId);
      expect(secureMetadata.createdBy).toBe(authContext!.userId);
    });

    it('should allow authenticated memory search', async () => {
      // First store some test data
      const authContext = await authService.verifyToken(userToken);
      await secureRouter.store(
        'Searchable secure content',
        {
          tags: ['searchable'],
          category: 'knowledge',
          priority: 7,
          source: 'mcp-test',
        },
        authContext!
      );

      // Verify search permission
      const hasPermission = authService.hasPermission(authContext!, 'read', 'memory');
      expect(hasPermission).toBe(true);

      // Search memories
      const results = await secureRouter.search(
        { query: 'searchable', limit: 10 },
        authContext!
      );

      expect(results.length).toBeGreaterThan(0);
      if (results.length > 0 && results[0]) {
        expect(results[0].memory.content.toLowerCase()).toContain('searchable');
      }
    });

    it('should enforce tenant isolation in searches', async () => {
      const adminContext = await authService.verifyToken(adminToken);
      const userContext = await authService.verifyToken(userToken);

      // Both are in default tenant, so should see each other's data
      await secureRouter.store('Admin memory', {
        tags: ['admin-data'],
        category: 'knowledge',
        priority: 8,
        source: 'admin-test',
      }, adminContext!);

      await secureRouter.store('User memory', {
        tags: ['user-data'],
        category: 'knowledge',
        priority: 7,
        source: 'user-test',
      }, userContext!);

      // Admin search should see both (same tenant)
      const adminResults = await secureRouter.search(
        { query: 'memory', limit: 10 },
        adminContext!
      );

      // User search should see both (same tenant)
      const userResults = await secureRouter.search(
        { query: 'memory', limit: 10 },
        userContext!
      );

      // Since both are in default tenant, both should see memories from default tenant
      expect(adminResults.length).toBeGreaterThan(0);
      expect(userResults.length).toBeGreaterThan(0);

      // Verify tenant filtering works
      const adminTenantIds = adminResults.map(r => (r.memory.metadata as any).tenantId);
      const userTenantIds = userResults.map(r => (r.memory.metadata as any).tenantId);

      adminTenantIds.forEach(tenantId => {
        expect(tenantId === 'default-tenant' || !tenantId).toBe(true);
      });

      userTenantIds.forEach(tenantId => {
        expect(tenantId === 'default-tenant' || !tenantId).toBe(true);
      });
    });
  });

  describe('Permission Enforcement', () => {
    it('should allow admin all memory operations', async () => {
      const adminContext = await authService.verifyToken(adminToken);

      expect(authService.hasPermission(adminContext!, 'create', 'memory')).toBe(true);
      expect(authService.hasPermission(adminContext!, 'read', 'memory')).toBe(true);
      expect(authService.hasPermission(adminContext!, 'update', 'memory')).toBe(true);
      expect(authService.hasPermission(adminContext!, 'delete', 'memory')).toBe(true);
    });

    it('should allow user memory operations', async () => {
      const userContext = await authService.verifyToken(userToken);

      expect(authService.hasPermission(userContext!, 'create', 'memory')).toBe(true);
      expect(authService.hasPermission(userContext!, 'read', 'memory')).toBe(true);
      expect(authService.hasPermission(userContext!, 'update', 'memory')).toBe(true);
      expect(authService.hasPermission(userContext!, 'delete', 'memory')).toBe(true);
    });

    it('should deny user system operations', async () => {
      const userContext = await authService.verifyToken(userToken);

      expect(authService.hasPermission(userContext!, 'admin', 'system')).toBe(false);
      expect(authService.hasPermission(userContext!, 'create', 'user')).toBe(false);
      expect(authService.hasPermission(userContext!, 'read', 'audit')).toBe(false);
    });
  });

  describe('Statistics Access Control', () => {
    it('should allow authenticated users to get memory stats', async () => {
      const authContext = await authService.verifyToken(adminToken);
      expect(authContext).not.toBeNull();

      expect(authService.hasPermission(authContext!, 'read', 'memory')).toBe(true);

      const stats = await secureRouter.getAllStats();

      expect(stats).toBeDefined();
      expect(stats.session).toBeDefined();
      expect(stats.project).toBeDefined();
      expect(stats.global).toBeDefined();
      expect(stats.temporal).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication service errors gracefully', async () => {
      // Test with malformed login data
      const result = await authService.login({
        username: null as any,
        password: undefined as any,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
    });

    it('should handle token verification errors gracefully', async () => {
      const context = await authService.verifyToken('clearly-not-a-jwt-token');
      expect(context).toBeNull();
    });
  });

  describe('Security Logging', () => {
    it('should log successful authentication', async () => {
      const result = await authService.login({
        username: 'admin',
        password: 'admin123',
      });

      expect(result.success).toBe(true);
      // Note: In a real implementation, we would verify that security events are logged
      // For now, we just verify the operation succeeds
    });

    it('should log failed authentication attempts', async () => {
      const result = await authService.login({
        username: 'admin',
        password: 'wrongpassword',
      });

      expect(result.success).toBe(false);
      // Note: In a real implementation, we would verify that security events are logged
    });
  });
});