# Webhooks Guide

## Overview

This guide covers the comprehensive webhook system for SMS Blossom, including per-topic Shopify webhooks, GDPR compliance, and integration flows.

## Webhook Architecture

### Flow Diagram

```
Shopify → Webhook → HMAC Verification → Event Storage → Queue Processing
    ↓
Events Table (dedupe_key) → eventsQueue → automationsQueue → deliveryQueue
```

### Components

1. **Per-topic Routes**: Dedicated handlers for each webhook type
2. **HMAC Verification**: Security validation for all incoming webhooks
3. **Event Storage**: Persistent storage with deduplication
4. **Queue Processing**: Asynchronous job processing
5. **GDPR Compliance**: Data request and redaction handling

## Supported Webhook Topics

### Orders

#### `orders/create`

- **Purpose**: Trigger welcome messages for new orders
- **Payload**: Order creation data with customer information
- **Queue**: `eventsQueue` → `automationsQueue`
- **Job Type**: `orders:create`

**Sample Payload:**

```json
{
  "id": 123,
  "name": "#1001",
  "email": "customer@example.com",
  "phone": "+1234567890",
  "customer": {
    "id": 456,
    "email": "customer@example.com",
    "first_name": "John",
    "last_name": "Doe"
  },
  "line_items": [
    {
      "id": 789,
      "title": "Test Product",
      "quantity": 1,
      "price": "29.99"
    }
  ],
  "total_price": "29.99",
  "currency": "USD",
  "created_at": "2024-01-15T10:30:00Z"
}
```

#### `orders/paid`

- **Purpose**: Trigger payment confirmation messages
- **Payload**: Order payment data
- **Queue**: `eventsQueue` → `automationsQueue`
- **Job Type**: `orders:paid`

**Sample Payload:**

```json
{
  "id": 123,
  "name": "#1001",
  "email": "customer@example.com",
  "financial_status": "paid",
  "total_price": "29.99",
  "currency": "USD",
  "processed_at": "2024-01-15T10:30:00Z"
}
```

### Fulfillments

#### `fulfillments/create`

- **Purpose**: Trigger shipping notifications
- **Payload**: Fulfillment creation data
- **Queue**: `eventsQueue` → `automationsQueue`
- **Job Type**: `fulfillments:create`

**Sample Payload:**

```json
{
  "id": 789,
  "order_id": 123,
  "status": "success",
  "tracking_company": "UPS",
  "tracking_number": "1Z999AA1234567890",
  "tracking_url": "https://www.ups.com/track?trackingNumber=1Z999AA1234567890",
  "created_at": "2024-01-15T10:30:00Z"
}
```

#### `fulfillments/update`

- **Purpose**: Trigger delivery status updates
- **Payload**: Fulfillment update data
- **Queue**: `eventsQueue` → `automationsQueue`
- **Job Type**: `fulfillments:update`

### Checkouts

#### `checkouts/create`

- **Purpose**: Track new checkout sessions
- **Payload**: Checkout creation data
- **Queue**: `eventsQueue` → `automationsQueue`
- **Job Type**: `checkouts:create`

#### `checkouts/update`

- **Purpose**: Detect abandoned checkouts
- **Payload**: Checkout update data
- **Queue**: `eventsQueue` → `automationsQueue`
- **Job Type**: `checkouts:update`

**Sample Payload:**

```json
{
  "id": 456,
  "email": "customer@example.com",
  "phone": "+1234567890",
  "abandoned_checkout_url": "https://checkout.shopify.com/123",
  "line_items": [
    {
      "id": 789,
      "title": "Test Product",
      "quantity": 1,
      "price": "29.99"
    }
  ],
  "total_price": "29.99",
  "currency": "USD",
  "created_at": "2024-01-15T10:30:00Z"
}
```

### Customers

#### `customers/create`

- **Purpose**: Trigger welcome sequences
- **Payload**: Customer creation data
- **Queue**: `eventsQueue` → `automationsQueue`
- **Job Type**: `customers:create`

#### `customers/update`

- **Purpose**: Handle customer data changes
- **Payload**: Customer update data
- **Queue**: `eventsQueue` → `automationsQueue`
- **Job Type**: `customers:update`

**Sample Payload:**

```json
{
  "id": 789,
  "email": "customer@example.com",
  "phone": "+1234567890",
  "first_name": "John",
  "last_name": "Doe",
  "accepts_marketing": true,
  "created_at": "2024-01-15T10:30:00Z"
}
```

### Inventory

#### `inventory_levels/update`

- **Purpose**: Trigger back-in-stock notifications
- **Payload**: Inventory level data
- **Queue**: `eventsQueue` → `automationsQueue`
- **Job Type**: `inventory_levels:update`

**Sample Payload:**

