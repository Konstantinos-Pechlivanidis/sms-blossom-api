# SMS Blossom API Documentation

Welcome to the comprehensive documentation for the SMS Blossom API - a powerful Shopify SMS marketing automation platform.

## Quick Start

### Generate TypeScript Types
```bash
npm run openapi:types
```

### Build Documentation Site
```bash
npm run docs:build
npm run docs:serve
```

### Update Database ERD
```bash
npm run prisma:erd
```

## Documentation Structure

### 📋 [API Reference](./openapi/openapi.yaml)
Complete OpenAPI 3.1 specification with all endpoints, schemas, and examples.

### 🚀 [Getting Started Guide](./site/getting-started.md)
Step-by-step guide to integrate with the SMS Blossom API.

### 📚 [SDK Documentation](./generated/sdk/ts/README.md)
TypeScript SDK with examples and usage patterns.

### 🧪 [Postman Collection](./postman/SMS_Blossom_API.postman_collection.json)
Ready-to-use API collection for testing and development.

### 🗄️ [Database Schema](./erd/diagram.svg)
Visual representation of the database structure and relationships.

## API Overview

The SMS Blossom API provides comprehensive SMS marketing automation for Shopify stores:

### Core Features
- **Campaign Management**: Create, schedule, and manage SMS campaigns
- **Customer Segmentation**: Advanced filtering and audience targeting  
- **Template Engine**: LiquidJS-powered SMS templates with custom filters
- **Discount Integration**: Shopify discount code management
- **Webhook Processing**: Real-time Shopify event handling
- **GDPR Compliance**: Data protection and consent management
- **Analytics & Reporting**: Comprehensive metrics and insights

### Authentication
- JWT-based authentication with Shopify OAuth integration
- HMAC verification for webhooks and App Proxy requests
- Rate limiting per shop domain

### Base URLs
- **Production**: `https://api.sms-blossom.com`
- **Staging**: `https://sms-blossom-api.onrender.com`
- **Development**: `http://localhost:3000`

## Quick Examples

### Create a Campaign
```typescript
import { createApiClient } from 'sms-blossom-api';

const api = createApiClient({
  baseUrl: 'https://api.sms-blossom.com',
  apiKey: 'your-jwt-token'
});

const campaign = await api.createCampaign('mystore.myshopify.com', {
  name: 'Black Friday Sale',
  template: 'Get 20% off with code {{ discount_code }}!',
  segmentId: 'seg_123',
  scheduleAt: '2024-11-24T00:00:00Z'
});
```

### Create a Discount
```typescript
const discount = await api.createDiscount('mystore.myshopify.com', {
  code: 'SAVE20',
  title: '20% Off Everything',
  type: 'percentage',
  value: 20,
  startsAt: '2024-01-01T00:00:00Z',
  endsAt: '2024-01-31T23:59:59Z'
});
```

### Preview Template
```typescript
const preview = await api.previewTemplate({
  body: 'Hi {{ customer.first_name }}, your order {{ order.number }} is ready!',
  variables: {
    customer: { first_name: 'John' },
    order: { number: '1001' }
  }
});
```

## API Endpoints

### Health & Monitoring
- `GET /health` - System health check
- `GET /health/ready` - Readiness probe
- `GET /queue/health` - Queue system status
- `GET /metrics` - Prometheus metrics

### Authentication
- `GET /auth/install` - Shopify OAuth installation
- `GET /auth/callback` - OAuth callback handler

### Campaigns
- `GET /campaigns` - List campaigns
- `POST /campaigns` - Create campaign
- `GET /campaigns/{id}` - Get campaign
- `PUT /campaigns/{id}` - Update campaign
- `DELETE /campaigns/{id}` - Delete campaign
- `POST /campaigns/{id}/estimate` - Estimate campaign
- `POST /campaigns/{id}/test` - Test send campaign
- `POST /campaigns/{id}/send` - Send campaign

### Discounts
- `GET /discounts` - List discounts
- `POST /discounts` - Create discount
- `GET /discounts/{id}` - Get discount
- `PUT /discounts/{id}` - Update discount
- `DELETE /discounts/{id}` - Delete discount
- `POST /discounts/conflicts` - Check discount conflicts

### Templates
- `GET /templates` - List templates
- `POST /templates` - Create template
- `POST /templates/preview` - Preview template
- `POST /templates/validate` - Validate template
- `GET /templates/variables/{trigger}` - Get template variables

### Segments
- `GET /segments` - List segments
- `POST /segments` - Create segment
- `POST /segments/preview` - Preview segment

### Reports
- `GET /reports/overview` - Overview report
- `GET /reports/messaging` - Messaging report

### Settings
- `GET /settings` - Get shop settings
- `PUT /settings` - Update shop settings

### Webhooks
- `POST /webhooks/shopify/orders/create` - Shopify orders/create
- `POST /webhooks/shopify/orders/paid` - Shopify orders/paid
- `POST /webhooks/shopify/checkouts/update` - Shopify checkouts/update
- `POST /webhooks/mitto/dlr` - Mitto DLR webhook
- `POST /webhooks/mitto/inbound` - Mitto inbound webhook

### Public Endpoints
- `POST /public/unsubscribe` - Public unsubscribe
- `POST /public/back-in-stock` - Back in stock notification

## Error Handling

The API uses standard HTTP status codes and returns structured error responses:

```json
{
  "error": "validation_error",
  "message": "Invalid request data",
  "details": {
    "field": "name",
    "reason": "required"
  },
  "traceId": "req_123456"
}
```

### Common Error Codes
- `400` - Bad Request (invalid data)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `409` - Conflict (resource already exists)
- `422` - Unprocessable Entity (validation errors)
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

## Rate Limiting

API requests are rate-limited per shop domain. Rate limit information is provided in response headers:

- `X-RateLimit-Limit` - Request limit per window
- `X-RateLimit-Remaining` - Remaining requests in current window
- `X-RateLimit-Reset` - Time when the rate limit resets

## Webhooks

The API supports webhooks for real-time event processing:

### Shopify Webhooks
- **orders/create** - New order created
- **orders/paid** - Order payment completed
- **checkouts/update** - Checkout updated (abandoned checkout detection)

### Mitto Webhooks
- **DLR** - Delivery receipt notifications
- **Inbound** - Inbound SMS messages

### Webhook Security
All webhooks are secured with HMAC signatures:
- Shopify: `X-Shopify-Hmac-Sha256` header
- Mitto: `X-Mitto-Hmac-Sha256` header

## SDK Usage

### TypeScript/JavaScript
```bash
npm install sms-blossom-api
```

```typescript
import { createApiClient } from 'sms-blossom-api';

const api = createApiClient({
  baseUrl: 'https://api.sms-blossom.com',
  apiKey: 'your-jwt-token'
});
```

### Postman Collection
Import the [Postman collection](./postman/SMS_Blossom_API.postman_collection.json) for testing and development.

## Support

- **Documentation**: [https://docs.sms-blossom.com](https://docs.sms-blossom.com)
- **Support Email**: support@sms-blossom.com
- **GitHub Issues**: [https://github.com/sms-blossom/api/issues](https://github.com/sms-blossom/api/issues)

## License

MIT License - see [LICENSE](../LICENSE) file for details.
