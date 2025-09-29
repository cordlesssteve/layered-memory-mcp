/**
 * Security Middleware - Authentication and Authorization for MCP Tools
 * Phase 2.1.1: Authentication Foundation
 */

import { createLogger } from '../utils/logger.js';
import { AuthenticationService } from './auth-service.js';
import { AuthorizationService } from './authorization-service.js';
import type {
  AuthContext,
  SecurityConfig,
  ResourceType,
  ActionType,
  SecurityEvent,
} from './types.js';

const logger = createLogger('security-middleware');

export interface SecuredToolRequest {
  toolName: string;
  arguments: any;
  headers?: Record<string, string>;
  context?: AuthContext;
}

export interface SecurityMiddlewareConfig {
  enableAuthentication: boolean;
  enableAuthorization: boolean;
  requireHttpsInProduction: boolean;
  allowAnonymousAccess: string[]; // Tool names that don't require authentication
  rateLimitByUser: boolean;
}

export class SecurityMiddleware {
  private authService: AuthenticationService;
  private authzService: AuthorizationService;
  private config: SecurityMiddlewareConfig;
  private securityConfig: SecurityConfig;
  private requestCounts = new Map<string, { count: number; resetTime: number }>();

  constructor(
    authService: AuthenticationService,
    authzService: AuthorizationService,
    securityConfig: SecurityConfig,
    config: SecurityMiddlewareConfig
  ) {
    this.authService = authService;
    this.authzService = authzService;
    this.securityConfig = securityConfig;
    this.config = config;
  }

  /**
   * Main security middleware function
   */
  async validateRequest(request: SecuredToolRequest): Promise<{
    success: boolean;
    context?: AuthContext;
    error?: string;
    statusCode?: number;
  }> {
    try {
      // Check if tool allows anonymous access
      if (this.config.allowAnonymousAccess.includes(request.toolName)) {
        logger.debug('Anonymous access allowed for tool', { toolName: request.toolName });
        return { success: true };
      }

      // Skip security if disabled
      if (!this.config.enableAuthentication) {
        logger.debug('Authentication disabled, allowing request');
        return { success: true };
      }

      // Extract and validate authentication token
      const authResult = await this.authenticateRequest(request);
      if (!authResult.success) {
        return authResult;
      }

      const authContext = authResult.context!;

      // Check rate limits
      const rateLimitResult = await this.checkRateLimit(authContext, request.toolName);
      if (!rateLimitResult.success) {
        return rateLimitResult;
      }

      // Check authorization if enabled
      if (this.config.enableAuthorization) {
        const authzResult = await this.authorizeRequest(authContext, request);
        if (!authzResult.success) {
          return authzResult;
        }
      }

      // Log successful security validation
      logger.debug('Request security validation passed', {
        userId: authContext.userId,
        tenantId: authContext.tenantId,
        toolName: request.toolName,
        roles: authContext.roles,
      });

      return {
        success: true,
        context: authContext,
      };
    } catch (error) {
      logger.error('Security middleware error', {
        toolName: request.toolName,
        error: error instanceof Error ? error.message : error,
      });

      return {
        success: false,
        error: 'Security validation failed',
        statusCode: 500,
      };
    }
  }

  /**
   * Create secured version of a tool handler
   */
  secureToolHandler<T extends any[], R>(
    _toolName: string,
    handler: (_context: AuthContext, ..._args: T) => Promise<R>,
    requiredResource: ResourceType,
    requiredAction: ActionType
  ) {
    return async (...args: T): Promise<R> => {
      // Extract context from arguments (assumed to be first parameter)
      const context = args[0] as AuthContext;

      if (!context) {
        throw new Error('Authentication context required');
      }

      // Verify authorization
      const hasPermission = this.authzService.hasPermission(
        context,
        requiredResource,
        requiredAction
      );

      if (!hasPermission) {
        const securityEvent = this.authzService.generateAuthorizationEvent(
          context,
          requiredResource,
          requiredAction
        );

        await this.logSecurityEvent(securityEvent);

        throw new Error(
          `Insufficient permissions: ${requiredAction} on ${requiredResource} not allowed`
        );
      }

      // Execute the handler
      return handler(context, ...args);
    };
  }