```json
{
  "inventory_item_id": 123,
  "location_id": 456,
  "available": 10,
  "updated_at": "2024-01-15T10:30:00Z"
}
```

## GDPR Compliance

### Data Request

#### `customers/data_request`

- **Purpose**: Handle customer data export requests
- **Payload**: Customer data request information
- **Queue**: `housekeepingQueue`
- **Job Type**: `gdpr:data_request`

**Sample Payload:**

```json
{
  "customer": {
    "id": 123,
    "email": "customer@example.com",
    "phone": "+1234567890"
  },
  "shop_domain": "test-shop.myshopify.com",
  "orders_to_redact": [456, 789]
}
```

### Customer Redaction

#### `customers/redact`

- **Purpose**: Handle customer data deletion requests
- **Payload**: Customer redaction information
- **Queue**: `housekeepingQueue`
- **Job Type**: `gdpr:customer_redact`

**Sample Payload:**

```json
{
  "customer": {
    "id": 123,
    "email": "customer@example.com",
    "phone": "+1234567890"
  },
  "shop_domain": "test-shop.myshopify.com"
}
```

### Shop Redaction

#### `shop/redact`

- **Purpose**: Handle shop data deletion requests
- **Payload**: Shop redaction information
- **Queue**: `housekeepingQueue`
- **Job Type**: `gdpr:shop_redact`

**Sample Payload:**

```json
{
  "shop_domain": "test-shop.myshopify.com",
  "shop_id": 123
}
```

## Security

### HMAC Verification

All webhooks are protected with HMAC-SHA256 verification:

```javascript
const hmac = crypto
  .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET)
  .update(payload, 'utf8')
  .digest('base64');

// Header: X-Shopify-Hmac-Sha256: sha256=<hmac>
```

### Environment Variables

```bash
WEBHOOK_HMAC_SECRET=your_webhook_secret_here
```

## Event Storage

### Deduplication

Events are stored with a unique `dedupeKey` to prevent duplicate processing:

```javascript
const dedupeKey = `${shopId}:${topic}:${objectId}`;
```

### Event Schema

```sql
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  shop_id VARCHAR NOT NULL,
  topic VARCHAR NOT NULL,
  object_id VARCHAR NOT NULL,
  raw JSONB NOT NULL,
  dedupe_key VARCHAR UNIQUE NOT NULL,
  received_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Queue Processing

### Events Queue

- **Purpose**: Process incoming webhook events
- **Jobs**: `orders:create`, `orders:paid`, `fulfillments:create`, etc.
- **Next Queue**: `automationsQueue`

### Automations Queue

- **Purpose**: Evaluate automation rules
- **Jobs**: `automations:evaluate`
- **Next Queue**: `deliveryQueue`

### Delivery Queue

- **Purpose**: Send SMS messages
- **Jobs**: `delivery:send`
- **Provider**: Mitto SMS API

## Error Handling

### HTTP Status Codes

- `200`: Success
- `400`: Bad Request (missing required fields)
- `401`: Unauthorized (invalid HMAC)
- `404`: Not Found (shop not found)
- `500`: Internal Server Error

### Error Responses

```json
{
  "error": "missing_order_id",
  "message": "Order ID is required"
}
```

### Retry Logic

- **Transient Errors**: Automatic retry with exponential backoff
- **Permanent Errors**: Log and skip
- **Max Retries**: 3 attempts
- **Backoff**: 100ms, 500ms, 2s

## Testing

### Unit Tests

```bash
npm test tests/webhooks.test.js
```

### Integration Tests

```bash
npm test tests/webhook-integration.test.js
```

### Contract Tests

```bash
npm test tests/webhook-contracts.test.js
```

## Monitoring

### Metrics

- Webhook reception rate
- Processing latency
- Error rates by topic
- Queue depth

### Logging

```javascript
logger.info(
  {
    eventId: 'event_123',
    shopId: 'shop_123',
    topic: 'orders/create',
    objectId: '123',
  },
  'Webhook event processed',
);
```

## Troubleshooting

### Common Issues

1. **Invalid HMAC**: Check `WEBHOOK_HMAC_SECRET` configuration
2. **Missing Fields**: Verify payload structure matches expected format
3. **Duplicate Events**: Check `dedupeKey` uniqueness
4. **Queue Backlog**: Monitor queue depth and processing rates

### Debug Mode

```bash
DEBUG=webhooks:* npm start
```

## Best Practices

1. **Idempotency**: Always check for existing events
2. **Fast Response**: Return 200 quickly, process asynchronously
3. **Error Handling**: Log errors but don't expose sensitive data
4. **Monitoring**: Track webhook health and performance
5. **Security**: Always verify HMAC signatures
6. **GDPR**: Handle data requests and redactions promptly
