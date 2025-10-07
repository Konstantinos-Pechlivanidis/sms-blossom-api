# Reports and Caching

This document describes the reporting system, caching strategy, and how to optimize report performance in the SMS Blossom backend.

## Overview

The reporting system provides analytics for SMS campaigns, automation performance, and customer engagement. All reports are cached using Redis to improve performance and reduce database load.

## Caching Strategy

### Cache Configuration

| Report Type | TTL | Description |
|-------------|-----|-------------|
| `overview` | 5 minutes | High-level metrics and KPIs |
| `campaigns` | 10 minutes | Campaign performance data |
| `messaging` | 15 minutes | Message delivery analytics |
| `attribution` | 30 minutes | Revenue attribution data |
| `segments` | 1 hour | Customer segment analytics |

### Cache Keys

Cache keys follow the pattern: `reports:{shopId}:{reportType}:{params}`

**Examples**:
- `reports:shop_123:overview:from:2024-01-01|to:2024-01-31`
- `reports:shop_123:messaging:from:2024-01-15|granularity:day`
- `reports:shop_123:campaigns:campaign_id:camp_123`

### Cache Headers

Reports include cache status headers:

```http
x-cache: hit
x-cache-ttl: 300
x-cache-key: reports:shop_123:overview:from:2024-01-01|to:2024-01-31
x-cache-timestamp: 2024-01-15T10:30:00Z
```

## Report Endpoints

### Overview Report

**Endpoint**: `GET /reports/overview`

**Description**: High-level metrics and KPIs

**Parameters**:
- `shop`: Shop domain (required)
- `from`: Start date (ISO 8601)
- `to`: End date (ISO 8601)
- `window`: Time window (`7d`, `30d`, `90d`)

**Response**:
```json
{
  "ok": true,
  "range": {
    "from": "2024-01-01T00:00:00Z",
    "to": "2024-01-31T23:59:59Z"
  },
  "metrics": {
    "total_campaigns": 15,
    "total_sent": 12500,
    "total_delivered": 11800,
    "delivery_rate": 94.4,
    "total_revenue": 125000,
    "revenue_per_message": 10.58
  },
  "cached_at": "2024-01-15T10:30:00Z"
}
```

**Caching**: 5 minutes TTL

### Campaign Report

**Endpoint**: `GET /reports/campaigns`

**Description**: Campaign performance analytics

**Parameters**:
- `shop`: Shop domain (required)
- `from`: Start date (ISO 8601)
- `to`: End date (ISO 8601)
- `campaign_id`: Specific campaign ID (optional)

**Response**:
```json
{
  "ok": true,
  "range": {
    "from": "2024-01-01T00:00:00Z",
    "to": "2024-01-31T23:59:59Z"
  },
  "campaigns": [
    {
      "id": "camp_123",
      "name": "Welcome Campaign",
      "status": "completed",
      "sent": 1250,
      "delivered": 1180,
      "failed": 70,
      "delivery_rate": 94.4,
      "cost": 12.50,
      "revenue": 1250,
      "roi": 10000,
      "created_at": "2024-01-15T10:00:00Z",
      "sent_at": "2024-01-15T10:30:00Z"
    }
  ],
  "summary": {
    "total_campaigns": 15,
    "total_sent": 12500,
    "total_delivered": 11800,
    "total_cost": 125.00,
    "total_revenue": 12500,
    "average_roi": 9900
  },
  "cached_at": "2024-01-15T10:30:00Z"
}
```

**Caching**: 10 minutes TTL

### Messaging Report

**Endpoint**: `GET /reports/messaging`

**Description**: Message delivery analytics with time series

**Parameters**:
- `shop`: Shop domain (required)
- `from`: Start date (ISO 8601)
- `to`: End date (ISO 8601)
- `granularity`: Time granularity (`hour`, `day`, `week`, `month`)

