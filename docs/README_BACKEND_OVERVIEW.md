# SMS Blossom Backend Overview

## System Architecture

The SMS Blossom backend is a Node.js/Express API that provides SMS marketing capabilities for Shopify stores. It integrates with Shopify's OAuth system, Mitto SMS provider, and uses Redis for queuing and caching.

### Core Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Shopify App   │    │   Frontend UI   │    │   External      │
│   (OAuth)       │    │   (Embedded)    │    │   Services      │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │                      │                      │
┌─────────▼───────┐    ┌─────────▼───────┐    ┌─────────▼───────┐
│   Express API   │    │   App Proxy     │    │   Mitto SMS     │
│   (REST/GraphQL)│    │   (Public)      │    │   Provider      │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          │                      │                      │
┌─────────▼───────┐    ┌─────────▼───────┐    ┌─────────▼───────┐
│   PostgreSQL    │    │   Redis Queue   │    │   Webhooks      │
│   (Data Store)  │    │   (BullMQ)      │    │   (Events)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## API Surfaces

### 1. Admin API (Authenticated)

- **Base URL**: `https://api.sms-blossom.com`
- **Authentication**: JWT tokens from Shopify App Bridge
- **Headers Required**:
  - `Authorization: Bearer <jwt_token>`
  - `X-Shop-Domain: <shop>.myshopify.com`
  - `Content-Type: application/json`

**Endpoints**:

- `/health` - System health check
- `/settings` - Shop configuration
- `/automations` - Automation rules
- `/campaigns` - SMS campaigns
- `/discounts` - Discount management
- `/reports/*` - Analytics and reporting
- `/segments/*` - Customer segmentation
- `/templates/*` - Template management

### 2. App Proxy (Public)

- **Base URL**: `https://api.sms-blossom.com/proxy`
- **Authentication**: HMAC signature verification
- **Headers Required**:
  - `X-Shopify-Shop-Domain: <shop>.myshopify.com`
  - `X-Shopify-Hmac-Sha256: <signature>`

**Endpoints**:

- `/proxy/consent` - SMS consent collection
- `/proxy/unsubscribe` - SMS unsubscribe
- `/proxy/back-in-stock` - Back-in-stock notifications

### 3. Webhooks (External)

- **Base URL**: `https://api.sms-blossom.com/webhooks`
- **Authentication**: HMAC signature verification
- **Headers Required**:
  - `X-Shopify-Hmac-Sha256: <signature>`

**Endpoints**:

- `/webhooks/shopify/*` - Shopify events
- `/webhooks/mitto/*` - SMS delivery receipts

## Authentication Model

### JWT Token Flow

1. Frontend obtains session token from Shopify App Bridge
2. Token is sent as `Authorization: Bearer <token>` header
3. Backend validates token and extracts shop information
4. Shop scoping middleware attaches shop context to request

### Shop Scoping

- All authenticated endpoints require shop context
- Shop domain is extracted from JWT token or `X-Shop-Domain` header
- Returns `409 Conflict` if shop is not installed

### Rate Limiting

- Token bucket algorithm with Redis backend
- Default: 100 requests per minute per shop
- Headers returned:
  - `X-RateLimit-Limit: 100`
  - `X-RateLimit-Remaining: 95`
  - `X-RateLimit-Reset: 1640995200`
  - `Retry-After: 60` (when exceeded)

## Queue System

### BullMQ Queues

- **eventsQueue**: Shopify webhook events
- **automationsQueue**: Automation rule processing
- **campaignsQueue**: Campaign audience batching
- **deliveryQueue**: SMS sending
- **housekeepingQueue**: Cleanup and maintenance

### Queue Flow

```
Shopify Webhook → eventsQueue → automationsQueue → deliveryQueue
                                    ↓
                              campaignsQueue → deliveryQueue
```

## Environment Variables

### Backend Environment

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/smsblossom

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PREFIX=smsblossom:prod

# Authentication
JWT_SECRET=your-jwt-secret
SESSION_SECRET=your-session-secret
WEBHOOK_HMAC_SECRET=your-webhook-secret

# Encryption
ENCRYPTION_KEY=your-32-byte-key
HASH_PEPPER=your-hash-pepper

# SMS Provider
MITTO_API_KEY=your-mitto-key
MITTO_API_URL=https://api.mitto.ch/v2
MITTO_CALLBACK_URL=https://api.sms-blossom.com/webhooks/mitto/dlr
MITTO_HMAC_SECRET=your-mitto-hmac-secret

# Shopify
SHOPIFY_API_KEY=your-shopify-key
SHOPIFY_API_SECRET=your-shopify-secret
SHOPIFY_SCOPES=read_products,write_products,read_orders,write_orders

# CORS
CORS_ALLOWLIST=https://admin.shopify.com,https://your-app.com

# Monitoring
METRICS_TOKEN=your-metrics-token
```

### Frontend Environment

```bash
# API Configuration
REACT_APP_API_URL=https://api.sms-blossom.com
REACT_APP_SHOPIFY_API_KEY=your-shopify-key
REACT_APP_SHOPIFY_API_SECRET=your-shopify-secret

# App Proxy
REACT_APP_PROXY_URL=https://api.sms-blossom.com/proxy
REACT_APP_PROXY_SUBPATH=/apps/sms-blossom
```

## Data Flow

### 1. User Authentication

```
Frontend → Shopify App Bridge → JWT Token → Backend API
```

### 2. SMS Campaign Flow

```
Campaign Creation → Audience Snapshot → Queue Jobs → SMS Delivery
```

### 3. Webhook Processing

```
Shopify Event → HMAC Verification → Queue Job → Automation Processing
```

### 4. Consent Management

```
App Proxy → HMAC Verification → Consent Update → Shopify Customer Update
```

## Security Features

- **PII Encryption**: All sensitive data encrypted at rest
- **HMAC Verification**: All webhooks and App Proxy requests verified
- **Rate Limiting**: Per-shop rate limiting with Redis
- **CORS Protection**: Strict allowlist-based CORS policy
- **Input Validation**: Zod schema validation for all inputs
- **Audit Logging**: All significant actions logged

## Monitoring & Observability

- **Health Checks**: `/health` and `/ready` endpoints
- **Metrics**: Prometheus metrics at `/metrics`
- **Queue Health**: `/queue/health` for queue monitoring
- **Structured Logging**: JSON logs with request IDs
- **Error Tracking**: Comprehensive error handling and logging

## Next Steps

1. Review [Frontend Integration Guide](./FRONTEND_INTEGRATION_GUIDE.md)
2. Check [API Reference](./API_REFERENCE.md) for endpoint details
3. See [Security Surface](./SECURITY_SURFACE.md) for auth requirements
4. Use [TypeScript SDK](../sdk/index.ts) for type-safe API calls
