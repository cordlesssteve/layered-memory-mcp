/**
 * Request Validation Middleware for Production Security
 * Validates and sanitizes incoming requests to prevent injection attacks
 */

import { z } from 'zod';
import { createLogger } from '../utils/logger.js';
import type { MemoryMetadata, MemoryQuery } from '../memory/types.js';

const logger = createLogger('request-validator');

export interface ValidationResult<T = any> {
  success: boolean;
  data?: T;
  errors?: Array<{ field: string; message: string; code: string }>;
}

export class RequestValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'RequestValidationError';
  }
}

/**
 * Common validation schemas
 */
export const CommonSchemas = {
  // Basic string validation with length limits
  safeString: z.string()
    .min(1, 'String cannot be empty')
    .max(10000, 'String too long')
    .refine(
      (str) => !/<script|javascript:|data:|vbscript:|onload|onerror/i.test(str),
      'Potentially dangerous content detected'
    ),

  // Memory content with reasonable limits
  memoryContent: z.string()
    .min(1, 'Memory content cannot be empty')
    .max(100000, 'Memory content too long (max 100KB)')
    .refine(
      (str) => !/<script|javascript:|data:|vbscript:/i.test(str),
      'Script content not allowed in memory'
    ),

  // Tags array validation
  tags: z.array(z.string().min(1).max(100))
    .max(20, 'Too many tags (max 20)')
    .refine(
      (tags) => tags.every(tag => /^[a-zA-Z0-9_-]+$/.test(tag)),
      'Tags must contain only alphanumeric characters, hyphens, and underscores'
    ),

  // Priority validation
  priority: z.number()
    .int('Priority must be an integer')
    .min(1, 'Priority must be at least 1')
    .max(10, 'Priority must be at most 10'),

  // Category validation
  category: z.string()
    .min(1, 'Category cannot be empty')
    .max(50, 'Category too long')
    .refine(
      (cat) => /^[a-zA-Z0-9_-]+$/.test(cat),
      'Category must contain only alphanumeric characters, hyphens, and underscores'
    ),

  // ID validation (UUIDs)
  id: z.string()
    .uuid('Invalid ID format'),

  // Limit validation for queries
  limit: z.number()
    .int('Limit must be an integer')
    .min(1, 'Limit must be at least 1')
    .max(1000, 'Limit too high (max 1000)'),

  // Offset validation
  offset: z.number()
    .int('Offset must be an integer')
    .min(0, 'Offset cannot be negative')
    .max(10000, 'Offset too high'),
};

/**
 * Memory-specific validation schemas
 */
const metadataSchema = z.object({
  tags: CommonSchemas.tags,
  category: CommonSchemas.category,
  priority: CommonSchemas.priority,
  source: CommonSchemas.safeString,
  projectId: CommonSchemas.safeString.optional(),
  sessionId: CommonSchemas.safeString.optional(),
  userId: CommonSchemas.safeString.optional(),
  expiresAt: z.date().optional(),
}).passthrough(); // Allow additional custom metadata

const filtersSchema = z.object({
  tags: CommonSchemas.tags.optional(),
  category: CommonSchemas.category.optional(),
  priority: z.object({
    min: CommonSchemas.priority.optional(),
    max: CommonSchemas.priority.optional(),
  }).optional(),
  source: CommonSchemas.safeString.optional(),
  projectId: CommonSchemas.safeString.optional(),
  sessionId: CommonSchemas.safeString.optional(),
  userId: CommonSchemas.safeString.optional(),
  dateRange: z.object({
    start: z.date().optional(),
    end: z.date().optional(),
  }).optional(),
}).passthrough(); // Allow additional custom filters

const querySchema = z.object({
  query: z.string()
    .min(1, 'Query cannot be empty')
    .max(1000, 'Query too long')
    .refine(
      (str) => !/<script|javascript:|data:|vbscript:|onload|onerror/i.test(str),
      'Potentially dangerous content detected'
    ),
  limit: CommonSchemas.limit.optional(),
  offset: CommonSchemas.offset.optional(),
  filters: filtersSchema.optional(),
  similarity: z.object({
    threshold: z.number().min(0).max(1).optional(),
    algorithm: z.enum(['cosine', 'euclidean', 'semantic']).optional(),
    includeMetadata: z.boolean().optional(),
  }).optional(),
});

export const MemorySchemas = {
  metadata: metadataSchema,
  query: querySchema,
  storeRequest: z.object({
    content: CommonSchemas.memoryContent,
    metadata: metadataSchema,
  }),
  updateRequest: z.object({
    id: CommonSchemas.id,
    content: z.union([CommonSchemas.memoryContent, z.undefined()]).optional(),
    metadata: z.union([metadataSchema, z.undefined()]).optional(),
  }).refine(
    (req) => req.content !== undefined || req.metadata !== undefined,
    'Either content or metadata must be provided for update'
  ),
};

/**
 * Authentication validation schemas
 */
