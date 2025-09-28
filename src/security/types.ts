/**
 * Security Types - Authentication, Authorization, and Multi-tenancy
 * Core types for Epic 2.1: Security & Multi-tenancy
 */

import type { MemoryMetadata } from '../memory/types.js';

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  tenantId: string;
  roles: UserRole[];
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  metadata: {
    preferences?: Record<string, any>;
    settings?: Record<string, any>;
  };
}

export interface Tenant {
  id: string;
  name: string;
  organizationName: string;
  isActive: boolean;
  subscriptionTier: 'free' | 'pro' | 'enterprise';
  maxUsers: number;
  maxMemories: number;
  maxStorageBytes: number;
  createdAt: Date;
  updatedAt: Date;
  settings: {
    dataRetentionDays?: number;
    encryptionEnabled: boolean;
    auditLogsEnabled: boolean;
    allowedDomains?: string[];
  };
}

export type UserRole = 'admin' | 'user' | 'readonly' | 'guest';

export interface Permission {
  resource: ResourceType;
  action: ActionType;
  conditions?: PermissionCondition[];
}

export type ResourceType =
  | 'memory'
  | 'tenant'
  | 'user'
  | 'audit'
  | 'system'
  | 'relationship'
  | 'knowledge-graph';

export type ActionType =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'search'
  | 'export'
  | 'admin';

export interface PermissionCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'matches';
  value: any;
}

export interface AuthContext {
  userId: string;
  tenantId: string;
  roles: UserRole[];
  permissions: Permission[];
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
  authenticatedAt: Date;
  expiresAt: Date;
}

export interface JWT {
  sub: string; // user ID
  tid: string; // tenant ID
  roles: UserRole[];
  iat: number; // issued at
  exp: number; // expires at
  jti: string; // JWT ID (session ID)
}

export interface AuthenticationRequest {
  username: string;
  password: string;
  tenantId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthenticationResponse {
  success: boolean;
  token?: string;
  refreshToken?: string;
  user?: Omit<User, 'passwordHash'>;
  expiresAt?: Date;
  error?: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (request: any) => string;
}

export interface SecurityEvent {
  id: string;
  tenantId: string;
  userId?: string;
  eventType: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resource?: string;
  action?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata: Record<string, any>;
  timestamp: Date;
}

export type SecurityEventType =
  | 'authentication_success'
  | 'authentication_failure'
  | 'authorization_failure'
  | 'token_expired'
  | 'token_refresh'
  | 'suspicious_activity'
  | 'rate_limit_exceeded'
  | 'data_access'
  | 'data_modification'
  | 'admin_action'
  | 'security_violation';

export interface AuditLog {
  id: string;
  tenantId: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: Record<string, { before: any; after: any }>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

// Multi-tenant memory context
export interface TenantContext {
  tenantId: string;
  userId: string;
  roles: UserRole[];
  permissions: Permission[];
}

// Enhanced memory metadata with security context
export interface SecureMemoryMetadata extends MemoryMetadata {
  tenantId: string;
  createdBy: string;
  visibility: 'private' | 'shared' | 'public';
  accessControlList?: string[]; // User IDs with access
  encryption?: {
    algorithm: string;
    keyId: string;
    iv?: string;
  };
  classification?: 'public' | 'internal' | 'confidential' | 'restricted';
}


// Role-based permissions mapping
export interface RolePermissions {
  admin: Permission[];
  user: Permission[];
  readonly: Permission[];
  guest: Permission[];
}

export interface SecurityConfig {
  jwt: {
    secret: string;
    expiresIn: string;
    refreshExpiresIn: string;
    algorithm: 'HS256' | 'HS384' | 'HS512';
  };
  password: {
    minLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSpecialChars: boolean;
    saltRounds: number;
  };
  rateLimit: {
    authentication: RateLimitConfig;
    apiCalls: RateLimitConfig;
    memoryOperations: RateLimitConfig;
  };
  encryption: {
    algorithm: string;
    keyLength: number;
    ivLength: number;
  };
  audit: {
    enabled: boolean;
    retentionDays: number;
    sensitiveFields: string[];
  };
}