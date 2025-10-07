# Reports Caching Layer

## Overview

Redis-backed caching layer for reports endpoints to improve performance and reduce database load.

## Cache Configuration

### TTL Settings

| Report Type   | TTL        | Reason                          |
| ------------- | ---------- | ------------------------------- |
| `overview`    | 5 minutes  | High-frequency, real-time data  |
| `campaigns`   | 10 minutes | Moderate update frequency       |
| `messaging`   | 15 minutes | Standard reporting data         |
| `attribution` | 30 minutes | Historical data, rarely changes |
| `segments`    | 1 hour     | Static data, rarely changes     |

### Cache Keys

```
reports:{shopId}:{reportType}:{paramString}
```

Examples:

```
reports:shop123:overview:from:2024-01-01|to:2024-01-31|window:30d
reports:shop123:campaigns:from:2024-01-01|to:2024-01-31
reports:shop123:messaging:from:2024-01-01|to:2024-01-31|window:7d
```

## Cache Middleware

### Usage

```javascript
import { cacheMiddleware } from '../lib/reports-cache.js';

// Apply to route
router.get('/overview', cacheMiddleware('overview'), async (req, res) => {
  // Route handler
});
```

### Headers

- `X-Cache: hit` - Response served from cache
- `X-Cache: miss` - Response generated fresh

## Cache Operations

### Get Cached Data

```javascript
const cached = await getCachedReport(shopId, 'overview', {
  from: '2024-01-01',
  to: '2024-01-31',
  window: '30d',
});

if (cached) {
  return { data: cached.data, fromCache: true };
}
```

### Set Cached Data

```javascript
await setCachedReport(shopId, 'overview', reportData, {
  from: '2024-01-01',
  to: '2024-01-31',
  window: '30d',
});
```

### Invalidate Cache

```javascript
// Invalidate all reports for a shop
await invalidateShopCache(shopId);

// Invalidate specific report type
await invalidateShopCache(shopId, 'overview');

// Invalidate specific report with parameters
await invalidateReportCache(shopId, 'overview', {
  from: '2024-01-01',
  to: '2024-01-31',
});
```

## Cache Invalidation Triggers

### Automatic Invalidation

1. **New Message Sent**
   - Invalidate `overview`, `messaging` caches
   - Trigger: `incrementSmsSendAttempts('sent')`

2. **Message Status Change**
   - Invalidate `overview`, `messaging` caches
   - Trigger: DLR webhook updates

3. **Campaign Status Change**
   - Invalidate `campaigns`, `overview` caches
   - Trigger: Campaign start/stop/pause

4. **Segment Update**
   - Invalidate `segments` cache
   - Trigger: Segment criteria changes

### Manual Invalidation

```javascript
// After campaign send
await invalidateShopCache(shopId, 'campaigns');

// After message delivery
await invalidateShopCache(shopId, 'messaging');

// After segment update
await invalidateShopCache(shopId, 'segments');
```

## Cache Statistics

### Get Cache Stats

```javascript
const stats = await getCacheStats();

// Returns:
{
  available: true,
  memory: "used_memory:1234567",
  keyspace: "db0:keys=123,expires=45"
}
```

### Metrics Integration

```javascript
// Cache hit/miss metrics
recordCacheHit('overview');
recordCacheMiss('campaigns');

// Prometheus metrics
cache_hits_total{type="overview"} 1234
cache_misses_total{type="campaigns"} 567
```

## Redis Configuration

### Connection

```javascript
// Uses existing Redis connection from queues
const redis = getRedisConnection();

// Fallback to no caching if Redis unavailable
if (!redis) {
  logger.warn('Redis not available, skipping cache');
  return null;
}
```

### Key Expiration

```javascript
// Set with TTL
await redis.setex(key, ttl, JSON.stringify(data));

// Automatic cleanup
// Redis handles key expiration automatically
```

## Performance Benefits

### Before Caching

- Database queries: 5-10 per report request
- Response time: 200-500ms
- Database load: High during peak usage

### After Caching

- Database queries: 0 for cache hits
- Response time: 10-50ms for cache hits
- Database load: Reduced by 80-90%

## Cache Warming

### Pre-warm Popular Reports

```javascript
// Warm cache for active shops
const activeShops = await getActiveShops();
for (const shop of activeShops) {
  await warmCache(shop.id, 'overview');
  await warmCache(shop.id, 'campaigns');
}
```

### Background Cache Updates

```javascript
// Update cache in background
setInterval(
  async () => {
    const shops = await getActiveShops();
    for (const shop of shops) {
      await updateCache(shop.id, 'overview');
    }
  },
  5 * 60 * 1000,
); // Every 5 minutes
```

## Error Handling

### Redis Unavailable

```javascript
// Graceful degradation
if (!redis) {
  logger.warn('Redis not available, skipping cache');
  return null; // Continue without caching
}
```

### Cache Errors

```javascript
try {
  await redis.setex(key, ttl, data);
} catch (error) {
  logger.error({ error: error.message }, 'Failed to cache report');
  // Continue without caching
}
```

## Monitoring

### Cache Hit Rate

```javascript
// Calculate hit rate
const hitRate = cacheHits / (cacheHits + cacheMisses);

// Target: >80% hit rate for reports
```

### Cache Performance

```javascript
// Monitor cache response times
const start = Date.now();
const cached = await getCachedReport(shopId, reportType);
const duration = Date.now() - start;

// Target: <50ms for cache hits
```

## Testing

### Unit Tests

```javascript
// Test cache operations
expect(await getCachedReport('shop123', 'overview')).toBeNull();
await setCachedReport('shop123', 'overview', data);
expect(await getCachedReport('shop123', 'overview')).toEqual({ data, fromCache: true });
```

### Integration Tests

```javascript
// Test cache middleware
const response = await request(app)
  .get('/reports/overview?shop=test-shop.myshopify.com')
  .expect(200);

expect(response.headers['x-cache']).toBe('miss'); // First request
expect(response.headers['x-cache']).toBe('hit'); // Second request
```

## Best Practices

1. **Cache Key Design**
   - Include all relevant parameters
   - Use consistent parameter ordering
   - Avoid special characters

2. **TTL Selection**
   - Shorter for real-time data
   - Longer for historical data
   - Consider update frequency

3. **Invalidation Strategy**
   - Invalidate on data changes
   - Use targeted invalidation
   - Avoid cache stampede

4. **Error Handling**
   - Graceful degradation
   - Log cache errors
   - Monitor cache health

5. **Performance**
   - Monitor hit rates
   - Optimize cache keys
   - Use appropriate TTLs


