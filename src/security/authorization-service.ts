/**
 * Authorization Service - Role-Based Access Control (RBAC)
 * Phase 2.1.1: Authentication Foundation
 */

import { createLogger } from '../utils/logger.js';
import type {
  AuthContext,
  Permission,
  ResourceType,
  ActionType,
  UserRole,
  TenantContext,
  SecurityEvent,
} from './types.js';

const logger = createLogger('authorization-service');

export class AuthorizationService {
  private rolePermissions: Map<UserRole, Permission[]> = new Map();
  private resourceHierarchy: Map<ResourceType, ResourceType[]> = new Map();

  constructor() {
    this.initializeRolePermissions();
    this.initializeResourceHierarchy();
  }

  /**
   * Check if user has permission to perform action on resource
   */
  hasPermission(
    context: AuthContext,
    resource: ResourceType,
    action: ActionType,
    resourceId?: string
  ): boolean {
    try {
      // Check direct permissions
      const hasDirectPermission = this.checkDirectPermissions(context, resource, action);

      if (hasDirectPermission) {
        return true;
      }

      // Check inherited permissions from resource hierarchy
      const hasInheritedPermission = this.checkInheritedPermissions(context, resource, action);

      if (hasInheritedPermission) {
        return true;
      }

      // Check resource-specific permissions
      if (resourceId) {
        const hasResourceSpecificPermission = this.checkResourceSpecificPermissions(
          context,
          resource,
          action,
          resourceId
        );

        if (hasResourceSpecificPermission) {
          return true;
        }
      }

      logger.debug('Permission denied', {
        userId: context.userId,
        tenantId: context.tenantId,
        roles: context.roles,
        resource,
        action,
        resourceId,
      });

      return false;
    } catch (error) {
      logger.error('Permission check error', {
        userId: context.userId,
        tenantId: context.tenantId,
        resource,
        action,
        error: error instanceof Error ? error.message : error,
      });

      // Fail securely - deny access on errors
      return false;
    }
  }

  /**
   * Get all permissions for a user context
   */
  getPermissions(context: AuthContext): Permission[] {
    const allPermissions: Permission[] = [];

    for (const role of context.roles) {
      const rolePermissions = this.rolePermissions.get(role);
      if (rolePermissions) {
        allPermissions.push(...rolePermissions);
      }
    }

    // Remove duplicates
    return this.deduplicatePermissions(allPermissions);
  }

  /**
   * Check if user can access specific tenant resources
   */
  canAccessTenant(context: AuthContext, targetTenantId: string): boolean {
    // Users can only access their own tenant unless they have system admin role
    if (context.tenantId === targetTenantId) {
      return true;
    }

    // System admin can access any tenant
    return this.hasPermission(context, 'system', 'admin');
  }

  /**
   * Filter permissions by resource type
   */
  getResourcePermissions(context: AuthContext, resource: ResourceType): Permission[] {
    const allPermissions = this.getPermissions(context);
    return allPermissions.filter(p => p.resource === resource);
  }

  /**
   * Get allowed actions for a resource
   */
  getAllowedActions(context: AuthContext, resource: ResourceType): ActionType[] {
    const resourcePermissions = this.getResourcePermissions(context, resource);
    return [...new Set(resourcePermissions.map(p => p.action))];
  }

  /**
   * Validate tenant context for multi-tenant operations
   */
  validateTenantContext(context: AuthContext, requestedTenantId?: string): boolean {
    if (!requestedTenantId) {
      return true; // No specific tenant requested
    }

    if (requestedTenantId === context.tenantId) {
      return true; // User accessing their own tenant
    }

    // Check if user has cross-tenant admin permissions
    return this.hasPermission(context, 'system', 'admin');
  }

  /**
   * Create tenant-scoped context for operations
   */
  createTenantContext(authContext: AuthContext): TenantContext {
    return {
      tenantId: authContext.tenantId,
      userId: authContext.userId,
      roles: authContext.roles,
      permissions: this.getPermissions(authContext),
    };
  }

  /**
   * Check if user has admin privileges
   */
  isAdmin(context: AuthContext): boolean {
    return context.roles.includes('admin');
  }

  /**
   * Check if user has any of the specified roles
   */
  hasAnyRole(context: AuthContext, roles: UserRole[]): boolean {
    return roles.some(role => context.roles.includes(role));
  }

  /**
   * Check if user has all of the specified roles
   */
  hasAllRoles(context: AuthContext, roles: UserRole[]): boolean {
    return roles.every(role => context.roles.includes(role));
  }

