// src/middleware/rateLimit.js
// Redis-based rate limiting middleware

import { getRedisConnection } from '../queue/queues.js';
import { logger } from '../lib/logger.js';

const DEFAULT_LIMITS = {
  admin: { requests: 600, window: 60, burst: 60 }, // 600 rpm, 60 rps burst
  public: { requests: 120, window: 60, burst: 10 }, // 120 rpm, 10 rps burst
  webhook: { requests: 1000, window: 60, burst: 100 }, // 1000 rpm, 100 rps burst
};

/**
 * Rate limiting middleware using Redis token bucket
 * @param {object} options - Rate limiting options
 * @returns {function} - Express middleware function
 */
export function rateLimitMiddleware(options = {}) {
  const limits = { ...DEFAULT_LIMITS.admin, ...options };

  return async (req, res, next) => {
    try {
      const redis = getRedisConnection();
      if (!redis) {
        logger.warn('Redis not available, skipping rate limiting');
        return next();
      }

      // Determine rate limit key based on request type
      let key;
      if (req.path.startsWith('/api/admin/')) {
        key = `rate_limit:admin:${req.shop?.id || req.ip}`;
      } else if (req.path.startsWith('/public/') || req.path.startsWith('/proxy/')) {
        key = `rate_limit:public:${req.ip}`;
      } else if (req.path.startsWith('/webhooks/')) {
        key = `rate_limit:webhook:${req.shop?.id || req.ip}`;
      } else {
        key = `rate_limit:default:${req.ip}`;
      }

      const now = Date.now();
      const windowStart = Math.floor(now / 1000 / limits.window) * limits.window;
      const windowKey = `${key}:${windowStart}`;

      // Get current count
      const currentCount = (await redis.get(windowKey)) || 0;
      const count = parseInt(currentCount, 10);

      // Check if limit exceeded
      if (count >= limits.requests) {
        const resetTime = (windowStart + limits.window) * 1000;
        const retryAfter = Math.ceil((resetTime - now) / 1000);

        logger.warn(
          {
            key,
            count,
            limit: limits.requests,
            ip: req.ip,
            userAgent: req.get('user-agent'),
          },
          'Rate limit exceeded',
        );

        res.set({
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Limit': limits.requests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': resetTime.toString(),
        });

        return res.status(429).json({
          error: 'rate_limit_exceeded',
          message: 'Too many requests',
          retry_after: retryAfter,
        });
      }

      // Increment counter
      const pipeline = redis.pipeline();
      pipeline.incr(windowKey);
      pipeline.expire(windowKey, limits.window * 2); // Keep for 2 windows
      await pipeline.exec();

      // Set rate limit headers
      const remaining = Math.max(0, limits.requests - count - 1);
      const resetTime = (windowStart + limits.window) * 1000;

      res.set({
        'X-RateLimit-Limit': limits.requests.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': resetTime.toString(),
      });

      next();
    } catch (error) {
      logger.error({ error }, 'Rate limiting error');
      // Don't block requests if rate limiting fails
      next();
    }
  };
}

/**
 * Check rate limit without incrementing (for testing)
 * @param {string} key - Rate limit key
 * @param {object} limits - Rate limit configuration
 * @returns {object} - Rate limit status
 */
export async function checkRateLimit(key, limits = DEFAULT_LIMITS.admin) {
  try {
    const redis = getRedisConnection();
    if (!redis) {
      return { allowed: true, remaining: limits.requests };
    }

    const now = Date.now();
    const windowStart = Math.floor(now / 1000 / limits.window) * limits.window;
    const windowKey = `${key}:${windowStart}`;

    const currentCount = (await redis.get(windowKey)) || 0;
    const count = parseInt(currentCount, 10);
    const remaining = Math.max(0, limits.requests - count);

    return {
      allowed: count < limits.requests,
      remaining,
      resetTime: (windowStart + limits.window) * 1000,
    };
  } catch (error) {
    logger.error({ error }, 'Rate limit check failed');
    return { allowed: true, remaining: limits.requests };
  }
}
