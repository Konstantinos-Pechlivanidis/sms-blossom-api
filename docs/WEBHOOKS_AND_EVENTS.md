# Webhooks and Events

This document describes the webhook system, event processing flow, and how Shopify events are transformed into SMS automation triggers.

## Overview

The SMS Blossom backend processes Shopify webhooks to trigger SMS automations. Events flow through a queue system that normalizes data and evaluates automation rules.

## Event Flow Architecture

```
Shopify Webhook → HMAC Verification → Event Storage → Queue Processing → Automation Evaluation → SMS Delivery
```

### Queue Flow Diagram

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Shopify       │    │   Events       │    │  Automations   │    │   Delivery      │
│   Webhooks      │───▶│   Queue        │───▶│   Queue        │───▶│   Queue         │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                        │                        │
                                ▼                        ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
                       │   Event         │    │   Automation   │    │   SMS           │
                       │   Storage       │    │   Evaluation   │    │   Delivery      │
                       └─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Shopify Webhook Topics

### Supported Topics

| Topic                     | Description              | Trigger Variables                                                                                           |
| ------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `orders/create`           | New order created        | `order_number`, `order_total`, `customer_name`, `customer_email`, `customer_phone`, `order_url`             |
| `orders/paid`             | Order payment completed  | `order_number`, `order_total`, `currency`, `customer_name`, `customer_email`, `customer_phone`, `order_url` |
| `checkouts/create`        | Checkout session created | `checkout_id`, `cart_total`, `customer_name`, `customer_email`, `recovery_url`                              |
| `checkouts/update`        | Checkout session updated | `checkout_id`, `cart_total`, `customer_name`, `customer_email`, `recovery_url`                              |
| `fulfillments/create`     | Fulfillment created      | `order_number`, `tracking_number`, `carrier`, `tracking_url`, `customer_name`                               |
| `fulfillments/update`     | Fulfillment updated      | `order_number`, `tracking_number`, `carrier`, `tracking_url`, `customer_name`                               |
| `customers/create`        | New customer created     | `customer_name`, `customer_email`, `customer_phone`                                                         |
| `customers/update`        | Customer updated         | `customer_name`, `customer_email`, `customer_phone`                                                         |
| `inventory_levels/update` | Inventory level changed  | `product_title`, `variant_title`, `inventory_quantity`                                                      |

### GDPR Topics

| Topic                    | Description            | Action               |
| ------------------------ | ---------------------- | -------------------- |
| `customers/data_request` | Customer data request  | Export customer data |
| `customers/redact`       | Customer data deletion | Delete customer data |
| `shop/redact`            | Shop data deletion     | Delete shop data     |

## Webhook Endpoints

### Shopify Webhooks

**Base URL**: `https://api.sms-blossom.com/webhooks/shopify`

#### POST /webhooks/shopify/:topic

**Description**: Handle Shopify webhook events

**Authentication**: HMAC signature verification

**Headers Required**:

- `X-Shopify-Hmac-Sha256`: Webhook signature
- `X-Shopify-Shop-Domain`: Shop domain
- `X-Shopify-Topic`: Event topic

**Example Request**:

```bash
curl -X POST https://api.sms-blossom.com/webhooks/shopify/orders/paid \
  -H "X-Shopify-Hmac-Sha256: <signature>" \
  -H "X-Shopify-Shop-Domain: shop.myshopify.com" \
  -H "X-Shopify-Topic: orders/paid" \
  -H "Content-Type: application/json" \
  -d '{"id": 123456, "order_number": "1001", "total_price": "99.99", "currency": "USD", "customer": {"first_name": "John", "email": "john@example.com"}}'
```

**Response**:

```json
{
  "success": true,
  "event_id": "event_123",
  "processed": true
}
```

### Mitto SMS Webhooks

**Base URL**: `https://api.sms-blossom.com/webhooks/mitto`

#### POST /webhooks/mitto/dlr

**Description**: Handle SMS delivery receipts

**Authentication**: HMAC signature verification

**Headers Required**:

- `X-Mitto-Signature`: Delivery receipt signature

**Request Body**:

```json
{
  "message_id": "msg_123456",
  "status": "delivered",
  "timestamp": "2024-01-15T10:30:00Z",
  "phone": "+1234567890",
  "error_code": null,
  "error_message": null
}
```

