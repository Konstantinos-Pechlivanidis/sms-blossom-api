# Backend Changelog for Frontend Team

This document outlines the key changes made to the SMS Blossom backend that the frontend team needs to be aware of for integration.

## Recent Changes (v1.0.0)

### 🚀 New Features

#### 1. Enhanced Health and Readiness System

- **New Endpoints**: `/health` and `/health/ready`
- **Purpose**: System health monitoring and readiness probes
- **Frontend Impact**: Use `/health` for system status, `/ready` for deployment readiness
- **Response Format**:
  ```json
  {
    "ok": true,
    "version": "1.0.0",
    "db": { "ok": true, "latency_ms": 15 },
    "redis": { "ok": true, "latency_ms": 8 },
    "queues": { "ok": true, "workers": 1 },
    "pii": { "phone_pct": 95, "email_pct": 98 },
    "timestamp": "2024-01-15T10:30:00Z",
    "request_id": "req-123"
  }
  ```

#### 2. Queue Health Monitoring

- **New Endpoint**: `/queue/health`
- **Purpose**: Monitor BullMQ queue status and job counts
- **Frontend Impact**: Use for operational dashboards and queue monitoring
- **Response Format**:
  ```json
  {
    "redis": true,
    "queues": {
      "events": { "waiting": 5, "active": 2, "completed": 100 },
      "delivery": { "waiting": 3, "active": 1, "completed": 95 }
    },
    "dlq": { "events_dead": 0, "delivery_dead": 2 }
  }
  ```

#### 3. Prometheus Metrics

- **New Endpoint**: `/metrics`
- **Purpose**: System metrics for monitoring and alerting
- **Frontend Impact**: Use for system monitoring dashboards
- **Authentication**: Optional token-based auth via `METRICS_TOKEN`
- **Content-Type**: `text/plain; version=0.0.4`

#### 4. Template System

- **New Endpoints**: `/templates/*`
- **Purpose**: Template preview, validation, and variable management
- **Frontend Impact**: Enable rich template editing with Liquid support
- **Key Features**:
  - LiquidJS templating engine
  - SMS segmentation (GSM/Unicode)
  - Variable catalogs per trigger
  - Template validation

#### 5. Campaigns and Discounts Services

- **Enhanced Endpoints**: `/campaigns/*` and `/discounts/*`
- **Purpose**: Complete campaign and discount management
- **Frontend Impact**: Full CRUD operations for campaigns and discounts
- **Key Features**:
  - Campaign lifecycle management
  - Discount conflict detection
  - Apply URL generation
  - Audience estimation

### 🔧 API Changes

#### 1. Authentication Headers

- **Required**: `X-Shop-Domain` header for all requests
- **Purpose**: Shop scoping and multi-tenant support
- **Frontend Impact**: Include shop domain in all API calls
- **Example**:
  ```typescript
  headers: {
    'X-Shop-Domain': 'test-shop.myshopify.com',
    'Authorization': `Bearer ${token}`
  }
  ```

#### 2. Request ID Tracking

- **Recommended**: `X-Request-ID` header for tracing
- **Purpose**: Request correlation and debugging
- **Frontend Impact**: Include unique request ID for better debugging
- **Example**:
  ```typescript
  headers: {
    'X-Request-ID': crypto.randomUUID()
  }
  ```

#### 3. Error Response Format

- **Standardized**: Consistent error response structure
- **Purpose**: Better error handling and user experience
- **Frontend Impact**: Handle errors consistently across all endpoints
- **Format**:
  ```json
  {
    "error": "Error message",
    "code": "ERROR_CODE",
    "details": { "field": "validation error" },
    "request_id": "req-123"
  }
  ```

### 🛡️ Security Enhancements

#### 1. Rate Limiting

- **Implementation**: Token bucket algorithm with Redis
- **Purpose**: API protection and abuse prevention
- **Frontend Impact**: Handle 429 responses with retry logic
- **Headers**:
  ```
  X-RateLimit-Limit: 100
  X-RateLimit-Remaining: 95
  X-RateLimit-Reset: 1642248000
  ```

#### 2. CORS Configuration

- **Implementation**: Strict allowlist-based CORS
- **Purpose**: Cross-origin request security
- **Frontend Impact**: Ensure frontend domain is in allowlist
- **Configuration**: `CORS_ALLOWLIST` environment variable

#### 3. HMAC Verification

- **Implementation**: Shopify webhook and App Proxy HMAC
- **Purpose**: Webhook authenticity and App Proxy security
- **Frontend Impact**: Use proper HMAC for App Proxy requests
- **Headers**: `X-Shopify-Hmac-Sha256` for webhooks

### 📊 Caching and Performance

#### 1. Redis Caching

- **Implementation**: Reports caching with TTL
- **Purpose**: Improved performance for frequently accessed data
- **Frontend Impact**: Handle cache headers and implement client-side caching
- **Headers**:
  ```
  X-Cache: HIT
  X-Cache-TTL: 300
  ```

#### 2. Database Optimizations

- **Implementation**: Indexed queries and connection pooling
- **Purpose**: Better database performance
- **Frontend Impact**: Faster API responses

### 🔄 Queue System

#### 1. BullMQ Integration

- **Implementation**: Redis-based job queues
- **Purpose**: Background job processing
- **Frontend Impact**: Monitor queue health and job status
- **Queues**: `events`, `automations`, `campaigns`, `delivery`, `housekeeping`

#### 2. Job Processing

- **Implementation**: Event-driven job processing
- **Purpose**: Asynchronous task execution
- **Frontend Impact**: Real-time updates for job status

