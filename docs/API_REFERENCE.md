# SMS Blossom API Reference

This document provides a comprehensive reference for all SMS Blossom API endpoints, including request/response schemas, authentication requirements, and usage examples.

## Base URL

```
https://api.sms-blossom.com
```

## Authentication

All authenticated endpoints require:

- `Authorization: Bearer <jwt_token>`
- `X-Shop-Domain: <shop>.myshopify.com`
- `Content-Type: application/json`

## Rate Limiting

- **Limit**: 100 requests per minute per shop
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- **Exceeded**: Returns `429` with `Retry-After` header

---

## Health Endpoints

### GET /health

**Description**: System health check with database, Redis, and queue status

**Auth Required**: No

**Rate Limit**: None

**Response**:

```json
{
  "ok": true,
  "version": "1.0.0",
  "db": {
    "ok": true,
    "latency_ms": 45
  },
  "redis": {
    "ok": true,
    "latency_ms": 12
  },
  "queues": {
    "ok": true,
    "workers": 3
  },
  "pii": {
    "phone_pct": 95,
    "email_pct": 98
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "request_id": "req_123456"
}
```

**Curl Example**:

```bash
curl -X GET https://api.sms-blossom.com/health
```

**TypeScript Usage**:

```typescript
const health = await api.health.get();
console.log(`System status: ${health.ok ? 'healthy' : 'unhealthy'}`);
```

### GET /health/ready

**Description**: Readiness probe for Kubernetes/container orchestration

**Auth Required**: No

**Rate Limit**: None

**Response**:

```json
{
  "ready": true,
  "request_id": "req_123456"
}
```

**Status Codes**:

- `200`: All systems ready
- `503`: Systems not ready

---

## Template Endpoints

### POST /templates/preview

**Description**: Preview template rendering with variables

**Auth Required**: Yes

**Rate Limit**: 10 requests per minute

**Request Body**:

```json
{
  "template": "Hello {{customer_name}}, your order #{{order_number}} is ready!",
  "variables": {
    "customer_name": "John Doe",
    "order_number": "1001"
  }
}
```

**Response**:

```json
{
  "rendered": "Hello John Doe, your order #1001 is ready!",
  "segments": 1,
  "warnings": [],
  "variables_used": ["customer_name", "order_number"]
}
```

**Curl Example**:

```bash
curl -X POST https://api.sms-blossom.com/templates/preview \
  -H "Authorization: Bearer <token>" \
  -H "X-Shop-Domain: shop.myshopify.com" \
  -H "Content-Type: application/json" \
  -d '{"template": "Hello {{customer_name}}!", "variables": {"customer_name": "John"}}'
```

### GET /templates/variables/:trigger

**Description**: Get available variables for a specific trigger

**Auth Required**: Yes

**Rate Limit**: 20 requests per minute

**Path Parameters**:

- `trigger`: Trigger type (`abandoned_checkout`, `order_created`, `order_paid`, etc.)

**Response**:

```json
{
  "trigger": "abandoned_checkout",
  "variables": [
    {
      "name": "customer_name",
      "type": "string",
      "description": "Customer's full name"
    },
    {
      "name": "checkout_url",
      "type": "string",
      "description": "Link to complete checkout"
    }
  ]
}
```

---

## Settings Endpoints

### GET /settings

**Description**: Get shop settings and configuration

**Auth Required**: Yes

**Rate Limit**: 10 requests per minute

**Response**:

```json
{
  "timezone": "America/New_York",
  "quietHours": {
    "start": 22,
    "end": 8
  },
  "cap": {
    "windowHours": 24,
    "maxPerWindow": 1
  },
  "abandoned": {
    "delayMinutes": 30
  }
}
```

### PUT /settings

**Description**: Update shop settings

**Auth Required**: Yes

**Rate Limit**: 5 requests per minute

**Request Body**:

```json
{
  "timezone": "America/New_York",
  "quietHours": {
    "start": 22,
    "end": 8
  },
  "cap": {
    "windowHours": 24,
    "maxPerWindow": 1
  }
}
```

**Response**:

```json
{
  "success": true,
  "settings": {
    "timezone": "America/New_York",
    "quietHours": {
      "start": 22,
      "end": 8
    },
    "cap": {
      "windowHours": 24,
      "maxPerWindow": 1
    }
  }
}
```

---

## Automation Endpoints

### GET /automations

**Description**: Get automation rules for the shop

**Auth Required**: Yes

**Rate Limit**: 20 requests per minute

**Response**:

