# Campaigns & Discounts Services Documentation

## Overview

This document describes the implementation of core Campaigns and Discounts services aligned with the OpenAPI specification. The services provide SMS campaign management with discount code integration, audience targeting, and cost estimation.

## Architecture

### Services Structure

```
src/services/
├── discounts-service.js    # Discount code management
├── campaigns-service.js    # Campaign management
└── ...

src/routes/
├── discounts.js           # Discount API endpoints
├── campaigns.js           # Campaign API endpoints
└── ...
```

### Data Flow

```
Campaign Creation → Segment Targeting → Audience Snapshot → Cost Estimation → Test Send → Campaign Send
                                    ↓
                              Discount Attachment → Apply URL Generation → UTM Tracking
```

## Discounts Service

### Core Features

- **Create/Update Discounts**: Shopify Admin GraphQL integration (Sprint 5)
- **Conflict Detection**: Automatic discount conflict scanning
- **Apply URL Builder**: UTM-enabled discount application URLs
- **Persistence**: Local discount mapping with Shopify sync

### API Endpoints

#### `POST /discounts`

Create a new discount code.

**Request:**

```json
{
  "code": "WELCOME10",
  "title": "Welcome Discount",
  "kind": "percentage",
  "value": 10,
  "currencyCode": "EUR",
  "startsAt": "2024-01-01T00:00:00Z",
  "endsAt": "2024-12-31T23:59:59Z",
  "appliesOncePerCustomer": true,
  "usageLimit": 1000,
  "redirect": "/checkout",
  "segments": ["vip", "new_customers"]
}
```

**Response:**

```json
{
  "ok": true,
  "code": "WELCOME10",
  "title": "Welcome Discount",
  "id": "disc_123",
  "startsAt": "2024-01-01T00:00:00Z",
  "endsAt": "2024-12-31T23:59:59Z",
  "applyUrl": "https://shop.myshopify.com/discount/WELCOME10?redirect=%2Fcheckout&utm_source=sms&utm_medium=sms"
}
```

#### `GET /discounts/apply-url`

Build canonical apply URL for a discount code.

**Query Parameters:**

- `shop`: Shop domain
- `code`: Discount code
- `redirect`: Redirect URL (default: `/checkout`)

**Response:**

```json
{
  "ok": true,
  "url": "https://shop.myshopify.com/discount/WELCOME10?redirect=%2Fcheckout&utm_source=sms&utm_medium=sms"
}
```

#### `GET /discounts/conflicts`

Check for conflicts with automatic discounts.

**Response:**

```json
{
  "ok": true,
  "automaticDiscounts": [],
  "warnings": []
}
```

### Database Schema

```sql
CREATE TABLE "Discount" (
  "id" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  "shopId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "type" TEXT NOT NULL, -- 'percentage' | 'amount' | 'shipping'
  "value" DECIMAL(10,2),
  "currencyCode" TEXT,
  "startsAt" TIMESTAMP,
  "endsAt" TIMESTAMP,
  "usageLimit" INTEGER,
  "oncePerCustomer" BOOLEAN DEFAULT true,
  "applyUrl" TEXT,
  "providerId" TEXT, -- Shopify CodeDiscountNode id
  "status" TEXT, -- 'active' | 'expired' | 'scheduled'
  "utmJson" JSONB
);
```

## Campaigns Service

### Core Features

- **CRUD Operations**: Full campaign lifecycle management
- **Audience Snapshot**: Segment-based recipient materialization
- **Cost Estimation**: SMS segment calculation and cost projection
- **Test Send**: Individual phone number testing
- **Batch Processing**: Queue-based campaign delivery
- **Discount Integration**: Campaign-discount linking with UTM tracking

### API Endpoints

#### `POST /campaigns`

Create a new campaign.

**Request:**

```json
{
  "name": "Welcome Campaign",
  "segmentId": "seg_123",
  "templateId": "tpl_456",
  "templateKey": "welcome",
  "bodyText": "Welcome {{ customer_name }}! Use code {{ discount_code }} for {{ discount_value }}% off!",
  "discountId": "disc_789",
  "scheduleAt": "2024-01-15T10:00:00Z",
  "batchSize": 100,
  "utmJson": {
    "utm_campaign": "welcome_2024",
    "utm_content": "sms"
  }
}
```

**Response:**

```json
{
  "ok": true,
  "campaign": {
    "id": "camp_123",
    "name": "Welcome Campaign",
    "status": "draft",
    "segmentId": "seg_123",
    "templateId": "tpl_456",
    "discountId": "disc_789",
    "scheduleAt": "2024-01-15T10:00:00Z",
    "batchSize": 100,
    "utmJson": {
      "utm_campaign": "welcome_2024",
      "utm_content": "sms"
    }
  }
}
```

