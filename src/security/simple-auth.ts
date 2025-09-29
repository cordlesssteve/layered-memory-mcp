/**
 * Simplified Authentication for MCP Server Integration
 * A working subset of the full security system for immediate integration
 */

import jwt from 'jsonwebtoken';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { createLogger } from '../utils/logger.js';
import { setupEnvironment, getAuthSecret } from '../config/environment.js';

const logger = createLogger('simple-auth');

export interface SimpleUser {
  id: string;
  username: string;
  email: string;
  tenantId: string;
  roles: ('admin' | 'user')[];
  isActive: boolean;
}

export interface SimpleAuthContext {
  userId: string;
  tenantId: string;
  roles: ('admin' | 'user')[];
  sessionId: string;
  expiresAt: Date;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  token?: string;
  user?: SimpleUser;
  error?: string;
}

export class SimpleAuthService {
  private secret: string;
  private users = new Map<string, SimpleUser & { passwordHash: string }>();
  private env: ReturnType<typeof setupEnvironment>;

  constructor() {
    // Setup environment configuration
    this.env = setupEnvironment();

    // Get auth secret using proper environment management
    this.secret = getAuthSecret(this.env);

    this.initializeDefaultUsers();
  }

  async login(request: LoginRequest): Promise<LoginResponse> {
    try {
      const user = Array.from(this.users.values()).find(u => u.username === request.username);

      if (!user || !user.isActive) {
        return { success: false, error: 'Invalid credentials' };
      }

      const passwordValid = await bcrypt.compare(request.password, user.passwordHash);
      if (!passwordValid) {
        return { success: false, error: 'Invalid credentials' };
      }

      const sessionId = randomUUID();
      const token = this.generateToken(user, sessionId);

      return {
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          tenantId: user.tenantId,
          roles: user.roles,
          isActive: user.isActive,
        },
      };
    } catch (error) {
      logger.error('Login error', { error: error instanceof Error ? error.message : error });
      return { success: false, error: 'Authentication failed' };
    }
  }

  async verifyToken(token: string): Promise<SimpleAuthContext | null> {
    try {
      const decoded = jwt.verify(token, this.secret) as any;
      const user = this.users.get(decoded.sub);

      if (!user || !user.isActive) {
        return null;
      }

      return {
        userId: decoded.sub,
        tenantId: decoded.tid,
        roles: decoded.roles,
        sessionId: decoded.jti,
        expiresAt: new Date(decoded.exp * 1000),
      };
    } catch (error) {
      return null;
    }
  }

  hasPermission(context: SimpleAuthContext, _action: string, resource: string): boolean {
    // Simple permission check
    if (context.roles.includes('admin')) {
      return true; // Admin can do everything
    }

    if (context.roles.includes('user')) {
      // Users can do memory operations
      return resource === 'memory';
    }

    return false;
  }

  private generateToken(user: SimpleUser & { passwordHash: string }, sessionId: string): string {
    // Convert JWT expiration string to milliseconds
    const expirationMs = this.parseJwtExpiration(this.env.jwtExpiresIn);

    const payload = {
      sub: user.id,
      tid: user.tenantId,
      roles: user.roles,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor((Date.now() + expirationMs) / 1000),
      jti: sessionId,
    };

    return jwt.sign(payload, this.secret);
  }

  private parseJwtExpiration(expiration: string): number {
    // Parse JWT expiration string like "24h", "1d", "60m" to milliseconds
    const timeValue = parseInt(expiration.slice(0, -1));
    const timeUnit = expiration.slice(-1);

    switch (timeUnit) {
      case 's':
        return timeValue * 1000;
      case 'm':
        return timeValue * 60 * 1000;
      case 'h':
        return timeValue * 60 * 60 * 1000;
      case 'd':
        return timeValue * 24 * 60 * 60 * 1000;
      default:
        return 24 * 60 * 60 * 1000; // Default to 24 hours
    }
  }

  private initializeDefaultUsers(): void {
    const defaultAdmin = {
      id: 'admin-1',
      username: 'admin',
      email: 'admin@example.com',
      tenantId: 'default-tenant',
      roles: ['admin'] as ('admin' | 'user')[],
      isActive: true,
      passwordHash: bcrypt.hashSync('admin123', 10),
    };

    const defaultUser = {
      id: 'user-1',
      username: 'user',
      email: 'user@example.com',
      tenantId: 'default-tenant',
      roles: ['user'] as ('admin' | 'user')[],
      isActive: true,
      passwordHash: bcrypt.hashSync('user123', 10),
    };

    this.users.set(defaultAdmin.id, defaultAdmin);
    this.users.set(defaultUser.id, defaultUser);

    logger.info('Default users initialized', {
      admin: defaultAdmin.username,
      user: defaultUser.username,
    });
  }
}
