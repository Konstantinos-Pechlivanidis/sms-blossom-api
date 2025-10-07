// src/lib/reports-cache.js
// Redis-backed caching layer for reports

import { getRedisConnection } from '../queue/queues.js';
import { logger } from './logger.js';
import { recordCacheHit, recordCacheMiss } from './metrics.js';

const CACHE_PREFIX = 'reports:';
const DEFAULT_TTL = 900; // 15 minutes

/**
 * Cache configuration for different report types
 */
const CACHE_CONFIG = {
  overview: { ttl: 300 }, // 5 minutes
  campaigns: { ttl: 600 }, // 10 minutes
  messaging: { ttl: 900 }, // 15 minutes
  attribution: { ttl: 1800 }, // 30 minutes
  segments: { ttl: 3600 }, // 1 hour
};

/**
 * Generate cache key for report
 */
function getCacheKey(shopId, reportType, params = {}) {
  const paramString = Object.keys(params)
    .sort()
    .map((key) => `${key}:${params[key]}`)
    .join('|');

  return `${CACHE_PREFIX}${shopId}:${reportType}:${paramString}`;
}

/**
 * Get cached report data
 */
export async function getCachedReport(shopId, reportType, params = {}) {
  try {
    const redis = getRedisConnection();
    if (!redis) {
      logger.warn('Redis not available, skipping cache');
      return null;
    }

    const key = getCacheKey(shopId, reportType, params);
    const cached = await redis.get(key);

    if (cached) {
      logger.info({ shopId, reportType, key }, 'Cache hit for report');

      // Record cache hit
      recordCacheHit(reportType);

      return {
        data: JSON.parse(cached),
        fromCache: true,
      };
    }

    logger.info({ shopId, reportType, key }, 'Cache miss for report');

    // Record cache miss
    recordCacheMiss(reportType);

    return null;
  } catch (error) {
    logger.error({ error: error.message, shopId, reportType }, 'Failed to get cached report');
    return null;
  }
}

/**
 * Set cached report data
 */
export async function setCachedReport(shopId, reportType, data, params = {}) {
  try {
    const redis = getRedisConnection();
    if (!redis) {
      logger.warn('Redis not available, skipping cache set');
      return;
    }

    const key = getCacheKey(shopId, reportType, params);
    const config = CACHE_CONFIG[reportType] || { ttl: DEFAULT_TTL };

    await redis.setex(key, config.ttl, JSON.stringify(data));

    logger.info({ shopId, reportType, key, ttl: config.ttl }, 'Report cached successfully');
  } catch (error) {
    logger.error({ error: error.message, shopId, reportType }, 'Failed to cache report');
  }
}

/**
 * Invalidate cache for shop
 */
export async function invalidateShopCache(shopId, reportType = null) {
  try {
    const redis = getRedisConnection();
    if (!redis) {
      logger.warn('Redis not available, skipping cache invalidation');
      return;
    }

    const pattern = reportType
      ? `${CACHE_PREFIX}${shopId}:${reportType}:*`
      : `${CACHE_PREFIX}${shopId}:*`;

    const keys = await redis.keys(pattern);

    if (keys.length > 0) {
      await redis.del(...keys);

      logger.info({ shopId, reportType, keysDeleted: keys.length }, 'Cache invalidated for shop');
    }
  } catch (error) {
    logger.error({ error: error.message, shopId, reportType }, 'Failed to invalidate cache');
  }
}

/**
 * Invalidate specific cache entry
 */
export async function invalidateReportCache(shopId, reportType, params = {}) {
  try {
    const redis = getRedisConnection();
    if (!redis) {
      logger.warn('Redis not available, skipping cache invalidation');
      return;
    }

    const key = getCacheKey(shopId, reportType, params);
    await redis.del(key);

    logger.info({ shopId, reportType, key }, 'Report cache invalidated');
  } catch (error) {
    logger.error({ error: error.message, shopId, reportType }, 'Failed to invalidate report cache');
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats() {
  try {
    const redis = getRedisConnection();
    if (!redis) {
      return { available: false };
    }

    const info = await redis.info('memory');
    const keyspace = await redis.info('keyspace');

    return {
      available: true,
      memory: info,
      keyspace: keyspace,
    };
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get cache stats');
    return { available: false, error: error.message };
  }
}

/**
 * Cache middleware for Express routes
 */
export function cacheMiddleware(reportType, _ttl = null) {
  return async (req, res, next) => {
    const shopId = req.query.shop || req.get('X-Shopify-Shop-Domain');
    if (!shopId) {
      return next();
    }

    // Try to get from cache
    const cached = await getCachedReport(shopId, reportType, req.query);

    if (cached) {
      res.set('X-Cache', 'hit');
      return res.json(cached.data);
    }

    // Set cache miss header
    res.set('X-Cache', 'miss');

    // Store original json method
    const originalJson = res.json;

    // Override json method to cache response
    res.json = function (data) {
      // Cache the response
      setCachedReport(shopId, reportType, data, req.query);

      // Call original json method
      return originalJson.call(this, data);
    };

    next();
  };
}