  /**
   * Get tool security requirements
   */
  getToolSecurityRequirements(toolName: string): {
    resource: ResourceType;
    action: ActionType;
  } | null {
    // Map tool names to security requirements
    const securityMap: Record<string, { resource: ResourceType; action: ActionType }> = {
      store_memory: { resource: 'memory', action: 'create' },
      search_memory: { resource: 'memory', action: 'search' },
      get_memory_stats: { resource: 'memory', action: 'read' },
      advanced_search: { resource: 'memory', action: 'search' },
      semantic_search: { resource: 'memory', action: 'search' },
      temporal_search: { resource: 'memory', action: 'search' },
      build_knowledge_graph: { resource: 'knowledge-graph', action: 'create' },
      get_memory_relationships: { resource: 'relationship', action: 'read' },
      detect_conflicts: { resource: 'memory', action: 'read' },
      get_memory_versions: { resource: 'memory', action: 'read' },
      summarize_cluster: { resource: 'memory', action: 'read' },
      get_relationship_suggestions: { resource: 'relationship', action: 'read' },
      validate_relationship: { resource: 'relationship', action: 'update' },
      get_validation_stats: { resource: 'relationship', action: 'read' },
      predict_memory_decay: { resource: 'memory', action: 'read' },
      get_urgent_memories: { resource: 'memory', action: 'read' },
      get_promotion_candidates: { resource: 'memory', action: 'read' },
      get_archival_candidates: { resource: 'memory', action: 'read' },
      get_decay_insights: { resource: 'memory', action: 'read' },
    };

    return securityMap[toolName] || null;
  }

  // Private helper methods

  private async authenticateRequest(request: SecuredToolRequest): Promise<{
    success: boolean;
    context?: AuthContext;
    error?: string;
    statusCode?: number;
  }> {
    // Extract token from headers
    const authHeader = request.headers?.['authorization'];
    if (!authHeader) {
      return {
        success: false,
        error: 'Authorization header missing',
        statusCode: 401,
      };
    }

    // Validate Bearer token format
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/);
    if (!tokenMatch) {
      return {
        success: false,
        error: 'Invalid authorization header format',
        statusCode: 401,
      };
    }

    const [, token] = tokenMatch!;

    // Verify token
    const authContext = await this.authService.verifyToken(token as string);
    if (!authContext) {
      return {
        success: false,
        error: 'Invalid or expired token',
        statusCode: 401,
      };
    }

    // Check if token is expired
    if (authContext.expiresAt < new Date()) {
      return {
        success: false,
        error: 'Token expired',
        statusCode: 401,
      };
    }

    return {
      success: true,
      context: authContext,
    };
  }

  private async authorizeRequest(
    context: AuthContext,
    request: SecuredToolRequest
  ): Promise<{
    success: boolean;
    error?: string;
    statusCode?: number;
  }> {
    const securityRequirement = this.getToolSecurityRequirements(request.toolName);

    if (!securityRequirement) {
      logger.warn('No security requirements defined for tool', {
        toolName: request.toolName,
      });
      // Allow access if no specific requirements defined
      return { success: true };
    }

    const hasPermission = this.authzService.hasPermission(
      context,
      securityRequirement.resource,
      securityRequirement.action
    );

    if (!hasPermission) {
      // Log authorization failure
      const securityEvent = this.authzService.generateAuthorizationEvent(
        context,
        securityRequirement.resource,
        securityRequirement.action
      );

      await this.logSecurityEvent(securityEvent);

      return {
        success: false,
        error: `Insufficient permissions for ${request.toolName}`,
        statusCode: 403,
      };
    }

    return { success: true };
  }

  private async checkRateLimit(
    context: AuthContext,
    toolName: string
  ): Promise<{
    success: boolean;
    error?: string;
    statusCode?: number;
  }> {
    if (!this.config.rateLimitByUser) {
      return { success: true };
    }

    const rateLimitConfig = this.securityConfig.rateLimit.memoryOperations;
    const { userId } = context;
    const now = Date.now();
    const { windowMs } = rateLimitConfig;

    // Get or create rate limit entry
    let userEntry = this.requestCounts.get(userId);
    if (!userEntry || userEntry.resetTime <= now) {
      userEntry = {
        count: 0,
        resetTime: now + windowMs,
      };
      this.requestCounts.set(userId, userEntry);
    }

    // Check if limit exceeded
    if (userEntry.count >= rateLimitConfig.maxRequests) {
      // Log rate limit violation
      await this.logSecurityEvent({
        id: '',
        tenantId: context.tenantId,
        userId: context.userId,
        eventType: 'rate_limit_exceeded',
        severity: 'medium',
        resource: 'memory',
        action: 'create',
        metadata: {
          toolName,
          requestCount: userEntry.count,
          windowMs,
          maxRequests: rateLimitConfig.maxRequests,
        },
        timestamp: new Date(),
      });

      return {
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
        statusCode: 429,
      };
    }

    // Increment counter
    userEntry.count++;

    return { success: true };
  }

  private async logSecurityEvent(event: SecurityEvent): Promise<void> {
    // For now, log to console. In production, this would be sent to
    // a security event aggregation system
    logger.warn('Security event', {
      eventType: event.eventType,
      severity: event.severity,
      tenantId: event.tenantId,
      userId: event.userId,
      resource: event.resource,
      action: event.action,
      metadata: event.metadata,
    });
  }
}
