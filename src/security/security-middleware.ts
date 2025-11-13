/**
 * Comprehensive Security Middleware
 * Combines rate limiting, request validation, and security headers
 */

import { createLogger } from '../utils/logger.js';
import { MemoryRateLimiter, createRateLimiter } from './rate-limiter.js';
import { RequestValidator, RequestValidationError } from './request-validator.js';
import type { Environment } from '../config/environment.js';
import type { SimpleAuthContext } from './simple-auth.js';

const logger = createLogger('security-middleware');

export interface SecurityContext {
  ip?: string | undefined;
  userAgent?: string | undefined;
  clientId?: string | undefined;
  tenantId?: string | undefined;
  userId?: string | undefined;
  roles?: string[] | undefined;
  sessionId?: string | undefined;
  requestId?: string | undefined;
}

export interface SecurityConfig {
  rateLimiting: {
    enabled: boolean;
    limiter?: MemoryRateLimiter;
  };
  validation: {
    enabled: boolean;
    sanitizeContent: boolean;
  };
  headers: {
    enabled: boolean;
    includeSecurityHeaders: boolean;
  };
  monitoring: {
    enabled: boolean;
    logFailedAttempts: boolean;
    logSuccessfulRequests: boolean;
  };
}

export interface SecurityResult {
  allowed: boolean;
  statusCode?: number | undefined;
  headers?: Record<string, string> | undefined;
  error?:
    | {
        message: string;
        code: string;
        details?: any;
      }
    | undefined;
  retryAfter?: number | undefined;
}

export class SecurityMiddleware {
  private rateLimiter?: MemoryRateLimiter | undefined;
  private config: SecurityConfig;

  constructor(env: Environment, config?: Partial<SecurityConfig>) {
    this.config = {
      rateLimiting: {
        enabled: true,
        limiter: createRateLimiter(env),
      },
      validation: {
        enabled: true,
        sanitizeContent: true,
      },
      headers: {
        enabled: true,
        includeSecurityHeaders: true,
      },
      monitoring: {
        enabled: true,
        logFailedAttempts: true,
        logSuccessfulRequests: env.nodeEnv === 'development',
      },
      ...config,
    };

    this.rateLimiter = this.config.rateLimiting.limiter;

    logger.info('Security middleware initialized', {
      rateLimitingEnabled: this.config.rateLimiting.enabled,
      validationEnabled: this.config.validation.enabled,
      headersEnabled: this.config.headers.enabled,
      monitoringEnabled: this.config.monitoring.enabled,
    });
  }

  /**
   * Main security check for incoming requests
   */
  async checkRequest(
    requestType: string,
    context: SecurityContext,
    payload?: any
  ): Promise<SecurityResult> {
    const startTime = Date.now();
    const requestId = context.requestId || this.generateRequestId();

    try {
      // 1. Rate limiting check
      if (this.config.rateLimiting.enabled && this.rateLimiter) {
        const rateLimitResult = await this.rateLimiter.checkLimit(context);

        if (!rateLimitResult.allowed) {
          await this.logSecurityEvent('rate_limit_exceeded', {
            requestId,
            requestType,
            context: this.sanitizeContext(context),
            retryAfter: rateLimitResult.retryAfter,
          });

          return {
            allowed: false,
            statusCode: 429,
            error: {
              message: 'Rate limit exceeded',
              code: 'RATE_LIMIT_EXCEEDED',
              details: {
                retryAfter: rateLimitResult.retryAfter,
                remainingPoints: rateLimitResult.info.remainingPoints,
              },
            },
            retryAfter: rateLimitResult.retryAfter,
            headers: this.getSecurityHeaders({
              'Retry-After': rateLimitResult.retryAfter?.toString() || '60',
              'X-RateLimit-Limit': this.rateLimiter.getStats().maxRequests.toString(),
              'X-RateLimit-Remaining': rateLimitResult.info.remainingPoints.toString(),
              'X-RateLimit-Reset': new Date(
                Date.now() + rateLimitResult.info.msBeforeNext
              ).toISOString(),
            }),
          };
        }
      }

      // 2. Request validation
      if (this.config.validation.enabled && payload !== undefined) {
        const validationResult = await this.validateRequest(requestType, payload);

        if (!validationResult.success) {
          await this.logSecurityEvent('validation_failed', {
            requestId,
            requestType,
            context: this.sanitizeContext(context),
            errors: validationResult.errors,
          });

          return {
            allowed: false,
            statusCode: 400,
            error: {
              message: 'Request validation failed',
              code: 'VALIDATION_ERROR',
              details: validationResult.errors,
            },
            headers: this.getSecurityHeaders(),
          };
        }
      }

      // 3. Content sanitization
      if (this.config.validation.sanitizeContent && payload?.content) {
        const sanitizationResult = RequestValidator.sanitizeMemoryContent(payload.content);

        if (!sanitizationResult.success) {
          await this.logSecurityEvent('sanitization_failed', {
            requestId,
            requestType,
            context: this.sanitizeContext(context),
            errors: sanitizationResult.errors,
          });

          return {
            allowed: false,
            statusCode: 400,
            error: {
              message: 'Content sanitization failed',
              code: 'SANITIZATION_ERROR',
              details: sanitizationResult.errors,
            },
            headers: this.getSecurityHeaders(),
          };
        }

        // Update payload with sanitized content
        payload.content = sanitizationResult.data;
      }

      // 4. Success logging
      if (this.config.monitoring.logSuccessfulRequests) {
        await this.logSecurityEvent('request_allowed', {
          requestId,
          requestType,
          context: this.sanitizeContext(context),
          processingTimeMs: Date.now() - startTime,
        });
      }

      return {
        allowed: true,
        headers: this.getSecurityHeaders(),
      };
    } catch (error) {
      await this.logSecurityEvent('security_check_error', {
        requestId,
        requestType,
        context: this.sanitizeContext(context),
        error: error instanceof Error ? error.message : error,
      });

      return {
        allowed: false,
        statusCode: 500,
        error: {
          message: 'Security check failed',
          code: 'SECURITY_ERROR',
        },
        headers: this.getSecurityHeaders(),
      };
    }
  }

