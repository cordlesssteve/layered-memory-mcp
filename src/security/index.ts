/**
 * Security Module - Epic 2.1: Security & Multi-tenancy
 * Exports for authentication, authorization, and security middleware
 */

// Core services
export { AuthenticationService } from './auth-service.js';
export { AuthorizationService } from './authorization-service.js';
export { SecurityMiddleware } from './middleware.js';

// Configuration
export {
  getSecurityConfig,
  validateSecurityConfig,
  createSecurityConfigValidator,
  defaultSecurityConfig,
  developmentSecurityConfig,
  productionSecurityConfig,
} from './config.js';

// Types
export type {
  User,
  Tenant,
  UserRole,
  Permission,
  ResourceType,
  ActionType,
  AuthContext,
  JWT,
  AuthenticationRequest,
  AuthenticationResponse,
  RefreshTokenRequest,
  SecurityConfig,
  SecurityEvent,
  AuditLog,
  TenantContext,
  SecureMemoryMetadata,
  RolePermissions,
  PermissionCondition,
  RateLimitConfig,
} from './types.js';

export type { SecuredToolRequest, SecurityMiddlewareConfig } from './middleware.js';
