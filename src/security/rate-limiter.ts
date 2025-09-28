/**
 * Rate Limiting Middleware for Production Security
 * Implements sliding window rate limiting with configurable thresholds
 */

import { createLogger } from '../utils/logger.js';
import type { Environment } from '../config/environment.js';

const logger = createLogger('rate-limiter');

export interface RateLimitConfig {
  windowMs: number;        // Time window in milliseconds
  maxRequests: number;     // Maximum requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (context: any) => string;
  onLimitReached?: (key: string, context: any) => void;
}

export interface RateLimitInfo {
  totalHits: number;
  totalHitsInWindow: number;
  remainingPoints: number;
  msBeforeNext: number;
  isFirstInWindow: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  info: RateLimitInfo;
  retryAfter?: number | undefined;
}

/**
 * Memory-based rate limiter using sliding window algorithm
 */
export class MemoryRateLimiter {
  private store = new Map<string, Array<{ timestamp: number; success: boolean }>>();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = {
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      keyGenerator: (context: any) => context.clientId || context.ip || 'anonymous',
      onLimitReached: (key: string) => {
        logger.warn('Rate limit exceeded', { key, limit: config.maxRequests, windowMs: config.windowMs });
      },
      ...config,
    };

    // Clean up old entries periodically
    setInterval(() => this.cleanup(), this.config.windowMs);
  }

  /**
   * Check if request is allowed under rate limit
   */
  async checkLimit(context: any, isSuccess?: boolean): Promise<RateLimitResult> {
    const key = this.config.keyGenerator!(context);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Get or create entry for this key
    if (!this.store.has(key)) {
      this.store.set(key, []);
    }

    const requests = this.store.get(key)!;

    // Remove requests outside the current window
    const recentRequests = requests.filter(req => req.timestamp > windowStart);
    this.store.set(key, recentRequests);

    // Count requests in window (considering skip options)
    const relevantRequests = recentRequests.filter(req => {
      if (this.config.skipSuccessfulRequests && req.success) return false;
      if (this.config.skipFailedRequests && !req.success) return false;
      return true;
    });

    const totalHitsInWindow = relevantRequests.length;
    const allowed = totalHitsInWindow < this.config.maxRequests;

    // Record this request
    if (isSuccess !== undefined) {
      recentRequests.push({ timestamp: now, success: isSuccess });
    } else {
      recentRequests.push({ timestamp: now, success: true });
    }

    // Calculate retry after time
    let retryAfter: number | undefined;
    if (!allowed && relevantRequests.length > 0) {
      const oldestRelevant = Math.min(...relevantRequests.map(r => r.timestamp));
      retryAfter = Math.ceil((oldestRelevant + this.config.windowMs - now) / 1000);
    }

    const info: RateLimitInfo = {
      totalHits: recentRequests.length,
      totalHitsInWindow,
      remainingPoints: Math.max(0, this.config.maxRequests - totalHitsInWindow),
      msBeforeNext: retryAfter ? retryAfter * 1000 : 0,
      isFirstInWindow: totalHitsInWindow === 1,
    };

    // Trigger callback if limit reached
    if (!allowed && this.config.onLimitReached) {
      this.config.onLimitReached(key, context);
    }

    logger.debug('Rate limit check', {
      key,
      allowed,
      totalHitsInWindow,
      remainingPoints: info.remainingPoints,
      retryAfter,
    });

    return { allowed, info, retryAfter };
  }

  /**
   * Get current rate limit status for a key
   */
  async getStatus(context: any): Promise<RateLimitInfo> {
    const key = this.config.keyGenerator!(context);
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    const requests = this.store.get(key) || [];
    const recentRequests = requests.filter(req => req.timestamp > windowStart);

    const relevantRequests = recentRequests.filter(req => {
      if (this.config.skipSuccessfulRequests && req.success) return false;
      if (this.config.skipFailedRequests && !req.success) return false;
      return true;
    });

    return {
      totalHits: recentRequests.length,
      totalHitsInWindow: relevantRequests.length,
      remainingPoints: Math.max(0, this.config.maxRequests - relevantRequests.length),
      msBeforeNext: 0,
      isFirstInWindow: relevantRequests.length === 0,
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  async reset(context: any): Promise<void> {
    const key = this.config.keyGenerator!(context);
    this.store.delete(key);
    logger.info('Rate limit reset', { key });
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    let cleanedEntries = 0;

    for (const [key, requests] of this.store.entries()) {
      const recentRequests = requests.filter(req => req.timestamp > windowStart);

      if (recentRequests.length === 0) {
        this.store.delete(key);
        cleanedEntries++;
      } else if (recentRequests.length < requests.length) {
        this.store.set(key, recentRequests);
      }
    }

    if (cleanedEntries > 0) {
      logger.debug('Rate limiter cleanup completed', {
        cleanedEntries,
        remainingKeys: this.store.size
      });
    }
  }

  /**
   * Get statistics about the rate limiter
   */
  getStats(): { totalKeys: number; totalRequests: number; windowMs: number; maxRequests: number } {
    let totalRequests = 0;
    for (const requests of this.store.values()) {
      totalRequests += requests.length;
    }

    return {
      totalKeys: this.store.size,
      totalRequests,
      windowMs: this.config.windowMs,
      maxRequests: this.config.maxRequests,
    };
  }
}

/**
 * Create rate limiter from environment configuration
 */
export function createRateLimiter(env: Environment): MemoryRateLimiter {
  const config: RateLimitConfig = {
    windowMs: env.rateLimitWindowMs,
    maxRequests: env.rateLimitMaxRequests,
    keyGenerator: (context: any) => {
      // Use tenant ID + user ID for authenticated requests
      if (context.tenantId && context.userId) {
        return `${context.tenantId}:${context.userId}`;
      }
      // Fall back to IP or client identifier
      return context.ip || context.clientId || 'anonymous';
    },
    onLimitReached: (key: string) => {
      logger.warn('Rate limit exceeded', {
        key,
        action: 'blocked_request',
        windowMs: env.rateLimitWindowMs,
        maxRequests: env.rateLimitMaxRequests
      });
    },
  };

  return new MemoryRateLimiter(config);
}