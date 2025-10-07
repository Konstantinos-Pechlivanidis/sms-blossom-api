# SMS Blossom TypeScript SDK

A lightweight, type-safe client for the SMS Blossom API. No external dependencies - uses native fetch API.

## Installation

```bash
npm install @sms-blossom/sdk
```

## Quick Start

```typescript
import { SmsBlossomApi } from '@sms-blossom/sdk';

// Initialize the client
const api = new SmsBlossomApi({
  baseUrl: 'https://api.sms-blossom.com',
  getAuthHeaders: async () => {
    const token = await getSessionToken(app);
    return {
      'Authorization': `Bearer ${token}`,
      'X-Shop-Domain': shopDomain,
    };
  },
});

// Use the client
const health = await api.health.get();
const campaigns = await api.campaigns.list();
```

## Configuration

### Basic Configuration

```typescript
const api = new SmsBlossomApi({
  baseUrl: 'https://api.sms-blossom.com',
  getAuthHeaders: async () => ({
    'Authorization': `Bearer ${token}`,
    'X-Shop-Domain': 'shop.myshopify.com',
  }),
});
```

### With Shopify App Bridge

```typescript
import { useAppBridge } from '@shopify/app-bridge-react';
import { getSessionToken } from '@shopify/app-bridge/utilities';

function useApiClient() {
  const app = useAppBridge();
  
  const api = new SmsBlossomApi({
    baseUrl: process.env.REACT_APP_API_URL,
    getAuthHeaders: async () => {
      const token = await getSessionToken(app);
      return {
        'Authorization': `Bearer ${token}`,
        'X-Shop-Domain': shopDomain,
      };
    },
  });
  
  return api;
}
```

## API Reference

### Health Endpoints

```typescript
// Get system health
const health = await api.health.get();

// Check readiness
const ready = await api.health.ready();
```

### Template Endpoints

```typescript
// Preview template
const preview = await api.templates.preview({
  template: "Hello {{customer_name}}!",
  variables: { customer_name: "John Doe" }
});

// Validate template
const validation = await api.templates.validate({
  template: "Hello {{customer_name}}!",
  trigger: "welcome"
});

// Get available variables
const variables = await api.templates.getVariables("abandoned_checkout");
```

### Campaign Endpoints

```typescript
// List campaigns
const campaigns = await api.campaigns.list();

// Create campaign
const campaign = await api.campaigns.create({
  name: "Welcome Campaign",
  template: "Welcome {{customer_name}}!",
  audience: { segment: "all" }
});

// Get campaign
const campaign = await api.campaigns.get("camp_123");

// Update campaign
const updated = await api.campaigns.update("camp_123", {
  name: "Updated Campaign"
});

// Delete campaign
await api.campaigns.delete("camp_123");

// Estimate campaign
const estimate = await api.campaigns.estimate("camp_123");

// Test send campaign
const test = await api.campaigns.testSend("camp_123", {
  phone: "+1234567890",
  variables: { customer_name: "John Doe" }
});

// Send campaign
await api.campaigns.send("camp_123");
```

### Discount Endpoints

```typescript
// List discounts
const discounts = await api.discounts.list();

// Create discount
const discount = await api.discounts.create({
  code: "WELCOME10",
  title: "Welcome Discount",
  type: "percentage",
  value: 10,
  currency_code: "USD"
});

// Get discount
const discount = await api.discounts.get("disc_123");

// Update discount
const updated = await api.discounts.update("disc_123", {
  title: "Updated Discount"
});

// Delete discount
await api.discounts.delete("disc_123");

// Check conflicts
const conflicts = await api.discounts.checkConflicts({
  code: "WELCOME10"
});

// Get apply URL
const applyUrl = await api.discounts.getApplyUrl("disc_123");
```

### Report Endpoints

```typescript
// Get overview report
const overview = await api.reports.overview();

// Get campaign report
const campaigns = await api.reports.campaigns();

// Get messaging report
const messaging = await api.reports.messaging({
  granularity: "day"
});
```

### Queue Endpoints

```typescript
// Get queue health
const health = await api.queue.health();

// Get queue metrics
const metrics = await api.queue.metrics();
```

### Metrics Endpoints

```typescript
// Get Prometheus metrics
const metrics = await api.metrics.get();

// Get JSON metrics
const jsonMetrics = await api.metrics.getJson();
```

## Error Handling

