/**
 * Authentication Service - JWT-based authentication with secure token management
 * Phase 2.1.1: Authentication Foundation
 */

import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { createLogger } from '../utils/logger.js';
import type {
  User,
  Tenant,
  AuthContext,
  JWT,
  AuthenticationRequest,
  AuthenticationResponse,
  RefreshTokenRequest,
  SecurityConfig,
  SecurityEvent,
  UserRole,
} from './types.js';

const logger = createLogger('auth-service');

export class AuthenticationService {
  private config: SecurityConfig;
  private users = new Map<string, User>();
  private tenants = new Map<string, Tenant>();
  private refreshTokens = new Map<string, { userId: string; tenantId: string; expiresAt: Date }>();
  private securityEvents: SecurityEvent[] = [];

  constructor(config: SecurityConfig) {
    this.config = config;
    this.initializeDefaultTenantAndAdmin();
  }

  /**
   * Authenticate user with username/password
   */
  async authenticate(request: AuthenticationRequest): Promise<AuthenticationResponse> {
    const startTime = Date.now();

    try {
      // Find user by username
      const user = Array.from(this.users.values()).find(u => u.username === request.username);

      if (!user || !user.isActive) {
        await this.logSecurityEvent({
          tenantId: request.tenantId || 'unknown',
          eventType: 'authentication_failure',
          severity: 'medium',
          metadata: {
            username: request.username,
            reason: 'user_not_found_or_inactive',
            ipAddress: request.ipAddress,
            userAgent: request.userAgent,
          },
        });

        return {
          success: false,
          error: 'Invalid credentials',
        };
      }

      // Verify password
      const passwordValid = await bcrypt.compare(request.password, user.passwordHash);

      if (!passwordValid) {
        await this.logSecurityEvent({
          tenantId: user.tenantId,
          userId: user.id,
          eventType: 'authentication_failure',
          severity: 'medium',
          metadata: {
            username: request.username,
            reason: 'invalid_password',
            ipAddress: request.ipAddress,
            userAgent: request.userAgent,
          },
        });

        return {
          success: false,
          error: 'Invalid credentials',
        };
      }

      // Verify tenant access if specified
      if (request.tenantId && user.tenantId !== request.tenantId) {
        await this.logSecurityEvent({
          tenantId: request.tenantId,
          userId: user.id,
          eventType: 'authentication_failure',
          severity: 'high',
          metadata: {
            username: request.username,
            reason: 'tenant_mismatch',
            requestedTenant: request.tenantId,
            userTenant: user.tenantId,
            ipAddress: request.ipAddress,
            userAgent: request.userAgent,
          },
        });

        return {
          success: false,
          error: 'Access denied',
        };
      }

      // Generate tokens
      const sessionId = randomUUID();
      const token = this.generateAccessToken(user, sessionId);
      const refreshToken = this.generateRefreshToken(user, sessionId);

      // Update user last login
      user.lastLoginAt = new Date();
      user.updatedAt = new Date();

      await this.logSecurityEvent({
        tenantId: user.tenantId,
        userId: user.id,
        eventType: 'authentication_success',
        severity: 'low',
        metadata: {
          username: user.username,
          sessionId,
          ipAddress: request.ipAddress,
          userAgent: request.userAgent,
          duration: Date.now() - startTime,
        },
      });

      logger.info('User authenticated successfully', {
        userId: user.id,
        username: user.username,
        tenantId: user.tenantId,
        sessionId,
      });

      return {
        success: true,
        token,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          tenantId: user.tenantId,
          roles: user.roles,
          isActive: user.isActive,
          ...(user.lastLoginAt && { lastLoginAt: user.lastLoginAt }),
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          metadata: user.metadata,
        },
        expiresAt: new Date(Date.now() + this.parseTimeString(this.config.jwt.expiresIn)),
      };
    } catch (error) {
      logger.error('Authentication error', {
        username: request.username,
        error: error instanceof Error ? error.message : error,
      });

      await this.logSecurityEvent({
        tenantId: request.tenantId || 'unknown',
        eventType: 'authentication_failure',
        severity: 'high',
        metadata: {
          username: request.username,
          reason: 'system_error',
          error: error instanceof Error ? error.message : String(error),
          ipAddress: request.ipAddress,
          userAgent: request.userAgent,
        },
      });

      return {
        success: false,
        error: 'Authentication failed',
      };
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(request: RefreshTokenRequest): Promise<AuthenticationResponse> {
    try {
      const tokenData = this.refreshTokens.get(request.refreshToken);

      if (!tokenData || tokenData.expiresAt < new Date()) {
        await this.logSecurityEvent({
          tenantId: tokenData?.tenantId || 'unknown',
          ...(tokenData?.userId && { userId: tokenData.userId }),
          eventType: 'token_expired',
          severity: 'medium',
          metadata: {
            reason: 'refresh_token_invalid_or_expired',
            ipAddress: request.ipAddress,
            userAgent: request.userAgent,
          },
        });

        // Clean up expired token
        if (tokenData) {
          this.refreshTokens.delete(request.refreshToken);
        }

        return {
          success: false,
          error: 'Invalid or expired refresh token',
        };
      }

      const user = this.users.get(tokenData.userId);

      if (!user || !user.isActive) {
        this.refreshTokens.delete(request.refreshToken);

        await this.logSecurityEvent({
          tenantId: tokenData.tenantId,
          userId: tokenData.userId,
          eventType: 'token_refresh',
          severity: 'medium',
          metadata: {
            reason: 'user_not_active',
            ipAddress: request.ipAddress,
            userAgent: request.userAgent,
          },
        });

        return {
          success: false,
          error: 'User account is not active',
        };
      }

      // Generate new tokens
      const sessionId = randomUUID();
      const newAccessToken = this.generateAccessToken(user, sessionId);
      const newRefreshToken = this.generateRefreshToken(user, sessionId);

      // Remove old refresh token
      this.refreshTokens.delete(request.refreshToken);

      await this.logSecurityEvent({
        tenantId: user.tenantId,
        userId: user.id,
        eventType: 'token_refresh',
        severity: 'low',
        metadata: {
          sessionId,
          ipAddress: request.ipAddress,
          userAgent: request.userAgent,
        },
      });

      logger.info('Token refreshed successfully', {
        userId: user.id,
        tenantId: user.tenantId,
        sessionId,
      });

      return {
        success: true,
        token: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          tenantId: user.tenantId,
          roles: user.roles,
          isActive: user.isActive,
          ...(user.lastLoginAt && { lastLoginAt: user.lastLoginAt }),
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          metadata: user.metadata,
        },
        expiresAt: new Date(Date.now() + this.parseTimeString(this.config.jwt.expiresIn)),
      };
    } catch (error) {
      logger.error('Token refresh error', {
        error: error instanceof Error ? error.message : error,
      });

      return {
        success: false,
        error: 'Token refresh failed',
      };
    }
  }