**Response**:
```json
{
  "ok": true,
  "range": {
    "from": "2024-01-01T00:00:00Z",
    "to": "2024-01-31T23:59:59Z",
    "granularity": "day"
  },
  "timeseries": [
    {
      "date": "2024-01-01",
      "sent": 500,
      "delivered": 475,
      "failed": 25,
      "delivery_rate": 95.0,
      "cost": 5.00,
      "revenue": 500
    }
  ],
  "summary": {
    "total_sent": 12500,
    "total_delivered": 11800,
    "total_failed": 700,
    "average_delivery_rate": 94.4,
    "total_cost": 125.00,
    "total_revenue": 12500
  },
  "cached_at": "2024-01-15T10:30:00Z"
}
```

**Caching**: 15 minutes TTL

### Attribution Report

**Endpoint**: `GET /reports/attribution`

**Description**: Revenue attribution from SMS campaigns

**Parameters**:
- `shop`: Shop domain (required)
- `from`: Start date (ISO 8601)
- `to`: End date (ISO 8601)
- `attribution_window`: Attribution window (`1d`, `7d`, `30d`)

**Response**:
```json
{
  "ok": true,
  "range": {
    "from": "2024-01-01T00:00:00Z",
    "to": "2024-01-31T23:59:59Z"
  },
  "attribution": {
    "campaigns": [
      {
        "campaign_id": "camp_123",
        "campaign_name": "Welcome Campaign",
        "messages_sent": 1250,
        "orders_generated": 125,
        "revenue_attributed": 12500,
        "attribution_rate": 10.0,
        "average_order_value": 100.00
      }
    ],
    "summary": {
      "total_messages": 12500,
      "total_orders": 1250,
      "total_revenue": 125000,
      "attribution_rate": 10.0,
      "average_order_value": 100.00
    }
  },
  "cached_at": "2024-01-15T10:30:00Z"
}
```

**Caching**: 30 minutes TTL

### Segments Report

**Endpoint**: `GET /reports/segments`

**Description**: Customer segment analytics

**Parameters**:
- `shop`: Shop domain (required)
- `segment_id`: Specific segment ID (optional)

**Response**:
```json
{
  "ok": true,
  "segments": [
    {
      "id": "seg_123",
      "name": "VIP Customers",
      "contact_count": 500,
      "sms_consent_rate": 95.0,
      "engagement_rate": 85.0,
      "average_order_value": 150.00,
      "last_activity": "2024-01-15T10:30:00Z"
    }
  ],
  "summary": {
    "total_segments": 5,
    "total_contacts": 2500,
    "average_consent_rate": 90.0,
    "average_engagement_rate": 75.0
  },
  "cached_at": "2024-01-15T10:30:00Z"
}
```

**Caching**: 1 hour TTL

## Cache Invalidation

### Automatic Invalidation

Cache is automatically invalidated when:

1. **Campaigns are sent**: All campaign-related reports
2. **Settings are updated**: Overview and segment reports
3. **New webhooks are processed**: Messaging and attribution reports
4. **Discounts are created/updated**: Campaign reports

### Manual Invalidation

```typescript
// Invalidate specific report
await api.reports.invalidate('overview', { shopId: 'shop_123' });

// Invalidate all reports for shop
await api.reports.invalidateAll('shop_123');

// Invalidate by pattern
await api.reports.invalidatePattern('campaigns:*');
```

### Cache Invalidation Events

| Event | Invalidated Reports |
|-------|-------------------|
| `campaign.sent` | `campaigns`, `messaging`, `attribution` |
| `campaign.completed` | `overview`, `campaigns` |
| `message.delivered` | `messaging`, `attribution` |
| `settings.updated` | `overview`, `segments` |
| `discount.created` | `campaigns`, `attribution` |

## Performance Optimization

### Cache Warming

Pre-warm frequently accessed reports:

```typescript
// Warm overview report
await api.reports.warm('overview', { shopId: 'shop_123' });

// Warm campaign reports
await api.reports.warm('campaigns', { shopId: 'shop_123' });
```

### Batch Loading

Load multiple reports in parallel:

```typescript
const [overview, campaigns, messaging] = await Promise.all([
  api.reports.overview({ shop: 'shop.myshopify.com' }),
  api.reports.campaigns({ shop: 'shop.myshopify.com' }),
  api.reports.messaging({ shop: 'shop.myshopify.com' })
]);
```

### Pagination

Use pagination for large datasets:

```typescript
const campaigns = await api.reports.campaigns({
  shop: 'shop.myshopify.com',
  limit: 50,
  offset: 0
});
```

