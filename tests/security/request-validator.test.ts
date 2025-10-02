/**
 * Unit tests for Request Validator
 * Testing validation schemas, sanitization, and error handling
 */

import { describe, expect, it } from '@jest/globals';
import {
  RequestValidator,
  RequestValidationError,
  CommonSchemas,
  MemorySchemas,
  AuthSchemas,
  createValidationMiddleware,
} from '../../src/security/request-validator.js';

describe('RequestValidator', () => {
  describe('CommonSchemas', () => {
    describe('safeString', () => {
      it('should validate valid strings', () => {
        const result = CommonSchemas.safeString.safeParse('Hello world');
        expect(result.success).toBe(true);
      });

      it('should reject empty strings', () => {
        const result = CommonSchemas.safeString.safeParse('');
        expect(result.success).toBe(false);
      });

      it('should reject strings with script tags', () => {
        const result = CommonSchemas.safeString.safeParse('<script>alert("xss")</script>');
        expect(result.success).toBe(false);
      });

      it('should reject strings with javascript: protocol', () => {
        const result = CommonSchemas.safeString.safeParse('javascript:alert("xss")');
        expect(result.success).toBe(false);
      });

      it('should reject strings with data: protocol', () => {
        const result = CommonSchemas.safeString.safeParse(
          'data:text/html,<script>alert(1)</script>'
        );
        expect(result.success).toBe(false);
      });

      it('should reject extremely long strings', () => {
        const result = CommonSchemas.safeString.safeParse('a'.repeat(10001));
        expect(result.success).toBe(false);
      });
    });

    describe('memoryContent', () => {
      it('should validate normal memory content', () => {
        const result = CommonSchemas.memoryContent.safeParse('This is valid memory content');
        expect(result.success).toBe(true);
      });

      it('should reject empty content', () => {
        const result = CommonSchemas.memoryContent.safeParse('');
        expect(result.success).toBe(false);
      });

      it('should reject content over 100KB', () => {
        const result = CommonSchemas.memoryContent.safeParse('a'.repeat(100001));
        expect(result.success).toBe(false);
      });

      it('should reject script content', () => {
        const result = CommonSchemas.memoryContent.safeParse('Some text <script>alert(1)</script>');
        expect(result.success).toBe(false);
      });
    });

    describe('tags', () => {
      it('should validate valid tags array', () => {
        const result = CommonSchemas.tags.safeParse(['tag1', 'tag-2', 'tag_3']);
        expect(result.success).toBe(true);
      });

      it('should reject tags with special characters', () => {
        const result = CommonSchemas.tags.safeParse(['tag1', 'tag@2']);
        expect(result.success).toBe(false);
      });

      it('should reject more than 20 tags', () => {
        const tags = Array.from({ length: 21 }, (_, i) => `tag${i}`);
        const result = CommonSchemas.tags.safeParse(tags);
        expect(result.success).toBe(false);
      });

      it('should reject empty tag strings', () => {
        const result = CommonSchemas.tags.safeParse(['tag1', '']);
        expect(result.success).toBe(false);
      });
    });

    describe('priority', () => {
      it('should validate priority in range 1-10', () => {
        expect(CommonSchemas.priority.safeParse(5).success).toBe(true);
        expect(CommonSchemas.priority.safeParse(1).success).toBe(true);
        expect(CommonSchemas.priority.safeParse(10).success).toBe(true);
      });

      it('should reject priority less than 1', () => {
        expect(CommonSchemas.priority.safeParse(0).success).toBe(false);
      });

      it('should reject priority greater than 10', () => {
        expect(CommonSchemas.priority.safeParse(11).success).toBe(false);
      });

      it('should reject non-integer priority', () => {
        expect(CommonSchemas.priority.safeParse(5.5).success).toBe(false);
      });
    });

    describe('category', () => {
      it('should validate alphanumeric category with hyphens and underscores', () => {
        expect(CommonSchemas.category.safeParse('test-category_1').success).toBe(true);
      });

      it('should reject category with spaces', () => {
        expect(CommonSchemas.category.safeParse('test category').success).toBe(false);
      });

      it('should reject category with special characters', () => {
        expect(CommonSchemas.category.safeParse('test@category').success).toBe(false);
      });
    });

    describe('id', () => {
      it('should validate valid UUID', () => {
        const result = CommonSchemas.id.safeParse('550e8400-e29b-41d4-a716-446655440000');
        expect(result.success).toBe(true);
      });

      it('should reject invalid UUID format', () => {
        expect(CommonSchemas.id.safeParse('not-a-uuid').success).toBe(false);
      });
    });

    describe('limit', () => {
      it('should validate limit in valid range', () => {
        expect(CommonSchemas.limit.safeParse(100).success).toBe(true);
      });

      it('should reject limit less than 1', () => {
        expect(CommonSchemas.limit.safeParse(0).success).toBe(false);
      });

      it('should reject limit greater than 1000', () => {
        expect(CommonSchemas.limit.safeParse(1001).success).toBe(false);
      });
    });

    describe('offset', () => {
      it('should validate non-negative offset', () => {
        expect(CommonSchemas.offset.safeParse(0).success).toBe(true);
        expect(CommonSchemas.offset.safeParse(100).success).toBe(true);
      });

      it('should reject negative offset', () => {
        expect(CommonSchemas.offset.safeParse(-1).success).toBe(false);
      });

      it('should reject offset too high', () => {
        expect(CommonSchemas.offset.safeParse(10001).success).toBe(false);
      });
    });
  });

  describe('MemorySchemas', () => {
    describe('storeRequest', () => {
      it('should validate valid store request', () => {
        const result = MemorySchemas.storeRequest.safeParse({
          content: 'Test memory content',
          metadata: {
            tags: ['test'],
            category: 'testing',
            priority: 5,
            source: 'test-source',
          },
        });
        expect(result.success).toBe(true);
      });

      it('should reject missing content', () => {
        const result = MemorySchemas.storeRequest.safeParse({
          metadata: {
            tags: ['test'],
            category: 'testing',
            priority: 5,
            source: 'test-source',
          },
        });
        expect(result.success).toBe(false);
      });
    });

    describe('updateRequest', () => {
      it('should validate update with content only', () => {
        const result = MemorySchemas.updateRequest.safeParse({
          id: '550e8400-e29b-41d4-a716-446655440000',
          content: 'Updated content',
        });
        expect(result.success).toBe(true);
      });

      it('should validate update with metadata only', () => {
        const result = MemorySchemas.updateRequest.safeParse({
          id: '550e8400-e29b-41d4-a716-446655440000',
          metadata: {
            tags: ['updated'],
            category: 'updated',
            priority: 7,
            source: 'updated-source',
          },
        });
        expect(result.success).toBe(true);
      });

      it('should reject update without content or metadata', () => {
        const result = MemorySchemas.updateRequest.safeParse({
          id: '550e8400-e29b-41d4-a716-446655440000',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('query', () => {
      it('should validate query with all options', () => {
        const result = MemorySchemas.query.safeParse({
          query: 'search text',
          limit: 10,
          offset: 0,
          filters: {
            tags: ['filter'],
            category: 'test',
          },
          similarity: {
            threshold: 0.8,
            algorithm: 'cosine',
            includeMetadata: true,
          },
        });
        expect(result.success).toBe(true);
      });

      it('should validate minimal query', () => {
        const result = MemorySchemas.query.safeParse({
          query: 'simple search',
        });
        expect(result.success).toBe(true);
      });

      it('should reject dangerous query content', () => {
        const result = MemorySchemas.query.safeParse({
          query: '<script>alert(1)</script>',
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe('AuthSchemas', () => {
    describe('loginRequest', () => {
      it('should validate valid login', () => {
        const result = AuthSchemas.loginRequest.safeParse({
          username: 'testuser',
          password: 'password123',
        });
        expect(result.success).toBe(true);
      });

      it('should reject short username', () => {
        const result = AuthSchemas.loginRequest.safeParse({
          username: 'ab',
          password: 'password123',
        });
        expect(result.success).toBe(false);
      });

      it('should reject username with invalid characters', () => {
        const result = AuthSchemas.loginRequest.safeParse({
          username: 'user@name',
          password: 'password123',
        });
        expect(result.success).toBe(false);
      });

      it('should reject short password', () => {
        const result = AuthSchemas.loginRequest.safeParse({
          username: 'testuser',
          password: '12345',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('tokenRequest', () => {
      it('should validate valid token', () => {
        const result = AuthSchemas.tokenRequest.safeParse({
          token: 'validtokenstring',
        });
        expect(result.success).toBe(true);
      });

      it('should reject short token', () => {
        const result = AuthSchemas.tokenRequest.safeParse({
          token: 'short',
        });
        expect(result.success).toBe(false);
      });
    });
  });

  describe('RequestValidator.validate', () => {
    it('should return success for valid data', () => {
      const result = RequestValidator.validate(CommonSchemas.safeString, 'valid string');
      expect(result.success).toBe(true);
      expect(result.data).toBe('valid string');
      expect(result.errors).toBeUndefined();
    });

    it('should return errors for invalid data', () => {
      const result = RequestValidator.validate(CommonSchemas.safeString, '');
      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should format zod errors correctly', () => {
      const result = RequestValidator.validate(CommonSchemas.priority, 15);
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toMatchObject({
        field: expect.any(String),
        message: expect.any(String),
        code: expect.any(String),
      });
    });

    it('should throw on unexpected errors', () => {
      const badSchema: any = {
        parse: () => {
          throw new Error('Unexpected error');
        },
      };
      expect(() => {
        RequestValidator.validate(badSchema, {});
      }).toThrow('Unexpected error');
    });
  });

  describe('RequestValidator.validateMemoryStore', () => {
    it('should validate valid memory store request', () => {
      const result = RequestValidator.validateMemoryStore({
        content: 'Test content',
        metadata: {
          tags: ['test'],
          category: 'test',
          priority: 5,
          source: 'test',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should return errors for invalid store request', () => {
      const result = RequestValidator.validateMemoryStore({
        content: '', // Empty content
        metadata: {
          tags: [],
          category: 'test',
          priority: 5,
          source: 'test',
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('RequestValidator.validateMemoryQuery', () => {
    it('should validate valid memory query', () => {
      const result = RequestValidator.validateMemoryQuery({
        query: 'test search',
        limit: 10,
      });
      expect(result.success).toBe(true);
    });

    it('should return errors for invalid query', () => {
      const result = RequestValidator.validateMemoryQuery({
        query: '', // Empty query
      });
      expect(result.success).toBe(false);
    });
  });

  describe('RequestValidator.validateMemoryUpdate', () => {
    it('should validate update with content', () => {
      const result = RequestValidator.validateMemoryUpdate({
        id: '550e8400-e29b-41d4-a716-446655440000',
        content: 'Updated content',
      });
      expect(result.success).toBe(true);
    });

    it('should validate update with metadata', () => {
      const result = RequestValidator.validateMemoryUpdate({
        id: '550e8400-e29b-41d4-a716-446655440000',
        metadata: {
          tags: ['updated'],
          category: 'updated',
          priority: 8,
          source: 'updated',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should return errors for update without content or metadata', () => {
      const result = RequestValidator.validateMemoryUpdate({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('RequestValidator.validateLogin', () => {
    it('should validate valid login request', () => {
      const result = RequestValidator.validateLogin({
        username: 'testuser',
        password: 'password123',
      });
      expect(result.success).toBe(true);
    });

    it('should return errors for invalid login', () => {
      const result = RequestValidator.validateLogin({
        username: 'ab', // Too short
        password: 'password123',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('RequestValidator.validateToken', () => {
    it('should validate valid token request', () => {
      const result = RequestValidator.validateToken({
        token: 'validtokenstring',
      });
      expect(result.success).toBe(true);
    });

    it('should return errors for invalid token', () => {
      const result = RequestValidator.validateToken({
        token: 'short',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('RequestValidator.sanitizeString', () => {
    it('should remove script tags', () => {
      const input = 'Hello <script>alert("xss")</script> world';
      const output = RequestValidator.sanitizeString(input);
      expect(output).not.toContain('<script>');
      expect(output).toContain('Hello');
      expect(output).toContain('world');
    });

    it('should remove javascript: protocol', () => {
      const input = 'Click javascript:alert("xss")';
      const output = RequestValidator.sanitizeString(input);
      expect(output).not.toContain('javascript:');
    });

    it('should remove data: protocol', () => {
      const input = 'data:text/html,<script>alert(1)</script>';
      const output = RequestValidator.sanitizeString(input);
      expect(output).not.toContain('data:');
    });

    it('should remove event handlers', () => {
      const input = '<div onclick="alert(1)">Click</div>';
      const output = RequestValidator.sanitizeString(input);
      expect(output).not.toContain('onclick');
    });

    it('should trim whitespace', () => {
      const input = '  Hello world  ';
      const output = RequestValidator.sanitizeString(input);
      expect(output).toBe('Hello world');
    });
  });

  describe('RequestValidator.sanitizeMemoryContent', () => {
    it('should sanitize and validate normal content', () => {
      const result = RequestValidator.sanitizeMemoryContent('Normal text content');
      expect(result.success).toBe(true);
      expect(result.data).toBe('Normal text content');
    });

    it('should remove dangerous content', () => {
      const result = RequestValidator.sanitizeMemoryContent(
        'Text <script>alert(1)</script> more text'
      );
      expect(result.success).toBe(true);
      expect(result.data).not.toContain('<script>');
    });

    it('should reject empty content after sanitization', () => {
      const result = RequestValidator.sanitizeMemoryContent('   ');
      expect(result.success).toBe(false);
    });

    it('should handle content that sanitizes to less than 50% original length', () => {
      const maliciousContent = `${'<script>'.repeat(100)}good${'</script>'.repeat(100)}`;
      const result = RequestValidator.sanitizeMemoryContent(maliciousContent);
      expect(result.success).toBe(true);
      expect(result.data).toBe('good');
    });
  });

  describe('RequestValidator.generateRateLimitKey', () => {
    it('should generate key with tenant and user ID', () => {
      const key = RequestValidator.generateRateLimitKey('api_call', {
        tenantId: 'tenant1',
        userId: 'user1',
      });
      expect(key).toBe('api_call:tenant1:user1');
    });

    it('should fallback to IP address', () => {
      const key = RequestValidator.generateRateLimitKey('api_call', {
        ip: '192.168.1.1',
      });
      expect(key).toBe('api_call:192.168.1.1');
    });

    it('should use anonymous when no identifiers provided', () => {
      const key = RequestValidator.generateRateLimitKey('api_call', {});
      expect(key).toBe('api_call:anonymous');
    });
  });

  describe('RequestValidationError', () => {
    it('should create error with field and code', () => {
      const error = new RequestValidationError('Test error', 'testField', 'test_code');
      expect(error.message).toBe('Test error');
      expect(error._field).toBe('testField');
      expect(error._code).toBe('test_code');
      expect(error.name).toBe('RequestValidationError');
    });
  });

  describe('createValidationMiddleware', () => {
    it('should return validated data for valid input', () => {
      const middleware = createValidationMiddleware(CommonSchemas.safeString);
      const result = middleware('valid string');
      expect(result).toBe('valid string');
    });

    it('should throw RequestValidationError for invalid input', () => {
      const middleware = createValidationMiddleware(CommonSchemas.safeString);
      expect(() => {
        middleware('');
      }).toThrow(RequestValidationError);
    });

    it('should call onError callback when validation fails', () => {
      let errorsCalled = false;
      const middleware = createValidationMiddleware(CommonSchemas.safeString, errors => {
        errorsCalled = true;
        expect(errors).toBeDefined();
      });

      expect(() => {
        middleware('');
      }).toThrow();
      expect(errorsCalled).toBe(true);
    });

    it('should include multiple error messages in thrown error', () => {
      const middleware = createValidationMiddleware(MemorySchemas.updateRequest);
      expect(() => {
        middleware({
          id: 'not-a-uuid',
        });
      }).toThrow(/Validation failed/);
    });
  });
});