### 📱 SMS Provider Integration

#### 1. Mitto SMS Provider

- **Implementation**: Complete SMS provider integration
- **Purpose**: SMS delivery and status tracking
- **Frontend Impact**: Monitor SMS delivery status
- **Features**:
  - SMS sending with retry logic
  - Delivery receipt (DLR) handling
  - Inbound message processing
  - Error classification and handling

### 🎯 Webhook System

#### 1. Shopify Webhooks

- **Implementation**: Complete webhook handling
- **Purpose**: Real-time event processing
- **Frontend Impact**: Real-time updates for Shopify events
- **Topics**: `orders/create`, `orders/paid`, `checkouts/*`, `customers/*`, `inventory/*`

#### 2. GDPR Compliance

- **Implementation**: GDPR webhook handling
- **Purpose**: Data privacy compliance
- **Frontend Impact**: Handle customer data requests
- **Topics**: `customers/data_request`, `customers/redact`, `shop/redact`

### 🔍 Observability

#### 1. Structured Logging

- **Implementation**: Pino-based structured logging
- **Purpose**: Better debugging and monitoring
- **Frontend Impact**: Correlate frontend errors with backend logs
- **Fields**: `request_id`, `shop_domain`, `user_id`, `operation`

#### 2. Metrics Collection

- **Implementation**: Prometheus metrics
- **Purpose**: System monitoring and alerting
- **Frontend Impact**: Monitor system health and performance
- **Metrics**: SMS sends, errors, queue jobs, cache hits/misses

### 🚀 Deployment

#### 1. Render.com Configuration

- **Implementation**: Complete deployment setup
- **Purpose**: Production deployment
- **Frontend Impact**: Coordinate with backend deployment
- **Services**: Web API and Worker services
- **Health Checks**: `/health` endpoint for liveness probes

#### 2. Environment Variables

- **Implementation**: Comprehensive environment configuration
- **Purpose**: Secure configuration management
- **Frontend Impact**: Coordinate environment setup
- **Key Variables**:
  - `DATABASE_URL` - Database connection
  - `REDIS_URL` - Redis connection
  - `WEBHOOK_HMAC_SECRET` - Webhook security
  - `JWT_SECRET` - JWT token security
  - `ENCRYPTION_KEY` - PII encryption
  - `MITTO_API_KEY` - SMS provider key

## Breaking Changes

### ⚠️ None in v1.0.0

- All changes are additive and backward compatible
- No existing API contracts were modified
- All new features are opt-in via feature flags

## Migration Guide

### 1. Update API Client

```typescript
// Old way
const response = await fetch('/api/campaigns');

// New way
const response = await fetch('/api/campaigns', {
  headers: {
    'X-Shop-Domain': shopDomain,
    'X-Request-ID': requestId,
    Authorization: `Bearer ${token}`,
  },
});
```

### 2. Handle New Error Responses

```typescript
// Old way
if (response.status === 400) {
  const error = await response.json();
  showError(error.message);
}

// New way
if (response.status === 400) {
  const error = await response.json();
  showError(error.error, error.details);
}
```

### 3. Implement Health Monitoring

```typescript
// Check system health
const health = await client.health.get();
if (!health.ok) {
  showSystemStatus(health);
}

// Check readiness
const ready = await client.health.getReady();
if (!ready.ready) {
  showNotReady(ready);
}
```

### 4. Use Template System

```typescript
// Preview template
const preview = await client.templates.preview({
  template: 'Hello {{customer_name}}!',
  variables: { customer_name: 'John' },
});

// Validate template
const validation = await client.templates.validate({
  template: 'Hello {{customer_name}}!',
  trigger: 'order_created',
});
```

## Testing

### 1. Health Endpoints

```typescript
// Test health endpoint
const health = await client.health.get();
expect(health.ok).toBe(true);
expect(health.db.ok).toBe(true);
expect(health.redis.ok).toBe(true);
```

### 2. Queue Health

```typescript
// Test queue health
const queueHealth = await client.queue.getHealth();
expect(queueHealth.redis).toBe(true);
expect(queueHealth.queues).toBeDefined();
```

### 3. Template System

```typescript
// Test template preview
const preview = await client.templates.preview({
  template: 'Hello {{customer_name}}!',
  variables: { customer_name: 'John' },
});
expect(preview.rendered).toBe('Hello John!');
```

## Next Steps

### 1. Immediate Actions

- [ ] Update API client to include required headers
- [ ] Implement health monitoring in frontend
- [ ] Add error handling for new error format
- [ ] Test template system integration

### 2. Short Term (1-2 weeks)

- [ ] Implement queue health monitoring
- [ ] Add metrics dashboard
- [ ] Test webhook integration
- [ ] Validate CORS configuration

### 3. Long Term (1 month)

- [ ] Implement advanced template features
- [ ] Add real-time updates
- [ ] Optimize caching strategy
- [ ] Add performance monitoring

## Support

For questions or issues with these changes:

1. **Documentation**: Check the comprehensive API reference in `/docs/API_REFERENCE.md`
2. **Examples**: See the Postman collection in `/postman/SMS_Blossom.postman_collection.json`
3. **SDK**: Use the TypeScript client in `/sdk/index.ts`
4. **Mocks**: Test with mock data in `/mocks/` directory

## Version History

- **v1.0.0** (2024-01-15): Initial release with all core features
- **v0.9.0** (2024-01-10): Beta release with basic functionality
- **v0.8.0** (2024-01-05): Alpha release with core API

This changelog ensures the frontend team is fully informed of backend changes and can implement them effectively.