## Frontend Integration

### Cache-Aware Loading

```typescript
class ReportLoader {
  private cache = new Map();
  
  async loadReport(type: string, params: any) {
    const cacheKey = `${type}:${JSON.stringify(params)}`;
    
    // Check local cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < 300000) { // 5 minutes
        return cached.data;
      }
    }
    
    // Load from API
    const response = await api.reports[type](params);
    
    // Cache locally
    this.cache.set(cacheKey, {
      data: response,
      timestamp: Date.now()
    });
    
    return response;
  }
}
```

### Polling Strategy

```typescript
class ReportPoller {
  private intervals = new Map();
  
  startPolling(reportType: string, params: any, callback: Function) {
    const interval = setInterval(async () => {
      try {
        const data = await api.reports[reportType](params);
        callback(data);
      } catch (error) {
        console.error('Report polling error:', error);
      }
    }, 30000); // 30 seconds
    
    this.intervals.set(`${reportType}:${JSON.stringify(params)}`, interval);
  }
  
  stopPolling(reportType: string, params: any) {
    const key = `${reportType}:${JSON.stringify(params)}`;
    const interval = this.intervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(key);
    }
  }
}
```

### Error Handling

```typescript
class ReportErrorHandler {
  handleError(error: any, reportType: string) {
    if (error.status === 429) {
      // Rate limited - back off
      return this.backoff(reportType);
    }
    
    if (error.status === 500) {
      // Server error - retry with exponential backoff
      return this.retry(reportType);
    }
    
    // Other errors - show user-friendly message
    return this.showError(error.message);
  }
  
  private backoff(reportType: string) {
    // Implement exponential backoff
    const delay = Math.min(1000 * Math.pow(2, this.retryCount), 30000);
    setTimeout(() => this.retry(reportType), delay);
  }
}
```

## Monitoring and Metrics

### Cache Metrics

Monitor cache performance:

```typescript
const metrics = await api.metrics.getCacheMetrics();

console.log(metrics);
// {
//   cache_hits: 1250,
//   cache_misses: 150,
//   hit_rate: 89.3,
//   average_ttl: 300,
//   memory_usage: "45MB"
// }
```

### Report Performance

```typescript
const performance = await api.reports.getPerformance();

console.log(performance);
// {
//   average_response_time: 150,
//   cache_hit_rate: 89.3,
//   database_queries: 25,
//   slow_queries: 2
// }
```

## Best Practices

### 1. Cache Strategy

- **Use appropriate TTLs**: Short for dynamic data, long for static data
- **Invalidate on updates**: Clear cache when data changes
- **Monitor hit rates**: Optimize TTLs based on usage patterns

### 2. Frontend Optimization

- **Implement local caching**: Cache responses locally
- **Use pagination**: Load data in chunks
- **Poll intelligently**: Use appropriate polling intervals
- **Handle errors gracefully**: Implement retry logic

### 3. Performance Monitoring

- **Track response times**: Monitor report generation time
- **Monitor cache usage**: Track memory and hit rates
- **Alert on failures**: Set up alerts for cache failures
- **Optimize queries**: Monitor and optimize database queries

## Troubleshooting

### Common Issues

| Issue | Symptoms | Resolution |
|-------|----------|------------|
| Cache misses | Slow report loading | Check Redis connection |
| Stale data | Outdated reports | Verify cache invalidation |
| Memory usage | High Redis memory | Optimize TTLs |
| Slow queries | Long response times | Optimize database queries |

### Debug Commands

```bash
# Check Redis connection
redis-cli ping

# Check cache keys
redis-cli keys "reports:*"

# Check cache TTL
redis-cli ttl "reports:shop_123:overview"

# Clear cache
redis-cli del "reports:shop_123:overview"
```

## Next Steps

1. Review [API Reference](./API_REFERENCE.md) for report endpoint details
2. Check [Campaigns Guide](./CAMPAIGNS_AND_DISCOUNTS_GUIDE.md) for campaign analytics
3. See [Security Surface](./SECURITY_SURFACE.md) for authentication requirements
4. Use [TypeScript SDK](../sdk/index.ts) for type-safe report operations
