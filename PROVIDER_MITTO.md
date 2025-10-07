# Mitto SMS Provider Integration

## Overview

This document describes the Mitto SMS provider integration for SMS Blossom, including API contract, error mapping, and delivery receipt handling.

## API Contract

### Configuration

```javascript
const mittoClient = new MittoClient({
  apiKey: process.env.MITTO_API_KEY,
  apiUrl: process.env.MITTO_API_URL || 'https://api.mitto.com',
  timeout: 10000,
  maxRetries: 3,
  retryDelays: [100, 500, 2000],
});
```

### Send SMS

```javascript
const response = await sendSms({
  to: '+1234567890',
  text: 'Hello from SMS Blossom!',
  meta: {
    messageId: 'msg_123',
    shopId: 'shop_456',
    campaignId: 'camp_789',
  },
  callback_url: 'https://your-app.com/webhooks/mitto/dlr',
  requestId: 'req_abc123',
});

// Response:
{
  provider_msg_id: 'mitto_msg_xyz789',
  status: 'sent'
}
```

## Error Classification

### Transient Errors (Retryable)

| Error Type         | Description                 | Retry Strategy      |
| ------------------ | --------------------------- | ------------------- |
| Network timeout    | Connection timeout or abort | Exponential backoff |
| Connection reset   | Network connection lost     | Exponential backoff |
| HTTP 5xx           | Server errors               | Exponential backoff |
| HTTP 429           | Rate limiting               | Exponential backoff |
| Provider temporary | Temporary provider issues   | Exponential backoff |

### Permanent Errors (Non-retryable)

| Error Type      | Description                  | Message Status |
| --------------- | ---------------------------- | -------------- |
| HTTP 400        | Bad request                  | `failed`       |
| HTTP 401/403    | Authentication/authorization | `failed`       |
| Invalid number  | Invalid phone number         | `failed`       |
| Blocked content | Content blocked by provider  | `failed`       |
| Forbidden       | Account/permission issues    | `failed`       |

## Delivery Receipts (DLR)

### Webhook Endpoint

```
POST /webhooks/mitto/dlr
```

### HMAC Verification

```javascript
// Verify signature if MITTO_HMAC_SECRET is configured
const signature = req.get('X-Mitto-Signature') || req.get('X-Hub-Signature-256');
const isValid = verifyHmac(rawBody, signature, process.env.MITTO_HMAC_SECRET);
```

### DLR Payload

```javascript
{
  "message_id": "mitto_msg_xyz789",
  "status": "delivered", // or "failed", "undelivered"
  "error_code": "DLR_001",
  "error_message": "Message delivered successfully",
  "delivered_at": "2024-01-15T10:30:00Z",
  "failed_at": null
}
```

### Status Mapping

| DLR Status    | Message Status | Database Update   |
| ------------- | -------------- | ----------------- |
| `delivered`   | `delivered`    | `deliveredAt` set |
| `failed`      | `failed`       | `failedAt` set    |
| `undelivered` | `failed`       | `failedAt` set    |

## Inbound SMS

### Webhook Endpoint

```
POST /webhooks/mitto/inbound
```

### STOP/UNSUBSCRIBE Handling

```javascript
// Supported keywords
['STOP', 'UNSUBSCRIBE', 'STOPALL']

// Response actions:
1. Update contact.optedOut = true
2. Set contact.unsubscribedAt = new Date()
3. Update contact.smsConsentState = 'opted_out'
4. Create audit log entry
5. Push to Shopify (if customerId exists)
```

### HELP/INFO Handling

```javascript
// Supported keywords
['HELP', 'INFO'];

// Response: Log for manual follow-up
```

## Retry Strategy

### Exponential Backoff

```javascript
const retryDelays = [100, 500, 2000]; // ms
const maxRetries = 3;

// Attempt 1: Immediate
// Attempt 2: +100ms delay
// Attempt 3: +500ms delay
// Attempt 4: +2000ms delay
```

### Error Classification Logic

```javascript
function classifyError(error) {
  // Network/timeout errors
  if (error.name === 'AbortError' || error.code === 'ECONNRESET') {
    return { isTransient: true, type: 'network' };
  }

  // HTTP status codes
  if (error.statusCode >= 500) {
    return { isTransient: true, type: 'server_error' };
  }

  if (error.statusCode === 429) {
    return { isTransient: true, type: 'rate_limit' };
  }

  if (error.statusCode >= 400) {
    return { isTransient: false, type: 'client_error' };
  }

  // Provider-specific errors
  if (error.providerError?.includes('rate limit')) {
    return { isTransient: true, type: 'provider_rate_limit' };
  }

  if (error.providerError?.includes('invalid')) {
    return { isTransient: false, type: 'invalid_number' };
  }

  // Default to transient for unknown errors
  return { isTransient: true, type: 'unknown' };
}
```

## Metrics

### Prometheus Metrics

```
# SMS send attempts
sms_send_attempts_total{status="queued|sent|failed"} 1234

# SMS send errors
sms_send_errors_total{type="transient|permanent|processing_error"} 56

# SMS delivery success
sms_delivery_success_total{provider="mitto"} 1100

# Queue job duration
queue_job_duration_ms_total{queue="delivery"} 45000
```

## Environment Variables

```bash
# Required
MITTO_API_KEY=your_api_key_here
MITTO_API_URL=https://api.mitto.com

# Optional
MITTO_TIMEOUT=10000
MITTO_MAX_RETRIES=3
MITTO_CALLBACK_URL=https://your-app.com/webhooks/mitto/dlr
MITTO_HMAC_SECRET=your_webhook_secret
```

## Health Checks

```javascript
// Provider health check
const isHealthy = await mittoClient.healthCheck();

// Returns true if provider is reachable
```

## Testing

### Unit Tests

```javascript
// Test error classification
expect(classifyError({ name: 'AbortError' })).toEqual({
  isTransient: true,
  type: 'network',
});

// Test retry logic
expect(retryDelays).toEqual([100, 500, 2000]);
```

### Integration Tests

```javascript
// Test actual SMS sending
const response = await sendSms({
  to: '+1234567890',
  text: 'Test message',
  requestId: 'test_123',
});

expect(response.provider_msg_id).toBeDefined();
expect(response.status).toBe('sent');
```

## Troubleshooting

### Common Issues

1. **Authentication Errors (401/403)**
   - Check `MITTO_API_KEY` is correct
   - Verify API key has SMS sending permissions

2. **Rate Limiting (429)**
   - Implement exponential backoff
   - Consider request throttling

3. **Invalid Numbers (400)**
   - Validate phone numbers before sending
   - Use E.164 format (+1234567890)

4. **DLR Not Received**
   - Verify `MITTO_CALLBACK_URL` is accessible
   - Check webhook HMAC verification
   - Ensure webhook endpoint returns 200

### Debug Logging

```javascript
// Enable debug logging
logger.info(
  {
    to,
    textLength,
    meta,
    requestId,
  },
  'Sending SMS via Mitto',
);

logger.error(
  {
    error: error.message,
    isTransient: error.isTransient,
    attempt,
  },
  'SMS send failed',
);
```


