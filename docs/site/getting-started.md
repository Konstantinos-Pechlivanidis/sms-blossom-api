# Getting Started with SMS Blossom API

This guide will help you get up and running with the SMS Blossom API quickly.

## Prerequisites

- Node.js 18+ or Python 3.8+
- A Shopify store (development or production)
- Basic understanding of REST APIs and webhooks

## 1. Authentication Setup

### OAuth Flow

The SMS Blossom API uses Shopify OAuth for authentication. Here's how to set it up:

#### Step 1: Install the App

```bash
# Replace with your shop domain
curl "https://api.sms-blossom.com/auth/install?shop=your-store.myshopify.com"
```

#### Step 2: Handle OAuth Callback

The OAuth callback will return a JWT token that you'll use for API requests:

```typescript
// Example callback handler
app.get('/auth/callback', async (req, res) => {
  const { code, shop, state } = req.query;
  
  // Exchange code for token
  const response = await fetch(`https://api.sms-blossom.com/auth/callback?code=${code}&shop=${shop}`);
  const { token } = await response.json();
  
  // Store token securely
  // Use token for subsequent API requests
});
```

### JWT Token Usage

Once you have a JWT token, include it in the `Authorization` header:

```typescript
const headers = {
  'Authorization': `Bearer ${jwtToken}`,
  'Content-Type': 'application/json'
};
```

## 2. Basic API Usage

### Health Check

Always start by checking the API health:

```typescript
const response = await fetch('https://api.sms-blossom.com/health');
const health = await response.json();

console.log('API Health:', health.ok);
console.log('Database:', health.db.ok);
console.log('Redis:', health.redis.ok);
```

### Create Your First Campaign

```typescript
const campaign = await fetch('https://api.sms-blossom.com/campaigns?shop=your-store.myshopify.com', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Welcome Series',
    template: 'Welcome {{ customer.first_name }}! Use code WELCOME10 for 10% off.',
    segmentId: 'seg_123', // You'll create this next
    scheduleAt: '2024-01-20T09:00:00Z'
  })
});

const result = await campaign.json();
console.log('Campaign created:', result.id);
```

## 3. Customer Segmentation

### Create a Segment

Before creating campaigns, you'll need to define your audience:

```typescript
const segment = await fetch('https://api.sms-blossom.com/segments?shop=your-store.myshopify.com', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'VIP Customers',
    filterJson: {
      and: [
        { consent: 'opted_in' },
        { tags: { has: 'vip' } }
      ]
    }
  })
});

const segmentResult = await segment.json();
console.log('Segment created:', segmentResult.id);
```

### Preview Segment

Always preview your segments to ensure they target the right audience:

```typescript
const preview = await fetch('https://api.sms-blossom.com/segments/preview?shop=your-store.myshopify.com', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    filterJson: {
      and: [
        { consent: 'opted_in' },
        { tags: { has: 'vip' } }
      ]
    }
  })
});

const previewResult = await preview.json();
console.log('Estimated recipients:', previewResult.estimatedCount);
```

## 4. Template Management

### Create SMS Templates

SMS templates use LiquidJS syntax for dynamic content:

```typescript
const template = await fetch('https://api.sms-blossom.com/templates?shop=your-store.myshopify.com', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Abandoned Checkout Recovery',
    trigger: 'abandoned_checkout',
    body: 'Hi {{ customer.first_name }}, complete your order: {{ recovery_url }}'
  })
});

const templateResult = await template.json();
console.log('Template created:', templateResult.id);
```

### Preview Templates

Always preview your templates to ensure they render correctly:

```typescript
const preview = await fetch('https://api.sms-blossom.com/templates/preview', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    body: 'Hi {{ customer.first_name }}, your order {{ order.number }} is ready!',
    variables: {
      customer: { first_name: 'John' },
      order: { number: '1001' }
    }
  })
});

const previewResult = await preview.json();
console.log('Rendered text:', previewResult.text);
console.log('SMS parts:', previewResult.segments.parts);
```

### Validate Templates

Ensure your templates have all required variables:

```typescript
const validation = await fetch('https://api.sms-blossom.com/templates/validate', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    body: 'Hi {{ customer.first_name }}, complete your order: {{ recovery_url }}',
    trigger: 'abandoned_checkout'
  })
});

const validationResult = await validation.json();
console.log('Template valid:', validationResult.ok);
console.log('Errors:', validationResult.errors);
```

## 5. Discount Integration

### Create Discount Codes

Link discounts to your campaigns for better conversion:

```typescript
const discount = await fetch('https://api.sms-blossom.com/discounts?shop=your-store.myshopify.com', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    code: 'SAVE20',
    title: '20% Off Everything',
    type: 'percentage',
    value: 20,
    startsAt: '2024-01-01T00:00:00Z',
    endsAt: '2024-01-31T23:59:59Z',
    usageLimit: 1000,
    oncePerCustomer: true
  })
});

const discountResult = await discount.json();
console.log('Discount created:', discountResult.id);
```

### Check for Conflicts

Before creating discounts, check for potential conflicts:

```typescript
const conflicts = await fetch('https://api.sms-blossom.com/discounts/conflicts?shop=your-store.myshopify.com', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    code: 'SAVE20'
  })
});