```typescript
try {
  const campaign = await api.campaigns.create({
    name: "Test Campaign",
    template: "Hello {{customer_name}}!",
    audience: { segment: "all" }
  });
} catch (error) {
  if (error instanceof ApiError) {
    console.error(`API Error ${error.status}: ${error.message}`);
    console.error('Error details:', error.details);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## TypeScript Support

The SDK provides full TypeScript support with comprehensive type definitions:

```typescript
// All responses are fully typed
const health: HealthResponse = await api.health.get();
const campaigns: Campaign[] = await api.campaigns.list();
const discount: Discount = await api.discounts.get("disc_123");
```

## Authentication

The SDK requires authentication headers for all requests. The `getAuthHeaders` function should return the necessary headers:

```typescript
const api = new SmsBlossomApi({
  baseUrl: 'https://api.sms-blossom.com',
  getAuthHeaders: async () => {
    // Get token from your auth system
    const token = await getAuthToken();
    
    return {
      'Authorization': `Bearer ${token}`,
      'X-Shop-Domain': 'shop.myshopify.com',
    };
  },
});
```

## Rate Limiting

The SDK automatically handles rate limiting headers:

```typescript
try {
  const campaigns = await api.campaigns.list();
} catch (error) {
  if (error instanceof ApiError && error.status === 429) {
    // Rate limited - check error.details for retry information
    const retryAfter = error.details?.retry_after;
    if (retryAfter) {
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      // Retry the request
    }
  }
}
```

## Caching

Reports are cached on the server. The SDK respects cache headers:

```typescript
const overview = await api.reports.overview();
// Check response headers for cache status
// x-cache: hit
// x-cache-ttl: 300
```

## Best Practices

### 1. Error Handling

Always handle errors appropriately:

```typescript
async function createCampaign(data: CampaignData) {
  try {
    return await api.campaigns.create(data);
  } catch (error) {
    if (error instanceof ApiError) {
      switch (error.status) {
        case 401:
          // Redirect to login
          redirectToLogin();
          break;
        case 409:
          // Shop not installed
          showInstallPrompt();
          break;
        case 429:
          // Rate limited
          showRateLimitMessage();
          break;
        default:
          showErrorMessage(error.message);
      }
    }
    throw error;
  }
}
```

### 2. Request Deduplication

Implement request deduplication for expensive operations:

```typescript
class ApiClient {
  private pendingRequests = new Map();
  
  async request<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key);
    }
    
    const promise = fn();
    this.pendingRequests.set(key, promise);
    
    try {
      const result = await promise;
      return result;
    } finally {
      this.pendingRequests.delete(key);
    }
  }
}
```

### 3. Retry Logic

Implement retry logic for transient failures:

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (error instanceof ApiError && error.status < 500) {
        // Don't retry client errors
        throw error;
      }
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}
```

## Examples

### Complete Campaign Flow

```typescript
async function createWelcomeCampaign() {
  try {
    // 1. Create discount
    const discount = await api.discounts.create({
      code: "WELCOME10",
      title: "Welcome Discount",
      type: "percentage",
      value: 10,
      currency_code: "USD"
    });
    
    // 2. Create campaign
    const campaign = await api.campaigns.create({
      name: "Welcome Campaign",
      template: "Welcome {{customer_name}}! Use code {{discount_code}} for {{discount_value}} off!",
      audience: { segment: "new_customers" }
    });
    
    // 3. Attach discount
    await api.campaigns.attachDiscount(campaign.id, discount.id);
    
    // 4. Estimate campaign
    const estimate = await api.campaigns.estimate(campaign.id);
    console.log(`Estimated cost: ${estimate.estimated_cost} ${estimate.currency}`);
    
    // 5. Test send
    await api.campaigns.testSend(campaign.id, {
      phone: "+1234567890",
      variables: { customer_name: "John Doe" }
    });
    
    // 6. Send campaign
    await api.campaigns.send(campaign.id);
    
    return campaign;
  } catch (error) {
    console.error('Failed to create campaign:', error);
    throw error;
  }
}
```

### Report Dashboard

```typescript
async function loadDashboard() {
  try {
    const [overview, campaigns, messaging] = await Promise.all([
      api.reports.overview(),
      api.reports.campaigns(),
      api.reports.messaging({ granularity: 'day' })
    ]);
    
    return {
      overview,
      campaigns,
      messaging
    };
  } catch (error) {
    console.error('Failed to load dashboard:', error);
    throw error;
  }
}
```

## Next Steps

1. Review the [API Reference](../docs/API_REFERENCE.md) for endpoint details
2. Check the [Frontend Integration Guide](../docs/FRONTEND_INTEGRATION_GUIDE.md) for implementation
3. See the [Security Surface](../docs/SECURITY_SURFACE.md) for authentication requirements
4. Use the [Templates Catalog](../docs/TEMPLATES_CATALOG.md) for template variables