  /**
   * Check authentication and authorization
   */
  async checkAuth(
    context: SecurityContext,
    authContext?: SimpleAuthContext,
    requiredPermissions?: { action: string; resource: string }
  ): Promise<SecurityResult> {
    // Authentication check
    if (!authContext) {
      await this.logSecurityEvent('authentication_required', {
        context: this.sanitizeContext(context),
      });

      return {
        allowed: false,
        statusCode: 401,
        error: {
          message: 'Authentication required',
          code: 'AUTHENTICATION_REQUIRED',
        },
        headers: this.getSecurityHeaders({
          'WWW-Authenticate': 'Bearer realm="Layered Memory API"',
        }),
      };
    }

    // Authorization check
    if (requiredPermissions) {
      // Note: In a real implementation, you'd check permissions here
      // For now, we'll assume authentication implies authorization
      logger.debug('Authorization check passed', {
        userId: authContext.userId,
        tenantId: authContext.tenantId,
        requiredPermissions,
      });
    }

    return {
      allowed: true,
      headers: this.getSecurityHeaders(),
    };
  }

  /**
   * Validate request based on type
   */
  private async validateRequest(
    requestType: string,
    payload: any
  ): Promise<{ success: boolean; errors?: any }> {
    try {
      switch (requestType) {
        case 'memory_store':
          return RequestValidator.validateMemoryStore(payload);

        case 'memory_search':
          return RequestValidator.validateMemoryQuery(payload);

        case 'memory_update':
          return RequestValidator.validateMemoryUpdate(payload);

        case 'auth_login':
          return RequestValidator.validateLogin(payload);

        case 'auth_token':
          return RequestValidator.validateToken(payload);

        default:
          logger.warn('Unknown request type for validation', { requestType });
          return { success: true }; // Allow unknown types by default
      }
    } catch (error) {
      if (error instanceof RequestValidationError) {
        return {
          success: false,
          errors: [{ field: error._field, message: error.message, code: error._code }],
        };
      }
      throw error;
    }
  }

  /**
   * Get security headers
   */
  private getSecurityHeaders(
    additionalHeaders?: Record<string, string>
  ): Record<string, string> | undefined {
    if (!this.config.headers.enabled) {
      return additionalHeaders;
    }

    const headers: Record<string, string> = {
      'X-Request-ID': this.generateRequestId(),
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      ...additionalHeaders,
    };

    if (this.config.headers.includeSecurityHeaders) {
      headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
      headers['Content-Security-Policy'] = "default-src 'self'; script-src 'none'";
    }

    return headers;
  }

  /**
   * Log security events
   */
  private async logSecurityEvent(eventType: string, details: any): Promise<void> {
    if (!this.config.monitoring.enabled) {
      return;
    }

    const shouldLog =
      eventType.includes('failed') || eventType.includes('exceeded') || eventType.includes('error')
        ? this.config.monitoring.logFailedAttempts
        : this.config.monitoring.logSuccessfulRequests;

    if (shouldLog) {
      logger.info('Security event', {
        eventType,
        timestamp: new Date().toISOString(),
        ...details,
      });
    }
  }

  /**
   * Sanitize context for logging
   */
  private sanitizeContext(context: SecurityContext): Record<string, any> {
    return {
      ip: context.ip ? `${context.ip.substring(0, 8)}...` : undefined,
      userAgent: context.userAgent ? `${context.userAgent.substring(0, 50)}...` : undefined,
      tenantId: context.tenantId,
      userId: context.userId,
      roles: context.roles,
      hasSession: !!context.sessionId,
    };
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get rate limiter statistics
   */
  getStats(): any {
    return {
      rateLimiter: this.rateLimiter?.getStats(),
      config: {
        rateLimitingEnabled: this.config.rateLimiting.enabled,
        validationEnabled: this.config.validation.enabled,
        headersEnabled: this.config.headers.enabled,
        monitoringEnabled: this.config.monitoring.enabled,
      },
    };
  }

  /**
   * Reset rate limit for a context
   */
  async resetRateLimit(context: SecurityContext): Promise<void> {
    if (this.rateLimiter) {
      await this.rateLimiter.reset(context);
    }
  }
}

/**
 * Create security middleware from environment
 */
export function createSecurityMiddleware(
  env: Environment,
  config?: Partial<SecurityConfig>
): SecurityMiddleware {
  return new SecurityMiddleware(env, config);
}