  /**
   * Verify and decode JWT token
   */
  async verifyToken(token: string): Promise<AuthContext | null> {
    try {
      const decoded = jwt.verify(token, this.config.jwt.secret, {
        algorithms: [this.config.jwt.algorithm],
      }) as JWT;

      const user = this.users.get(decoded.sub);

      if (!user || !user.isActive) {
        logger.warn('Token verification failed: user not found or inactive', {
          userId: decoded.sub,
        });
        return null;
      }

      const tenant = this.tenants.get(decoded.tid);

      if (!tenant || !tenant.isActive) {
        logger.warn('Token verification failed: tenant not found or inactive', {
          tenantId: decoded.tid,
        });
        return null;
      }

      // Generate permissions based on roles
      const permissions = this.generatePermissions(decoded.roles);

      return {
        userId: decoded.sub,
        tenantId: decoded.tid,
        roles: decoded.roles,
        permissions,
        sessionId: decoded.jti,
        authenticatedAt: new Date(decoded.iat * 1000),
        expiresAt: new Date(decoded.exp * 1000),
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.debug('Token expired', { error: error.message });
      } else if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid token', { error: error.message });
      } else {
        logger.error('Token verification error', {
          error: error instanceof Error ? error.message : error,
        });
      }

      return null;
    }
  }

  /**
   * Create a new user
   */
  async createUser(userData: {
    username: string;
    email: string;
    password: string;
    tenantId: string;
    roles: UserRole[];
  }): Promise<User> {
    // Validate password
    this.validatePassword(userData.password);

    // Check if username/email already exists
    const existingUser = Array.from(this.users.values()).find(
      u => u.username === userData.username || u.email === userData.email
    );

    if (existingUser) {
      throw new Error('Username or email already exists');
    }

    // Verify tenant exists
    const tenant = this.tenants.get(userData.tenantId);
    if (!tenant || !tenant.isActive) {
      throw new Error('Invalid tenant');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(userData.password, this.config.password.saltRounds);

    const user: User = {
      id: randomUUID(),
      username: userData.username,
      email: userData.email,
      passwordHash,
      tenantId: userData.tenantId,
      roles: userData.roles,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    };

    this.users.set(user.id, user);

    logger.info('User created', {
      userId: user.id,
      username: user.username,
      tenantId: user.tenantId,
      roles: user.roles,
    });

    return user;
  }

  /**
   * Create a new tenant
   */
  async createTenant(tenantData: {
    name: string;
    organizationName: string;
    subscriptionTier: 'free' | 'pro' | 'enterprise';
  }): Promise<Tenant> {
    const tenant: Tenant = {
      id: randomUUID(),
      name: tenantData.name,
      organizationName: tenantData.organizationName,
      isActive: true,
      subscriptionTier: tenantData.subscriptionTier,
      maxUsers: this.getMaxUsers(tenantData.subscriptionTier),
      maxMemories: this.getMaxMemories(tenantData.subscriptionTier),
      maxStorageBytes: this.getMaxStorage(tenantData.subscriptionTier),
      createdAt: new Date(),
      updatedAt: new Date(),
      settings: {
        encryptionEnabled: tenantData.subscriptionTier !== 'free',
        auditLogsEnabled: tenantData.subscriptionTier === 'enterprise',
      },
    };

    this.tenants.set(tenant.id, tenant);

    logger.info('Tenant created', {
      tenantId: tenant.id,
      name: tenant.name,
      tier: tenant.subscriptionTier,
    });

    return tenant;
  }

  /**
   * Get security events for auditing
   */
  getSecurityEvents(tenantId?: string, limit = 100): SecurityEvent[] {
    let events = this.securityEvents;

    if (tenantId) {
      events = events.filter(e => e.tenantId === tenantId);
    }

    return events
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  // Private helper methods

  private generateAccessToken(user: User, sessionId: string): string {
    const payload: JWT = {
      sub: user.id,
      tid: user.tenantId,
      roles: user.roles,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor((Date.now() + this.parseTimeString(this.config.jwt.expiresIn)) / 1000),
      jti: sessionId,
    };

    return jwt.sign(payload, this.config.jwt.secret, {
      algorithm: this.config.jwt.algorithm,
    });
  }

  private generateRefreshToken(user: User, _sessionId: string): string {
    const refreshToken = randomUUID();
    const expiresAt = new Date(Date.now() + this.parseTimeString(this.config.jwt.refreshExpiresIn));

    this.refreshTokens.set(refreshToken, {
      userId: user.id,
      tenantId: user.tenantId,
      expiresAt,
    });

    return refreshToken;
  }

  private generatePermissions(roles: UserRole[]) {
    // Basic permission generation - can be enhanced with more complex logic
    const permissions = [];

    if (roles.includes('admin')) {
      permissions.push(
        { resource: 'memory' as const, action: 'admin' as const },
        { resource: 'tenant' as const, action: 'admin' as const },
        { resource: 'user' as const, action: 'admin' as const },
        { resource: 'audit' as const, action: 'read' as const }
      );
    }

    if (roles.includes('user')) {
      permissions.push(
        { resource: 'memory' as const, action: 'create' as const },
        { resource: 'memory' as const, action: 'read' as const },
        { resource: 'memory' as const, action: 'update' as const },
        { resource: 'memory' as const, action: 'delete' as const },
        { resource: 'memory' as const, action: 'search' as const },
        { resource: 'relationship' as const, action: 'read' as const },
        { resource: 'knowledge-graph' as const, action: 'read' as const }
      );
    }

    if (roles.includes('readonly')) {
      permissions.push(
        { resource: 'memory' as const, action: 'read' as const },
        { resource: 'memory' as const, action: 'search' as const },
        { resource: 'relationship' as const, action: 'read' as const },
        { resource: 'knowledge-graph' as const, action: 'read' as const }
      );
    }

    return permissions;
  }

  private validatePassword(password: string): void {
    const config = this.config.password;

    if (password.length < config.minLength) {
      throw new Error(`Password must be at least ${config.minLength} characters long`);
    }

    if (config.requireUppercase && !/[A-Z]/.test(password)) {
      throw new Error('Password must contain at least one uppercase letter');
    }

    if (config.requireLowercase && !/[a-z]/.test(password)) {
      throw new Error('Password must contain at least one lowercase letter');
    }

    if (config.requireNumbers && !/[0-9]/.test(password)) {
      throw new Error('Password must contain at least one number');
    }

    if (config.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      throw new Error('Password must contain at least one special character');
    }
  }

  private parseTimeString(timeStr: string): number {
    const unit = timeStr.slice(-1);
    const value = parseInt(timeStr.slice(0, -1), 10);

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        throw new Error(`Invalid time format: ${timeStr}`);
    }
  }

  private getMaxUsers(tier: 'free' | 'pro' | 'enterprise'): number {
    switch (tier) {
      case 'free':
        return 5;
      case 'pro':
        return 50;
      case 'enterprise':
        return 1000;
    }
  }

  private getMaxMemories(tier: 'free' | 'pro' | 'enterprise'): number {
    switch (tier) {
      case 'free':
        return 1000;
      case 'pro':
        return 50000;
      case 'enterprise':
        return 1000000;
    }
  }

  private getMaxStorage(tier: 'free' | 'pro' | 'enterprise'): number {
    switch (tier) {
      case 'free':
        return 100 * 1024 * 1024; // 100MB
      case 'pro':
        return 10 * 1024 * 1024 * 1024; // 10GB
      case 'enterprise':
        return 1000 * 1024 * 1024 * 1024; // 1TB
    }
  }

  private async logSecurityEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<void> {
    const securityEvent: SecurityEvent = {
      id: randomUUID(),
      timestamp: new Date(),
      ...event,
    };

    this.securityEvents.push(securityEvent);

    // Keep only recent events (last 10,000)
    if (this.securityEvents.length > 10000) {
      this.securityEvents = this.securityEvents.slice(-10000);
    }

    // Log high severity events
    if (event.severity === 'high' || event.severity === 'critical') {
      logger.warn('Security event logged', {
        eventType: event.eventType,
        severity: event.severity,
        tenantId: event.tenantId,
        userId: event.userId,
        metadata: event.metadata,
      });
    }
  }

  private initializeDefaultTenantAndAdmin(): void {
    // Create default tenant
    const defaultTenant: Tenant = {
      id: 'default-tenant',
      name: 'Default Organization',
      organizationName: 'Default Organization',
      isActive: true,
      subscriptionTier: 'enterprise',
      maxUsers: 1000,
      maxMemories: 1000000,
      maxStorageBytes: 1000 * 1024 * 1024 * 1024,
      createdAt: new Date(),
      updatedAt: new Date(),
      settings: {
        encryptionEnabled: true,
        auditLogsEnabled: true,
      },
    };

    this.tenants.set(defaultTenant.id, defaultTenant);

    // Create default admin user
    const defaultAdmin: User = {
      id: 'default-admin',
      username: 'admin',
      email: 'admin@layered-memory.local',
      passwordHash: bcrypt.hashSync('admin123', this.config.password.saltRounds),
      tenantId: defaultTenant.id,
      roles: ['admin'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    };

    this.users.set(defaultAdmin.id, defaultAdmin);

    logger.info('Default tenant and admin user initialized', {
      tenantId: defaultTenant.id,
      adminUserId: defaultAdmin.id,
    });
  }
}