#### `GET /campaigns`

List campaigns with pagination and filtering.

**Query Parameters:**

- `shop`: Shop domain
- `limit`: Results limit (default: 50)
- `offset`: Pagination offset (default: 0)
- `status`: Filter by status (draft|scheduled|sending|paused|completed|failed)

**Response:**

```json
{
  "ok": true,
  "campaigns": [...],
  "pagination": {
    "total": 25,
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

#### `POST /campaigns/{id}/snapshot`

Snapshot audience from segment into campaign recipients.

**Response:**

```json
{
  "ok": true,
  "recipientCount": 150,
  "campaignId": "camp_123"
}
```

#### `GET /campaigns/{id}/estimate`

Estimate campaign cost and recipient count.

**Response:**

```json
{
  "ok": true,
  "estimate": {
    "recipientCount": 150,
    "totalSegments": 1,
    "estimatedCost": 7.5,
    "currency": "USD",
    "breakdown": {
      "recipients": 150,
      "segmentsPerMessage": 1,
      "costPerSegment": 0.05,
      "totalCost": 7.5
    }
  }
}
```

#### `POST /campaigns/{id}/test-send`

Test send campaign to a specific phone number.

**Request:**

```json
{
  "phone": "+1234567890"
}
```

**Response:**

```json
{
  "ok": true,
  "message": "Test send job enqueued",
  "contactId": "contact_123"
}
```

#### `POST /campaigns/{id}/send-now`

Send campaign to snapshotted audience.

**Response:**

```json
{
  "ok": true,
  "message": "Campaign send job enqueued",
  "campaignId": "camp_123"
}
```

#### `POST /campaigns/{id}/attach-discount`

Attach discount to campaign.

**Request:**

```json
{
  "discountId": "disc_789"
}
```

#### `POST /campaigns/{id}/detach-discount`

Detach discount from campaign.

#### `PUT /campaigns/{id}/utm`

Set UTM parameters for campaign.

**Request:**

```json
{
  "utm_campaign": "welcome_2024",
  "utm_content": "sms",
  "utm_term": "new_customers"
}
```

#### `GET /campaigns/{id}/apply-url`

Preview campaign discount apply URL.

**Response:**

```json
{
  "ok": true,
  "url": "https://shop.myshopify.com/discount/WELCOME10?redirect=%2Fcheckout&utm_source=sms&utm_medium=sms&utm_campaign=camp_123",
  "campaignId": "camp_123",
  "discountCode": "WELCOME10"
}
```

### Database Schema

```sql
CREATE TABLE "Campaign" (
  "id" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  "shopId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "segmentId" TEXT,
  "templateId" TEXT,
  "templateKey" TEXT,
  "scheduleAt" TIMESTAMP,
  "status" TEXT DEFAULT 'draft', -- draft|scheduled|sending|paused|completed|failed
  "utmJson" JSONB,
  "batchSize" INTEGER,
  "bodyText" TEXT,
  "discountId" TEXT
);

CREATE TABLE "CampaignRecipient" (
  "id" TEXT PRIMARY KEY,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  "shopId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "status" TEXT DEFAULT 'pending', -- pending|sent|failed|skipped
  "reason" TEXT,
  "messageId" TEXT,
  "cost" DECIMAL(10,4),
  "segmentsUsed" INTEGER
);
```

## Queue Integration

### Campaign Processing Flow

1. **Audience Snapshot**: Materialize segment contacts into `CampaignRecipient` records
2. **Batch Processing**: Enqueue `campaigns:batch` jobs with pagination
3. **Delivery Jobs**: Each batch creates individual `delivery:send` jobs
4. **Template Rendering**: Liquid template processing with context variables
5. **Provider Integration**: SMS delivery via Mitto (Sprint 5)

### Queue Jobs

```javascript
// Campaign batch job
{
  type: 'campaigns:batch',
  data: {
    campaignId: 'camp_123',
    shopId: 'shop.myshopify.com',
    batchSize: 100,
    requestId: 'req_123'
  }
}