  /**
   * Generate security event for authorization failure
   */
  generateAuthorizationEvent(
    context: AuthContext,
    resource: ResourceType,
    action: ActionType,
    resourceId?: string
  ): SecurityEvent {
    return {
      id: '', // Will be set by security service
      tenantId: context.tenantId,
      userId: context.userId,
      eventType: 'authorization_failure',
      severity: 'medium',
      resource,
      action,
      metadata: {
        roles: context.roles,
        sessionId: context.sessionId,
        resourceId,
        timestamp: new Date(),
      },
      timestamp: new Date(),
    };
  }

  // Private helper methods

  private checkDirectPermissions(
    context: AuthContext,
    resource: ResourceType,
    action: ActionType
  ): boolean {
    for (const role of context.roles) {
      const rolePermissions = this.rolePermissions.get(role);
      if (!rolePermissions) continue;

      for (const permission of rolePermissions) {
        if (this.matchesPermission(permission, resource, action)) {
          return true;
        }
      }
    }

    return false;
  }

  private checkInheritedPermissions(
    context: AuthContext,
    resource: ResourceType,
    action: ActionType
  ): boolean {
    const parentResources = this.resourceHierarchy.get(resource) || [];

    for (const parentResource of parentResources) {
      if (this.checkDirectPermissions(context, parentResource, action)) {
        return true;
      }
    }

    return false;
  }

  private checkResourceSpecificPermissions(
    context: AuthContext,
    resource: ResourceType,
    action: ActionType,
    resourceId: string
  ): boolean {
    // For now, implement basic ownership-based permissions
    // This can be enhanced with more complex ACL logic

    if (resource === 'memory' && action === 'read') {
      // Users can read memories they created
      // This would require checking memory ownership in practice
      // For now, allow if resourceId is provided (indicates user has some knowledge of the resource)
      return !!resourceId && context.userId !== undefined;
    }

    return false;
  }

  private matchesPermission(
    permission: Permission,
    resource: ResourceType,
    action: ActionType
  ): boolean {
    // Exact match
    if (permission.resource === resource && permission.action === action) {
      return true;
    }

    // Admin permission grants all actions on resource
    if (permission.resource === resource && permission.action === 'admin') {
      return true;
    }

    // System admin grants everything
    if (permission.resource === 'system' && permission.action === 'admin') {
      return true;
    }

    return false;
  }

  private deduplicatePermissions(permissions: Permission[]): Permission[] {
    const seen = new Set<string>();
    const unique: Permission[] = [];

    for (const permission of permissions) {
      const key = `${permission.resource}:${permission.action}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(permission);
      }
    }

    return unique;
  }

  private initializeRolePermissions(): void {
    // Admin role - full access to everything
    this.rolePermissions.set('admin', [
      { resource: 'system', action: 'admin' },
      { resource: 'tenant', action: 'admin' },
      { resource: 'user', action: 'admin' },
      { resource: 'memory', action: 'admin' },
      { resource: 'relationship', action: 'admin' },
      { resource: 'knowledge-graph', action: 'admin' },
      { resource: 'audit', action: 'read' },
    ]);

    // User role - standard user permissions
    this.rolePermissions.set('user', [
      { resource: 'memory', action: 'create' },
      { resource: 'memory', action: 'read' },
      { resource: 'memory', action: 'update' },
      { resource: 'memory', action: 'delete' },
      { resource: 'memory', action: 'search' },
      { resource: 'memory', action: 'export' },
      { resource: 'relationship', action: 'read' },
      { resource: 'relationship', action: 'create' },
      { resource: 'knowledge-graph', action: 'read' },
      { resource: 'knowledge-graph', action: 'create' },
    ]);

    // Readonly role - read-only access
    this.rolePermissions.set('readonly', [
      { resource: 'memory', action: 'read' },
      { resource: 'memory', action: 'search' },
      { resource: 'relationship', action: 'read' },
      { resource: 'knowledge-graph', action: 'read' },
    ]);

    // Guest role - very limited access
    this.rolePermissions.set('guest', [
      { resource: 'memory', action: 'read' },
      { resource: 'memory', action: 'search' },
    ]);

    logger.info('Role permissions initialized', {
      roles: Array.from(this.rolePermissions.keys()),
    });
  }

  private initializeResourceHierarchy(): void {
    // Define resource inheritance hierarchy
    // Child resources inherit permissions from parent resources

    this.resourceHierarchy.set('memory', ['tenant']);
    this.resourceHierarchy.set('relationship', ['memory', 'tenant']);
    this.resourceHierarchy.set('knowledge-graph', ['memory', 'tenant']);
    this.resourceHierarchy.set('user', ['tenant']);
    this.resourceHierarchy.set('audit', ['tenant']);

    logger.info('Resource hierarchy initialized', {
      resources: Array.from(this.resourceHierarchy.keys()),
    });
  }
}