**Response**:

```json
{
  "success": true,
  "updated": true
}
```

#### POST /webhooks/mitto/inbound

**Description**: Handle inbound SMS messages

**Authentication**: HMAC signature verification

**Request Body**:

```json
{
  "message_id": "inbound_123",
  "from": "+1234567890",
  "to": "+1987654321",
  "text": "STOP",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Response**:

```json
{
  "success": true,
  "action": "unsubscribed",
  "contact_updated": true
}
```

## Event Processing

### Event Normalization

Events are normalized into a consistent context format for automation evaluation:

```typescript
interface EventContext {
  // Common fields
  shop_name: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;

  // Order-specific
  order_number?: string;
  order_total?: string;
  currency?: string;
  order_url?: string;

  // Checkout-specific
  checkout_id?: string;
  cart_total?: string;
  recovery_url?: string;

  // Fulfillment-specific
  tracking_number?: string;
  carrier?: string;
  tracking_url?: string;

  // Inventory-specific
  product_title?: string;
  variant_title?: string;
  inventory_quantity?: number;
}
```

### Event Storage

Events are stored in the database with:

- **Deduplication**: Events are deduplicated by `shop:topic:objectId`
- **Raw Payload**: Original webhook payload is stored
- **Processing Status**: Tracked through queue system
- **Retention**: Events older than 30 days are cleaned up

### Queue Processing

#### Events Queue

- **Purpose**: Initial webhook processing and normalization
- **Processor**: `processEvent()` function
- **Output**: Normalized context sent to automations queue

#### Automations Queue

- **Purpose**: Evaluate automation rules against events
- **Processor**: `evaluateAutomation()` function
- **Output**: SMS jobs sent to delivery queue

#### Delivery Queue

- **Purpose**: Send SMS messages via Mitto
- **Processor**: `processDelivery()` function
- **Output**: SMS delivery status updates

#### Housekeeping Queue

- **Purpose**: Cleanup and maintenance tasks
- **Processor**: `processHousekeeping()` function
- **Tasks**: Clean old messages, retry failed messages, rollup reports

## Automation Triggers

### Trigger Types

| Trigger              | Description           | Context Variables                                                             |
| -------------------- | --------------------- | ----------------------------------------------------------------------------- |
| `abandoned_checkout` | Checkout abandoned    | `checkout_id`, `cart_total`, `customer_name`, `recovery_url`                  |
| `order_created`      | Order created         | `order_number`, `order_total`, `customer_name`, `order_url`                   |
| `order_paid`         | Order paid            | `order_number`, `order_total`, `currency`, `customer_name`, `order_url`       |
| `fulfillment_update` | Fulfillment updated   | `order_number`, `tracking_number`, `carrier`, `tracking_url`, `customer_name` |
| `welcome`            | New customer          | `customer_name`, `customer_email`, `customer_phone`                           |
| `back_in_stock`      | Product back in stock | `product_title`, `variant_title`, `inventory_quantity`                        |

### Automation Rules

Automations are evaluated based on:

- **Trigger Match**: Event topic matches automation trigger
- **Consent Check**: Customer has SMS consent
- **Quiet Hours**: Outside configured quiet hours
- **Frequency Caps**: Within message frequency limits
- **Segment Filters**: Customer matches automation audience

## DLR (Delivery Receipt) Processing

### Status Mapping

| Mitto Status | Internal Status | Description                     |
| ------------ | --------------- | ------------------------------- |
| `delivered`  | `delivered`     | Message successfully delivered  |
| `failed`     | `failed`        | Message delivery failed         |
| `pending`    | `sent`          | Message sent, awaiting delivery |
| `expired`    | `failed`        | Message expired                 |

### Message State Transitions

```
queued → sent → delivered
   ↓        ↓
 failed ← failed
