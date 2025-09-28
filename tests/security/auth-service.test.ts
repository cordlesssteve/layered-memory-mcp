/**
 * Security Tests - Authentication Service
 * Tests for JWT authentication, token validation, and permission system
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { SimpleAuthService, type LoginRequest } from '../../src/security/simple-auth.js';

describe('SimpleAuthService', () => {
  let authService: SimpleAuthService;

  beforeEach(() => {
    authService = new SimpleAuthService();
  });

  describe('Authentication', () => {
    it('should authenticate valid admin credentials', async () => {
      const request: LoginRequest = {
        username: 'admin',
        password: 'admin123',
      };

      const response = await authService.login(request);

      expect(response.success).toBe(true);
      expect(response.token).toBeDefined();
      expect(response.user).toBeDefined();
      expect(response.user?.username).toBe('admin');
      expect(response.user?.roles).toContain('admin');
      expect(response.error).toBeUndefined();
    });

    it('should authenticate valid user credentials', async () => {
      const request: LoginRequest = {
        username: 'user',
        password: 'user123',
      };

      const response = await authService.login(request);

      expect(response.success).toBe(true);
      expect(response.token).toBeDefined();
      expect(response.user).toBeDefined();
      expect(response.user?.username).toBe('user');
      expect(response.user?.roles).toContain('user');
    });

    it('should reject invalid username', async () => {
      const request: LoginRequest = {
        username: 'nonexistent',
        password: 'password',
      };

      const response = await authService.login(request);

      expect(response.success).toBe(false);
      expect(response.token).toBeUndefined();
      expect(response.user).toBeUndefined();
      expect(response.error).toBe('Invalid credentials');
    });

    it('should reject invalid password', async () => {
      const request: LoginRequest = {
        username: 'admin',
        password: 'wrongpassword',
      };

      const response = await authService.login(request);

      expect(response.success).toBe(false);
      expect(response.token).toBeUndefined();
      expect(response.user).toBeUndefined();
      expect(response.error).toBe('Invalid credentials');
    });

    it('should reject empty credentials', async () => {
      const request: LoginRequest = {
        username: '',
        password: '',
      };

      const response = await authService.login(request);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Invalid credentials');
    });
  });

  describe('Token Verification', () => {
    it('should verify valid token', async () => {
      // First login to get a token
      const loginResponse = await authService.login({
        username: 'admin',
        password: 'admin123',
      });

      expect(loginResponse.success).toBe(true);
      expect(loginResponse.token).toBeDefined();

      // Verify the token
      const context = await authService.verifyToken(loginResponse.token!);

      expect(context).not.toBeNull();
      expect(context?.userId).toBe('admin-1');
      expect(context?.tenantId).toBe('default-tenant');
      expect(context?.roles).toContain('admin');
      expect(context?.sessionId).toBeDefined();
      expect(context?.expiresAt).toBeInstanceOf(Date);
    });

    it('should reject invalid token format', async () => {
      const context = await authService.verifyToken('invalid-token');
      expect(context).toBeNull();
    });

    it('should reject empty token', async () => {
      const context = await authService.verifyToken('');
      expect(context).toBeNull();
    });

    it('should reject malformed JWT', async () => {
      const context = await authService.verifyToken('not.a.jwt');
      expect(context).toBeNull();
    });
  });

  describe('Permission System', () => {
    let adminContext: any;
    let userContext: any;

    beforeEach(async () => {
      // Setup admin context
      const adminLogin = await authService.login({
        username: 'admin',
        password: 'admin123',
      });
      adminContext = await authService.verifyToken(adminLogin.token!);

      // Setup user context
      const userLogin = await authService.login({
        username: 'user',
        password: 'user123',
      });
      userContext = await authService.verifyToken(userLogin.token!);
    });

    it('should grant admin all permissions', () => {
      expect(authService.hasPermission(adminContext, 'create', 'memory')).toBe(true);
      expect(authService.hasPermission(adminContext, 'read', 'memory')).toBe(true);
      expect(authService.hasPermission(adminContext, 'update', 'memory')).toBe(true);
      expect(authService.hasPermission(adminContext, 'delete', 'memory')).toBe(true);
      expect(authService.hasPermission(adminContext, 'admin', 'system')).toBe(true);
    });

    it('should grant user memory permissions only', () => {
      expect(authService.hasPermission(userContext, 'create', 'memory')).toBe(true);
      expect(authService.hasPermission(userContext, 'read', 'memory')).toBe(true);
      expect(authService.hasPermission(userContext, 'update', 'memory')).toBe(true);
      expect(authService.hasPermission(userContext, 'delete', 'memory')).toBe(true);
    });

    it('should deny user admin permissions', () => {
      expect(authService.hasPermission(userContext, 'admin', 'system')).toBe(false);
      expect(authService.hasPermission(userContext, 'create', 'user')).toBe(false);
      expect(authService.hasPermission(userContext, 'read', 'audit')).toBe(false);
    });
  });

  describe('Token Expiration', () => {
    it('should generate tokens with future expiration', async () => {
      const loginResponse = await authService.login({
        username: 'admin',
        password: 'admin123',
      });

      const context = await authService.verifyToken(loginResponse.token!);
      expect(context?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('Multi-tenant Support', () => {
    it('should assign default tenant to users', async () => {
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

      expect(adminContext?.tenantId).toBe('default-tenant');
      expect(userContext?.tenantId).toBe('default-tenant');
    });
  });
});