# SMS Blossom API TypeScript SDK

A comprehensive TypeScript SDK for the SMS Blossom API - Shopify SMS marketing automation platform.

## Installation

```bash
npm install sms-blossom-api
# or
yarn add sms-blossom-api
```

## Quick Start

```typescript
import { createApiClient } from 'sms-blossom-api';

// Initialize the API client
const api = createApiClient({
  baseUrl: 'https://api.sms-blossom.com',
  apiKey: 'your-jwt-token-here',
  timeout: 30000, // optional, defaults to 30 seconds
});

// Example: Create a campaign
async function createCampaign() {
  try {
    const campaign = await api.createCampaign('mystore.myshopify.com', {
      name: 'Black Friday Sale',
      template: 'Get 20% off with code {{ discount_code }}! Shop now: {{ shop_url }}',
      segmentId: 'seg_123',
      scheduleAt: '2024-11-24T00:00:00Z',
      utmJson: {
        source: 'sms',
        medium: 'campaign',
        campaign: 'black_friday'
      }
    });
    
    console.log('Campaign created:', campaign);
  } catch (error) {
    console.error('Error creating campaign:', error);
  }
}
```

## Authentication

The SDK supports JWT-based authentication. You can obtain a JWT token through the OAuth flow:

```typescript
// OAuth installation
await api.installApp('mystore.myshopify.com');

// OAuth callback (typically handled by your backend)
const authResult = await api.handleOAuthCallback(
  'authorization_code',
  'mystore.myshopify.com',
  'state_parameter'
);

// Use the token for subsequent requests
const api = createApiClient({
  baseUrl: 'https://api.sms-blossom.com',
  apiKey: authResult.token,
});
```

## Core Features

### Campaign Management

```typescript
// List campaigns
const campaigns = await api.listCampaigns('mystore.myshopify.com', 1, 20, 'draft');

// Create campaign
const campaign = await api.createCampaign('mystore.myshopify.com', {
  name: 'Welcome Series',
  template: 'Welcome {{ customer.first_name }}! Use code WELCOME10 for 10% off.',
  segmentId: 'seg_456',
  scheduleAt: '2024-01-20T09:00:00Z'
});

// Test send campaign
const testResult = await api.testSendCampaign(
  'camp_123',
  'mystore.myshopify.com',
  '+1234567890',
  {
    customer: { first_name: 'John' },
    discount_code: 'WELCOME10'
  }
);

// Send campaign
const sendResult = await api.sendCampaign('camp_123', 'mystore.myshopify.com');
```

### Discount Management

```typescript
// Create discount
const discount = await api.createDiscount('mystore.myshopify.com', {
  code: 'SAVE20',
  title: '20% Off Everything',
  type: 'percentage',
  value: 20,
  startsAt: '2024-01-01T00:00:00Z',
  endsAt: '2024-01-31T23:59:59Z',
  usageLimit: 1000,
  oncePerCustomer: true
});

// Check for conflicts
const conflicts = await api.checkDiscountConflicts(
  'mystore.myshopify.com',
  'SAVE20'
);
```

### Template Management

```typescript
// Preview template
const preview = await api.previewTemplate({
  body: 'Hi {{ customer.first_name }}, your order {{ order.number }} is ready!',
  variables: {
    customer: { first_name: 'John' },
    order: { number: '1001' }
  }
});

// Validate template
const validation = await api.validateTemplate({
  body: 'Hi {{ customer.first_name }}, complete your order: {{ recovery_url }}',
  trigger: 'abandoned_checkout'
});

// Get template variables
const variables = await api.getTemplateVariables('abandoned_checkout');
```

### Customer Segmentation

```typescript
// Create segment
const segment = await api.createSegment('mystore.myshopify.com', {
  name: 'VIP Customers',
  filterJson: {
    and: [
      { consent: 'opted_in' },
      { tags: { has: 'vip' } }
    ]
  }
});

// Preview segment
const preview = await api.previewSegment('mystore.myshopify.com', {
  and: [
    { consent: 'opted_in' },
    { tags: { has: 'vip' } }
  ]
});
```

### Reports & Analytics

```typescript
// Get overview report
const overview = await api.getOverviewReport('mystore.myshopify.com', '30d');

// Get messaging report
const messaging = await api.getMessagingReport('mystore.myshopify.com', '30d', 'day');
```

### Settings Management

```typescript
// Get shop settings
const settings = await api.getSettings('mystore.myshopify.com');

// Update settings
const updatedSettings = await api.updateSettings('mystore.myshopify.com', {
  timezone: 'America/New_York',
  locale: 'en-US',
  automations: {
    abandoned_checkout: {
      enabled: true,
      delay_minutes: 60,
      template: 'Complete your order: {{ recovery_url }}'
    },
    welcome: {
      enabled: true,
      delay_minutes: 5,
      template: 'Welcome {{ customer.first_name }}!'
    }
  }
});
```

## Error Handling

The SDK provides comprehensive error handling with typed error responses:

```typescript
try {
  const campaign = await api.createCampaign('mystore.myshopify.com', campaignData);
} catch (error) {
  if (error instanceof ApiError) {
    console.error('API Error:', error.status, error.statusText);
    console.error('Error details:', error.body);
  } else {
    console.error('Network or other error:', error.message);
  }
}
```

## Type Safety

The SDK is fully typed with TypeScript, providing:

- **Request/Response types** for all API endpoints
- **Enum types** for status values and options
- **Optional parameters** with proper typing
- **Error types** for comprehensive error handling

## Advanced Usage

### Custom Headers

```typescript
const api = createApiClient({
  baseUrl: 'https://api.sms-blossom.com',
  apiKey: 'your-token'
});

// Add custom headers to requests
const campaign = await api.createCampaign('mystore.myshopify.com', data, {
  headers: {
    'X-Custom-Header': 'value'
  }
});
```

### Request Timeouts

```typescript
// Set custom timeout for specific requests
const campaign = await api.createCampaign('mystore.myshopify.com', data, {
  timeout: 60000 // 60 seconds
});
```

### Health Monitoring

```typescript
// Check system health
const health = await api.getHealth();
console.log('System health:', health.ok);

// Check readiness
const readiness = await api.getReadiness();
console.log('System ready:', readiness.ready);

// Check queue health
const queueHealth = await api.getQueueHealth();
console.log('Queue status:', queueHealth.redis);
```

## Webhook Integration

For webhook handling, you'll typically use the raw HTTP endpoints. The SDK focuses on the main API operations, but you can extend it for webhook processing:

```typescript
// Example webhook handler (you'd implement this in your backend)
app.post('/webhooks/shopify/orders/create', async (req, res) => {
  // Verify HMAC signature
  // Process webhook payload
  // Return 200 status
});
```

## Rate Limiting

The API implements rate limiting per shop domain. The SDK will automatically handle rate limit responses (429 status codes) and you can implement retry logic:

```typescript
async function createCampaignWithRetry(shop: string, data: CreateCampaignRequest, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await api.createCampaign(shop, data);
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) {
        // Rate limited, wait and retry
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}
```

## Examples

See the `/examples` directory for complete working examples:

- **Basic Campaign Flow**: Create, test, and send a campaign
- **Discount Integration**: Create discounts and attach to campaigns
- **Template Management**: Create and validate SMS templates
- **Segmentation**: Build customer segments and preview audiences
- **Reporting**: Generate analytics and reports

## Support

For API documentation, visit: https://docs.sms-blossom.com

For support, contact: support@sms-blossom.com

## License

MIT License - see LICENSE file for details.
