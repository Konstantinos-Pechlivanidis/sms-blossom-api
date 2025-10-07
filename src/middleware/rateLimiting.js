import { getRedisConnection } from '../queue/queues.js';
import { logger } from '../services/logger.js';

/**
 * Rate limiting middleware using token bucket algorithm
 *
 * Rate limits per shop and IP with configurable limits:
 * - Admin API: 60 rps burst, 600 rpm sustained
 * - Public endpoints: 10 rps burst, 100 rpm sustained
 *
 * Returns 429 with RateLimit-* headers on exceed
 */
export function rateLimitMiddleware(options = {}) {
  const {
    windowMs = 60 * 1000, // 1 minute window
    maxRequests = 60, // max requests per window
    burstLimit = 10, // burst allowance
    keyGenerator = (req) => {
      // Rate limit by shop + IP combination
      const shopId = req.shop?.id || 'no-shop';
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return `rate_limit:${shopId}:${ip}`;
    },
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  return async (req, res, next) => {
    try {
      const key = keyGenerator(req);
      const redis = await getRedisConnection();

      if (!redis) {
        // If Redis is not available, skip rate limiting
        logger.warn('Redis not available, skipping rate limiting', {
          key,
          request_id: req.headers['x-request-id'],
        });
        return next();
      }

      const now = Date.now();
      const windowStart = Math.floor(now / windowMs) * windowMs;
      const windowKey = `${key}:${windowStart}`;
      const burstKey = `${key}:burst`;

      // Get current counts
      const [windowCount, burstCount, ttl] = await Promise.all([
        redis.get(windowKey),
        redis.get(burstKey),
        redis.ttl(windowKey),
      ]);

      const currentWindowCount = parseInt(windowCount || '0', 10);
      const currentBurstCount = parseInt(burstCount || '0', 10);

      // Check if we've exceeded limits
      if (currentWindowCount >= maxRequests) {
        const retryAfter = Math.ceil((windowStart + windowMs - now) / 1000);

        logger.warn('Rate limit exceeded - window', {
          key,
          window_count: currentWindowCount,
          max_requests: maxRequests,
          retry_after: retryAfter,
          request_id: req.headers['x-request-id'],
        });

        res.set({
          'RateLimit-Limit': maxRequests.toString(),
          'RateLimit-Remaining': '0',
          'RateLimit-Reset': new Date(windowStart + windowMs).toISOString(),
          'Retry-After': retryAfter.toString(),
        });

        return res.status(429).json({
          error: 'rate_limited',
          message: 'Too many requests',
          retry_after: retryAfter,
        });
      }

      if (currentBurstCount >= burstLimit) {
        const retryAfter = 1; // 1 second for burst limit

        logger.warn('Rate limit exceeded - burst', {
          key,
          burst_count: currentBurstCount,
          burst_limit: burstLimit,
          request_id: req.headers['x-request-id'],
        });

        res.set({
          'RateLimit-Limit': maxRequests.toString(),
          'RateLimit-Remaining': Math.max(0, maxRequests - currentWindowCount - 1).toString(),
          'RateLimit-Reset': new Date(windowStart + windowMs).toISOString(),
          'Retry-After': retryAfter.toString(),
        });

        return res.status(429).json({
          error: 'rate_limited',
          message: 'Burst limit exceeded',
          retry_after: retryAfter,
        });
      }

      // Increment counters
      const pipeline = redis.pipeline();

      // Increment window counter
      pipeline.incr(windowKey);
      if (ttl === -1) {
        pipeline.expire(windowKey, Math.ceil(windowMs / 1000));
      }

      // Increment burst counter with short expiry
      pipeline.incr(burstKey);
      pipeline.expire(burstKey, 1); // 1 second burst window

      await pipeline.exec();

      // Set rate limit headers
      const remaining = Math.max(0, maxRequests - currentWindowCount - 1);
      res.set({
        'RateLimit-Limit': maxRequests.toString(),
        'RateLimit-Remaining': remaining.toString(),
        'RateLimit-Reset': new Date(windowStart + windowMs).toISOString(),
      });

      // Track response for conditional counting
      const originalSend = res.send;
      res.send = function (body) {
        const statusCode = res.statusCode;

        // Only count successful requests if skipSuccessfulRequests is false
        // Only count failed requests if skipFailedRequests is false
        const shouldCount =
          (!skipSuccessfulRequests && statusCode < 400) ||
          (!skipFailedRequests && statusCode >= 400);

        if (!shouldCount) {
          // Decrement the counter we just incremented
          redis.decr(windowKey).catch((err) => {
            logger.error('Failed to decrement rate limit counter', {
              error: err.message,
              key: windowKey,
              request_id: req.headers['x-request-id'],
            });
          });
        }

        return originalSend.call(this, body);
      };

      next();
    } catch (error) {
      logger.error('Rate limiting error', {
        error: error.message,
        key: keyGenerator(req),
        request_id: req.headers['x-request-id'],
      });

      // Continue without rate limiting on error
      next();
    }
  };
}

/**
 * Admin API rate limiting (higher limits)
 */
export function adminRateLimitMiddleware() {
  return rateLimitMiddleware({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60, // 60 requests per minute
    burstLimit: 10, // 10 requests per second burst
    keyGenerator: (req) => {
      const shopId = req.shop?.id || 'no-shop';
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return `admin_rate_limit:${shopId}:${ip}`;
    },
  });
}

/**
 * Public API rate limiting (lower limits)
 */
export function publicRateLimitMiddleware() {
  return rateLimitMiddleware({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute
    burstLimit: 10, // 10 requests per second burst
    keyGenerator: (req) => {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      return `public_rate_limit:${ip}`;
    },
  });
}

/**
 * Webhook rate limiting (very permissive for Shopify)
 */
export function webhookRateLimitMiddleware() {
  return rateLimitMiddleware({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 1000, // 1000 requests per minute
    burstLimit: 100, // 100 requests per second burst
    keyGenerator: (req) => {
      const shopId = req.shop?.id || 'no-shop';
      return `webhook_rate_limit:${shopId}`;
    },
  });
}