```

### DLR Processing Flow

1. **Receive DLR**: Mitto sends delivery receipt
2. **HMAC Verification**: Verify webhook signature
3. **Update Message**: Update message status and timestamps
4. **Metrics Update**: Update delivery metrics
5. **Retry Logic**: Retry failed messages if applicable

## Inbound SMS Processing

### Supported Commands

| Command | Action                | Response             |
| ------- | --------------------- | -------------------- |
| `STOP`  | Unsubscribe customer  | Confirmation message |
| `HELP`  | Send help information | Help message         |
| `START` | Resubscribe customer  | Welcome message      |

### Inbound Processing Flow

1. **Receive Inbound**: Mitto sends inbound message
2. **HMAC Verification**: Verify webhook signature
3. **Command Parsing**: Parse command from message text
4. **Contact Update**: Update customer consent status
5. **Shopify Sync**: Update Shopify customer consent
6. **Audit Log**: Log consent change

## Error Handling

### Webhook Errors

| Error               | Status | Description                        |
| ------------------- | ------ | ---------------------------------- |
| `invalid_signature` | 401    | HMAC signature verification failed |
| `missing_headers`   | 400    | Required headers missing           |
| `invalid_payload`   | 400    | Malformed request body             |
| `duplicate_event`   | 200    | Event already processed            |
| `processing_error`  | 500    | Internal processing error          |

### Retry Logic

- **Webhook Retries**: Shopify retries failed webhooks
- **Queue Retries**: BullMQ retries failed jobs with exponential backoff
- **Message Retries**: Failed SMS messages are retried up to 3 times

### Dead Letter Queue

Failed jobs are moved to DLQ after max retries:

- **Events DLQ**: Failed event processing jobs
- **Delivery DLQ**: Failed SMS delivery jobs

## Monitoring and Observability

### Metrics

- **Webhook Events**: Total webhook events received
- **Processing Latency**: Time from webhook to SMS delivery
- **Success Rates**: Delivery success rates by provider
- **Queue Health**: Queue depth and processing rates

### Logging

All webhook processing is logged with:

- **Request ID**: Unique identifier for request tracing
- **Shop Domain**: Shop identifier
- **Event Topic**: Webhook topic
- **Processing Status**: Success/failure status
- **Timing**: Processing duration

### Health Checks

- **Queue Health**: `/queue/health` endpoint
- **Webhook Status**: Webhook processing status
- **DLR Processing**: Delivery receipt processing status

## Configuration

### Environment Variables

```bash
# Webhook HMAC secrets
WEBHOOK_HMAC_SECRET=your-webhook-secret
MITTO_HMAC_SECRET=your-mitto-secret

# Queue configuration
REDIS_URL=redis://localhost:6379
QUEUE_DRIVER=redis

# Retry configuration
MAX_RETRIES=3
RETRY_DELAY=1000
```

### Webhook URLs

Configure these URLs in your Shopify app settings:

```
https://api.sms-blossom.com/webhooks/shopify/orders/create
https://api.sms-blossom.com/webhooks/shopify/orders/paid
https://api.sms-blossom.com/webhooks/shopify/checkouts/create
https://api.sms-blossom.com/webhooks/shopify/checkouts/update
https://api.sms-blossom.com/webhooks/shopify/fulfillments/create
https://api.sms-blossom.com/webhooks/shopify/fulfillments/update
https://api.sms-blossom.com/webhooks/shopify/customers/create
https://api.sms-blossom.com/webhooks/shopify/customers/update
https://api.sms-blossom.com/webhooks/shopify/inventory_levels/update
```

## Testing

### Webhook Testing

Use the provided mock webhook data in `mocks/webhooks/` to test webhook processing:

```bash
# Test order paid webhook
curl -X POST https://api.sms-blossom.com/webhooks/shopify/orders/paid \
  -H "X-Shopify-Hmac-Sha256: <test-signature>" \
  -H "X-Shopify-Shop-Domain: test-shop.myshopify.com" \
  -H "Content-Type: application/json" \
  -d @mocks/webhooks/orders-paid.json
```

### Queue Testing

Use the queue health endpoint to monitor processing:

```bash
curl -X GET https://api.sms-blossom.com/queue/health \
  -H "Authorization: Bearer <token>" \
  -H "X-Shop-Domain: shop.myshopify.com"
```

## Next Steps

1. Review [API Reference](./API_REFERENCE.md) for webhook endpoint details
2. Check [Templates Catalog](./TEMPLATES_CATALOG.md) for available trigger variables
3. See [Campaigns Guide](./CAMPAIGNS_AND_DISCOUNTS_GUIDE.md) for automation setup
4. Use [Mock Data](../mocks/webhooks/) for testing webhook processing