export const AuthSchemas = {
  loginRequest: z.object({
    username: z.string()
      .min(3, 'Username too short')
      .max(50, 'Username too long')
      .refine(
        (username) => /^[a-zA-Z0-9_-]+$/.test(username),
        'Username contains invalid characters'
      ),
    password: z.string()
      .min(6, 'Password too short')
      .max(128, 'Password too long'),
  }),

  tokenRequest: z.object({
    token: z.string()
      .min(10, 'Token too short')
      .max(2000, 'Token too long'),
  }),
};

/**
 * Request Validator class
 */
export class RequestValidator {
  /**
   * Validate any request against a schema
   */
  static validate<T>(schema: z.ZodSchema<T>, data: unknown): ValidationResult<T> {
    try {
      const validatedData = schema.parse(data);

      logger.debug('Request validation successful', {
        dataType: typeof data,
        hasData: !!data,
      });

      return {
        success: true,
        data: validatedData,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        logger.warn('Request validation failed', {
          errors,
          receivedData: typeof data === 'object' ? Object.keys(data || {}) : typeof data,
        });

        return {
          success: false,
          errors,
        };
      }

      logger.error('Unexpected validation error', {
        error: error instanceof Error ? error.message : error,
      });

      throw error;
    }
  }

  /**
   * Validate memory store request
   */
  static validateMemoryStore(data: unknown): ValidationResult<{ content: string; metadata: MemoryMetadata }> {
    const result = this.validate(MemorySchemas.storeRequest, data);
    if (!result.success) {
      return result;
    }
    // Type assertion since our schema matches MemoryMetadata structure
    return result as ValidationResult<{ content: string; metadata: MemoryMetadata }>;
  }

  /**
   * Validate memory query request
   */
  static validateMemoryQuery(data: unknown): ValidationResult<MemoryQuery> {
    const result = this.validate(MemorySchemas.query, data);
    if (!result.success) {
      return result;
    }
    // Type assertion since our schema matches MemoryQuery structure
    return result as ValidationResult<MemoryQuery>;
  }

  /**
   * Validate memory update request
   */
  static validateMemoryUpdate(data: unknown): ValidationResult<{ id: string; content?: string | undefined; metadata?: MemoryMetadata | undefined }> {
    const result = this.validate(MemorySchemas.updateRequest, data);
    if (!result.success) {
      return result;
    }
    // Type assertion since our schema matches the expected structure
    return result as ValidationResult<{ id: string; content?: string | undefined; metadata?: MemoryMetadata | undefined }>;
  }

  /**
   * Validate authentication login request
   */
  static validateLogin(data: unknown): ValidationResult<{ username: string; password: string }> {
    return this.validate(AuthSchemas.loginRequest, data);
  }

  /**
   * Validate token request
   */
  static validateToken(data: unknown): ValidationResult<{ token: string }> {
    return this.validate(AuthSchemas.tokenRequest, data);
  }

  /**
   * Sanitize string content to remove potentially dangerous elements
   */
  static sanitizeString(input: string): string {
    return input
      // Remove script tags and dangerous protocols
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/data:/gi, '')
      .replace(/vbscript:/gi, '')
      // Remove event handlers
      .replace(/\s*on\w+\s*=/gi, '')
      // Trim whitespace
      .trim();
  }

  /**
   * Validate and sanitize memory content
   */
  static sanitizeMemoryContent(content: string): ValidationResult<string> {
    try {
      // First validate structure
      const validation = this.validate(CommonSchemas.memoryContent, content);
      if (!validation.success) {
        return validation;
      }

      // Then sanitize
      const sanitized = this.sanitizeString(validation.data!);

      // Ensure sanitization didn't remove too much content
      if (sanitized.length < content.length * 0.5) {
        logger.warn('Sanitization removed significant content', {
          originalLength: content.length,
          sanitizedLength: sanitized.length,
          removalRatio: (content.length - sanitized.length) / content.length,
        });
      }

      return {
        success: true,
        data: sanitized,
      };
    } catch (error) {
      return {
        success: false,
        errors: [{ field: 'content', message: 'Content sanitization failed', code: 'sanitization_error' }],
      };
    }
  }

  /**
   * Rate limit key generation for different request types
   */
  static generateRateLimitKey(requestType: string, context: any): string {
    const base = context.tenantId && context.userId
      ? `${context.tenantId}:${context.userId}`
      : context.ip || 'anonymous';

    return `${requestType}:${base}`;
  }
}

/**
 * Middleware function to validate requests
 */
export function createValidationMiddleware<T>(
  schema: z.ZodSchema<T>,
  onError?: (errors: ValidationResult['errors']) => void
) {
  return (data: unknown): T => {
    const result = RequestValidator.validate(schema, data);

    if (!result.success) {
      if (onError) {
        onError(result.errors);
      }

      const error = new RequestValidationError(
        `Validation failed: ${result.errors?.map(e => e.message).join(', ')}`,
        result.errors?.[0]?.field || 'unknown',
        result.errors?.[0]?.code || 'validation_error'
      );

      throw error;
    }

    return result.data!;
  };
}