// Delivery job
{
  type: 'delivery:send',
  data: {
    campaignId: 'camp_123',
    shopId: 'shop.myshopify.com',
    contactId: 'contact_456',
    template: 'Welcome {{ customer_name }}!',
    context: { customer_name: 'John Doe' },
    isTest: false,
    requestId: 'req_123'
  }
}
```

## Cost Estimation

### SMS Segmentation

- **GSM 7-bit**: 160 characters per segment
- **Unicode**: 70 characters per segment
- **Multi-part**: 153 characters per segment (GSM) or 67 characters (Unicode)

### Cost Calculation

```javascript
const segments = computeSmsSegments(messageText);
const cost = segments.parts * costPerSegment; // $0.05 per segment
```

### Estimation Response

```json
{
  "recipientCount": 150,
  "totalSegments": 1,
  "estimatedCost": 7.5,
  "currency": "USD",
  "breakdown": {
    "recipients": 150,
    "segmentsPerMessage": 1,
    "costPerSegment": 0.05,
    "totalCost": 7.5
  }
}
```

## UTM Tracking

### Apply URL Structure

```
https://shop.myshopify.com/discount/{code}?redirect={redirect}&utm_source=sms&utm_medium=sms&utm_campaign={campaignId}&{custom_utm}
```

### UTM Parameters

- `utm_source=sms`: Identifies SMS as traffic source
- `utm_medium=sms`: Identifies SMS as marketing medium
- `utm_campaign={campaignId}`: Links to specific campaign
- Custom UTM: Additional parameters from campaign `utmJson`

## Error Handling

### Common Error Responses

```json
{
  "error": "missing_shop",
  "details": "Shop parameter is required"
}

{
  "error": "unknown_shop",
  "details": "Shop not found"
}

{
  "error": "code_conflict",
  "details": "Discount code already exists"
}

{
  "error": "campaign_has_no_discount",
  "details": "Campaign has no discount attached"
}
```

### HTTP Status Codes

- `200`: Success
- `400`: Bad Request (missing parameters)
- `404`: Not Found (shop, campaign, discount)
- `409`: Conflict (duplicate discount code)
- `422`: Unprocessable Entity (validation errors)
- `500`: Internal Server Error

## Testing

### Integration Tests

```javascript
// Test discount creation
const discount = await createDiscount({
  shopId: 'shop.myshopify.com',
  code: 'TEST10',
  kind: 'percentage',
  value: 10,
});

// Test campaign creation
const campaign = await createCampaign({
  shopId: 'shop.myshopify.com',
  name: 'Test Campaign',
  segmentId: 'seg_123',
  bodyText: 'Test message',
});

// Test cost estimation
const estimate = await estimateCampaign({
  shopId: 'shop.myshopify.com',
  campaignId: campaign.id,
});

// Test send
const testSend = await testSendCampaign({
  shopId: 'shop.myshopify.com',
  campaignId: campaign.id,
  phoneE164: '+1234567890',
});
```

### Queue Testing

```javascript
// Enqueue campaign batch
await enqueueJob('campaigns', 'batch', {
  campaignId: 'camp_123',
  shopId: 'shop.myshopify.com',
  batchSize: 100,
});

// Enqueue test delivery
await enqueueJob('delivery', 'send', {
  campaignId: 'camp_123',
  shopId: 'shop.myshopify.com',
  contactId: 'contact_456',
  template: 'Test message',
  isTest: true,
});
```

## Future Enhancements (Sprint 5)

### Shopify Integration

- **GraphQL API**: Direct Shopify Admin API integration
- **Webhook Sync**: Real-time discount status updates
- **Conflict Detection**: Live automatic discount scanning

### Advanced Features

- **A/B Testing**: Campaign variant testing
- **Scheduling**: Advanced campaign scheduling
- **Analytics**: Detailed campaign performance metrics
- **Segmentation**: Advanced customer segmentation rules

### Provider Integration

- **Mitto API**: Real SMS delivery integration
- **Delivery Receipts**: DLR webhook processing
- **Cost Tracking**: Real-time cost monitoring
- **Retry Logic**: Failed message retry mechanisms

## Security Considerations

### Data Protection

- **PII Minimization**: Only essential customer data stored
- **Encryption**: Sensitive data encrypted at rest
- **Access Control**: Shop-scoped data access
- **Audit Logging**: All operations logged

### Rate Limiting

- **Campaign Limits**: Maximum recipients per campaign
- **Frequency Caps**: Customer message frequency limits
- **Queue Throttling**: Batch processing rate limits
- **API Limits**: Request rate limiting

## Monitoring & Observability

### Metrics

- **Campaign Performance**: Send rates, delivery rates, costs
- **Queue Health**: Job processing rates, failure rates
- **API Performance**: Response times, error rates
- **Database Performance**: Query performance, connection health

### Logging

- **Structured Logging**: JSON-formatted logs with context
- **Request Tracing**: End-to-end request tracking
- **Error Tracking**: Detailed error logging with stack traces
- **Audit Trail**: Complete operation audit log

### Health Checks

- **Database Health**: Connection and query performance
- **Queue Health**: Redis connectivity and job processing
- **External Services**: Shopify API and SMS provider health
- **System Resources**: Memory, CPU, and disk usage