```json
{
  "automations": [
    {
      "id": "auto_123",
      "name": "Abandoned Checkout",
      "trigger": "abandoned_checkout",
      "enabled": true,
      "template": "Complete your order: {{checkout_url}}",
      "delayMinutes": 30,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### PUT /automations

**Description**: Update automation rules

**Auth Required**: Yes

**Rate Limit**: 5 requests per minute

**Request Body**:

```json
{
  "automations": [
    {
      "id": "auto_123",
      "name": "Abandoned Checkout",
      "trigger": "abandoned_checkout",
      "enabled": true,
      "template": "Complete your order: {{checkout_url}}",
      "delayMinutes": 30
    }
  ]
}
```

---

## Segment Endpoints

### POST /segments/preview

**Description**: Preview segment filter results

**Auth Required**: Yes

**Rate Limit**: 10 requests per minute

**Request Body**:

```json
{
  "filter": {
    "and": [
      {
        "field": "sms_consent_state",
        "operator": "equals",
        "value": "opted_in"
      },
      {
        "field": "created_at",
        "operator": "gte",
        "value": "2024-01-01T00:00:00Z"
      }
    ]
  }
}
```

**Response**:

```json
{
  "count": 1250,
  "filter": {
    "and": [
      {
        "field": "sms_consent_state",
        "operator": "equals",
        "value": "opted_in"
      }
    ]
  }
}
```

---

## Campaign Endpoints

### GET /campaigns

**Description**: List campaigns for the shop

**Auth Required**: Yes

**Rate Limit**: 20 requests per minute

**Query Parameters**:

- `status`: Filter by status (`draft`, `scheduled`, `sending`, `paused`, `completed`, `failed`)
- `limit`: Number of results (default: 50, max: 100)
- `offset`: Pagination offset (default: 0)

**Response**:

```json
{
  "campaigns": [
    {
      "id": "camp_123",
      "name": "Welcome Campaign",
      "status": "draft",
      "template": "Welcome {{customer_name}}!",
      "audience": {
        "segment": "all",
        "count": 1250
      },
      "created_at": "2024-01-15T10:30:00Z",
      "scheduled_at": null
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 1
  }
}
```

### POST /campaigns

**Description**: Create a new campaign

**Auth Required**: Yes

**Rate Limit**: 5 requests per minute

**Request Body**:

```json
{
  "name": "Welcome Campaign",
  "template": "Welcome {{customer_name}}!",
  "audience": {
    "segment": "all"
  },
  "scheduled_at": "2024-01-16T10:00:00Z"
}
```

**Response**:

```json
{
  "id": "camp_123",
  "name": "Welcome Campaign",
  "status": "draft",
  "template": "Welcome {{customer_name}}!",
  "audience": {
    "segment": "all",
    "count": 1250
  },
  "created_at": "2024-01-15T10:30:00Z",
  "scheduled_at": "2024-01-16T10:00:00Z"
}
```

### GET /campaigns/:id

**Description**: Get campaign details

**Auth Required**: Yes

**Rate Limit**: 20 requests per minute

**Response**:

```json
{
  "id": "camp_123",
  "name": "Welcome Campaign",
  "status": "draft",
  "template": "Welcome {{customer_name}}!",
  "audience": {
    "segment": "all",
    "count": 1250
  },
  "metrics": {
    "sent": 0,
    "delivered": 0,
    "failed": 0
  },
  "created_at": "2024-01-15T10:30:00Z",
  "scheduled_at": "2024-01-16T10:00:00Z"
}
```

### POST /campaigns/:id/estimate

**Description**: Estimate campaign cost and audience size

**Auth Required**: Yes

**Rate Limit**: 10 requests per minute

**Response**:

```json
{
  "audience_count": 1250,
  "estimated_cost": 12.5,
  "currency": "USD",
  "segments": 1,
  "warnings": []
}
```

### POST /campaigns/:id/test-send

**Description**: Send test campaign to specific phone number

**Auth Required**: Yes

**Rate Limit**: 5 requests per minute

**Request Body**:

```json
{
  "phone": "+1234567890",
  "variables": {
    "customer_name": "Test User"
  }
}
```

**Response**:

```json
{
  "success": true,
  "message_id": "msg_123",
  "phone": "+1234567890",
  "rendered": "Welcome Test User!"
}
```

### POST /campaigns/:id/send

**Description**: Send campaign to audience

**Auth Required**: Yes

**Rate Limit**: 1 request per minute

**Response**:

```json
{
  "success": true,
  "campaign_id": "camp_123",
  "audience_count": 1250,
  "estimated_cost": 12.5,
  "status": "sending"
}
```

---

## Discount Endpoints

### GET /discounts

**Description**: List discount codes

**Auth Required**: Yes

**Rate Limit**: 20 requests per minute

**Response**:

```json
{
  "discounts": [
    {
      "id": "disc_123",
      "code": "WELCOME10",
      "title": "Welcome Discount",
      "type": "percentage",
      "value": 10,
      "minimum_amount": 50,
      "usage_limit": 100,
      "used_count": 25,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### POST /discounts

**Description**: Create discount code

**Auth Required**: Yes

**Rate Limit**: 5 requests per minute

**Request Body**:

```json
{
  "code": "WELCOME10",
  "title": "Welcome Discount",
  "type": "percentage",
  "value": 10,
  "minimum_amount": 50,
  "usage_limit": 100
}
```

**Response**:

```json
{
  "id": "disc_123",
  "code": "WELCOME10",
  "title": "Welcome Discount",
  "type": "percentage",
  "value": 10,
  "minimum_amount": 50,
  "usage_limit": 100,
  "used_count": 0,
  "created_at": "2024-01-15T10:30:00Z"
}
```

### POST /discounts/conflicts

**Description**: Check for discount code conflicts

**Auth Required**: Yes

**Rate Limit**: 10 requests per minute

**Request Body**:

```json
{
  "code": "WELCOME10"
}
```

**Response**:

```json
{
  "conflicts": false,
  "existing_discount": null
}
```

### GET /discounts/:id/apply-url

**Description**: Get discount apply URL

**Auth Required**: Yes

**Rate Limit**: 20 requests per minute

**Response**:

```json
{
  "apply_url": "https://shop.myshopify.com/discount/WELCOME10",
  "utm_params": {
    "utm_source": "sms_blossom",
    "utm_medium": "sms",
    "utm_campaign": "welcome"
  }
}
```

---

## Report Endpoints

### GET /reports/overview

**Description**: Get overview analytics

**Auth Required**: Yes

**Rate Limit**: 10 requests per minute

**Caching**: 5 minutes (`x-cache: hit`)

**Response**:

```json
{
  "period": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  },
  "metrics": {
    "total_campaigns": 15,
    "total_sent": 12500,
    "total_delivered": 11800,
    "delivery_rate": 94.4,
    "total_revenue": 125000
  },
  "cached_at": "2024-01-15T10:30:00Z"
}
```

### GET /reports/messaging

**Description**: Get messaging analytics

**Auth Required**: Yes

**Rate Limit**: 10 requests per minute

**Caching**: 2 minutes (`x-cache: hit`)

**Query Parameters**:

- `start`: Start date (ISO 8601)
- `end`: End date (ISO 8601)
- `granularity`: `hour`, `day`, `week`, `month`

**Response**:

```json
{
  "period": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z",
    "granularity": "day"
  },
  "timeseries": [
    {
      "date": "2024-01-01",
      "sent": 500,
      "delivered": 475,
      "failed": 25
    }
  ],
  "cached_at": "2024-01-15T10:30:00Z"
}
```

---

## Queue Health Endpoints

### GET /queue/health

**Description**: Get queue system health

**Auth Required**: Yes

**Rate Limit**: 20 requests per minute

**Response**:

```json
{
  "redis": true,
  "queues": {
    "events": {
      "waiting": 5,
      "active": 2,
      "completed": 1250,
      "failed": 3,
      "delayed": 0
    },
    "automations": {
      "waiting": 0,
      "active": 1,
      "completed": 500,
      "failed": 0,
      "delayed": 0
    }
  },
  "dlq": {
    "events_dead": 3,
    "delivery_dead": 1
  },
  "timestamp": "2024-01-15T10:30:00Z",
  "request_id": "req_123456"
}
```

---

## Metrics Endpoints

### GET /metrics

**Description**: Prometheus metrics

**Auth Required**: Optional (if `METRICS_TOKEN` is set)

**Rate Limit**: None

**Headers**:

- `Authorization: Bearer <METRICS_TOKEN>` (if token is configured)

**Response**: Prometheus text format

```
# HELP sms_send_attempts_total Total number of SMS send attempts
# TYPE sms_send_attempts_total counter
sms_send_attempts_total{provider="mitto",status="success"} 1250
```

### GET /metrics/json

**Description**: JSON formatted metrics

**Auth Required**: Optional (if `METRICS_TOKEN` is set)

**Rate Limit**: None

**Response**:

```json
{
  "metrics": [
    {
      "name": "sms_send_attempts_total",
      "help": "Total number of SMS send attempts",
      "type": "counter",
      "values": [
        {
          "labels": {
            "provider": "mitto",
            "status": "success"
          },
          "value": 1250
        }
      ]
    }
  ],
  "timestamp": "2024-01-15T10:30:00Z",
  "request_id": "req_123456"
}
```

---

## App Proxy Endpoints

### POST /proxy/consent

**Description**: Collect SMS consent via App Proxy

**Auth Required**: App Proxy HMAC

**Rate Limit**: 100 requests per minute

**Query Parameters**:

- `shop`: Shop domain
- `timestamp`: App Proxy timestamp
- `signature`: App Proxy HMAC

**Request Body**:

```json
{
  "phone": "+1234567890",
  "consent": true,
  "source": "checkout"
}
```

**Response**:

```json
{
  "success": true,
  "contact_id": "contact_123",
  "consent_state": "opted_in"
}
```

### POST /proxy/unsubscribe

**Description**: Handle SMS unsubscribe

**Auth Required**: App Proxy HMAC

**Rate Limit**: 100 requests per minute

**Request Body**:

```json
{
  "phone": "+1234567890"
}
```

**Response**:

```json
{
  "success": true,
  "unsubscribed": true
}
```

### POST /proxy/back-in-stock/interest

**Description**: Register back-in-stock interest

**Auth Required**: App Proxy HMAC

**Rate Limit**: 100 requests per minute

**Request Body**:

```json
{
  "phone": "+1234567890",
  "inventoryItemId": "1234567890"
}
```

**Response**:

```json
{
  "ok": true,
  "id": "interest_123",
  "productMeta": {
    "title": "Product Name",
    "handle": "product-handle"
  }
}
```

---

## Public Endpoints

### GET /public/unsubscribe

**Description**: Public unsubscribe page

**Auth Required**: No

**Rate Limit**: 100 requests per minute

**Query Parameters**:

- `token`: Unsubscribe token

**Response**: HTML page

---

## Webhook Endpoints

### POST /webhooks/shopify/orders/create

**Description**: Handle order creation webhook

**Auth Required**: Shopify HMAC

**Rate Limit**: 1000 requests per minute

**Headers**:

- `X-Shopify-Hmac-Sha256`: Webhook signature
- `X-Shopify-Shop-Domain`: Shop domain
- `X-Shopify-Topic`: `orders/create`

**Response**:

```json
{
  "success": true,
  "event_id": "event_123"
}
```

### POST /webhooks/mitto/dlr

**Description**: Handle SMS delivery receipts

**Auth Required**: Mitto HMAC

**Rate Limit**: 1000 requests per minute

**Request Body**:

```json
{
  "message_id": "msg_123",
  "status": "delivered",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Response**:

```json
{
  "success": true,
  "updated": true
}
```

---

## Error Responses

### Standard Error Format

```json
{
  "error": "error_code",
  "message": "Human readable error message",
  "details": "Additional error details",
  "request_id": "req_123456"
}
```

### Common Error Codes

| Code                  | Status | Description                       |
| --------------------- | ------ | --------------------------------- |
| `missing_auth`        | 401    | Missing or invalid authentication |
| `shop_not_installed`  | 409    | Shop not installed                |
| `rate_limit_exceeded` | 429    | Rate limit exceeded               |
| `validation_error`    | 400    | Request validation failed         |
| `internal_error`      | 500    | Internal server error             |

### Rate Limit Headers

When rate limit is exceeded:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1640995200
Retry-After: 60
```

---

## Caching

### Cache Headers

Responses may include cache headers:

```
x-cache: hit
x-cache-ttl: 300
x-cache-key: reports:overview:shop_123
```

### Cache Invalidation

Cache is automatically invalidated when:

- Campaigns are sent
- Settings are updated
- New webhooks are processed

---

## TypeScript SDK Usage

```typescript
import { SmsBlossomApi } from '../sdk';

const api = new SmsBlossomApi({
  baseUrl: 'https://api.sms-blossom.com',
  getAuthHeaders: async () => ({
    Authorization: `Bearer ${token}`,
    'X-Shop-Domain': shopDomain,
  }),
});

// Type-safe API calls
const health = await api.health.get();
const campaigns = await api.campaigns.list();
const newCampaign = await api.campaigns.create({
  name: 'Welcome Campaign',
  template: 'Welcome {{customer_name}}!',
  audience: { segment: 'all' },
});
```

---

## Next Steps

1. Review [Frontend Integration Guide](./FRONTEND_INTEGRATION_GUIDE.md) for implementation details
2. Check [Templates Catalog](./TEMPLATES_CATALOG.md) for available variables
3. See [Campaigns Guide](./CAMPAIGNS_AND_DISCOUNTS_GUIDE.md) for campaign management
4. Use [TypeScript SDK](../sdk/index.ts) for type-safe API calls