const conflictResult = await conflicts.json();
console.log('Has conflicts:', conflictResult.hasConflicts);
console.log('Conflicts:', conflictResult.conflicts);
```

## 6. Campaign Management

### Estimate Campaign

Before sending, estimate your campaign reach and cost:

```typescript
const estimate = await fetch('https://api.sms-blossom.com/campaigns/camp_123/estimate?shop=your-store.myshopify.com', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`
  }
});

const estimateResult = await estimate.json();
console.log('Estimated recipients:', estimateResult.estimatedRecipients);
console.log('Estimated cost:', estimateResult.estimatedCost);
```

### Test Send Campaign

Always test your campaigns before sending to your full audience:

```typescript
const testSend = await fetch('https://api.sms-blossom.com/campaigns/camp_123/test?shop=your-store.myshopify.com', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    phone: '+1234567890',
    variables: {
      customer: { first_name: 'John' },
      discount_code: 'SAVE20'
    }
  })
});

const testResult = await testSend.json();
console.log('Test sent:', testResult.success);
console.log('Message ID:', testResult.messageId);
```

### Send Campaign

Once you're satisfied with your campaign, send it to your audience:

```typescript
const sendCampaign = await fetch('https://api.sms-blossom.com/campaigns/camp_123/send?shop=your-store.myshopify.com', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`
  }
});

const sendResult = await sendCampaign.json();
console.log('Campaign sending:', sendResult.success);
console.log('Estimated recipients:', sendResult.estimatedRecipients);
```

## 7. Webhook Integration

### Shopify Webhooks

Set up webhooks to automatically trigger campaigns based on Shopify events:

```typescript
// Example webhook handler for orders/create
app.post('/webhooks/shopify/orders/create', async (req, res) => {
  // Verify HMAC signature
  const hmac = req.get('X-Shopify-Hmac-Sha256');
  const isValid = verifyShopifyHmac(req.body, hmac, process.env.WEBHOOK_HMAC_SECRET);
  
  if (!isValid) {
    return res.status(401).send('Invalid HMAC');
  }
  
  // Process order data
  const order = req.body;
  console.log('New order:', order.id);
  
  // Trigger welcome campaign if needed
  // This would be handled by your automation rules
  
  res.status(200).send('OK');
});
```

### Mitto Webhooks

Handle SMS delivery receipts and inbound messages:

```typescript
// DLR webhook handler
app.post('/webhooks/mitto/dlr', async (req, res) => {
  const { messageId, status, timestamp } = req.body;
  
  console.log(`Message ${messageId} status: ${status}`);
  
  // Update message status in your database
  // Trigger follow-up actions if needed
  
  res.status(200).send('OK');
});

// Inbound SMS handler
app.post('/webhooks/mitto/inbound', async (req, res) => {
  const { phone, message, timestamp } = req.body;
  
  if (message.toUpperCase() === 'STOP') {
    // Handle unsubscribe
    console.log(`Unsubscribe request from ${phone}`);
  }
  
  res.status(200).send('OK');
});
```

## 8. Analytics & Reporting

### Get Overview Report

Monitor your SMS marketing performance:

```typescript
const report = await fetch('https://api.sms-blossom.com/reports/overview?shop=your-store.myshopify.com&period=30d', {
  headers: {
    'Authorization': `Bearer ${jwtToken}`
  }
});

const reportData = await report.json();
console.log('Total messages:', reportData.totalMessages);
console.log('Delivery rate:', (reportData.deliveredMessages / reportData.totalMessages * 100).toFixed(1) + '%');
console.log('Revenue:', reportData.revenue);
```

### Get Messaging Report

Detailed messaging analytics:

```typescript
const messagingReport = await fetch('https://api.sms-blossom.com/reports/messaging?shop=your-store.myshopify.com&period=30d&groupBy=day', {
  headers: {
    'Authorization': `Bearer ${jwtToken}`
  }
});

const messagingData = await messagingReport.json();
console.log('Daily breakdown:', messagingData.timeseries);
console.log('Summary:', messagingData.summary);
```

## 9. Error Handling

### Handle API Errors

Always implement proper error handling:

```typescript
async function makeApiRequest(url, options) {
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`API Error ${response.status}: ${error.message}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('API Request failed:', error.message);
    throw error;
  }
}

// Usage
try {
  const campaign = await makeApiRequest('https://api.sms-blossom.com/campaigns?shop=your-store.myshopify.com', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${jwtToken}` },
    body: JSON.stringify(campaignData)
  });
} catch (error) {
  console.error('Failed to create campaign:', error.message);
}
```

### Rate Limiting

Handle rate limiting gracefully:

```typescript
async function makeApiRequestWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        // Rate limited, wait and retry
        const retryAfter = response.headers.get('Retry-After') || Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        continue;
      }
      
      if (!response.ok) {
        throw new Error(`API Error ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
}
```

## 10. Best Practices

### Security
- Always verify HMAC signatures for webhooks
- Store JWT tokens securely
- Use HTTPS for all API requests
- Implement proper error handling

### Performance
- Use pagination for large data sets
- Cache frequently accessed data
- Implement retry logic for failed requests
- Monitor rate limits

### User Experience
- Always test campaigns before sending
- Preview templates with real data
- Estimate campaign reach and cost
- Provide clear error messages

### Compliance
- Respect customer consent (opt-in/opt-out)
- Follow GDPR requirements
- Implement proper data retention
- Log all consent changes

## Next Steps

1. **Explore the API**: Use the [Postman collection](../postman/SMS_Blossom_API.postman_collection.json) to test endpoints
2. **Read the Documentation**: Check the [complete API reference](../openapi/openapi.yaml)
3. **Use the SDK**: Integrate with the [TypeScript SDK](../generated/sdk/ts/README.md)
4. **Set up Webhooks**: Configure webhook endpoints for real-time processing
5. **Monitor Performance**: Use the analytics endpoints to track your SMS marketing success

## Support

- **Documentation**: [https://docs.sms-blossom.com](https://docs.sms-blossom.com)
- **Support Email**: support@sms-blossom.com
- **GitHub Issues**: [https://github.com/sms-blossom/api/issues](https://github.com/sms-blossom/api/issues)

Happy coding! 🚀
