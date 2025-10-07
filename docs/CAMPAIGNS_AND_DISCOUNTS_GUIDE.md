# Campaigns and Discounts Guide

This guide covers SMS campaign management, discount code creation, and the integration between campaigns and Shopify's discount system.

## Campaign Lifecycle

### Campaign States

| State       | Description                           | Actions Available       |
| ----------- | ------------------------------------- | ----------------------- |
| `draft`     | Campaign created but not scheduled    | Edit, Schedule, Delete  |
| `scheduled` | Campaign scheduled for future sending | Edit, Cancel, Send Now  |
| `sending`   | Campaign is currently being sent      | Pause, Monitor          |
| `paused`    | Campaign sending is paused            | Resume, Cancel          |
| `completed` | Campaign has finished sending         | View Results, Duplicate |
| `failed`    | Campaign failed to send               | Retry, Edit, Delete     |

### Campaign Creation Flow

```
1. Create Campaign → 2. Set Audience → 3. Write Template → 4. Attach Discount → 5. Schedule → 6. Send
```

## Campaign Management

### Creating Campaigns

#### Basic Campaign

```typescript
const campaign = await api.campaigns.create({
  name: 'Welcome Campaign',
  template: 'Welcome {{customer_name}}! Use code {{discount_code}} for 10% off!',
  audience: {
    segment: 'all',
  },
  scheduled_at: '2024-01-16T10:00:00Z',
});
```

#### Campaign with Discount

```typescript
const campaign = await api.campaigns.create({
  name: 'Flash Sale Campaign',
  template: 'Flash sale! Use code {{discount_code}} for {{discount_value}} off!',
  audience: {
    segment: 'vip_customers',
  },
  discount_id: 'disc_123',
  scheduled_at: '2024-01-16T10:00:00Z',
});
```

#### Campaign with UTM Tracking

```typescript
const campaign = await api.campaigns.create({
  name: 'Product Launch',
  template: 'New product launched! Check it out: {{product_url}}',
  audience: {
    segment: 'product_interest',
  },
  utm: {
    utm_source: 'sms',
    utm_medium: 'campaign',
    utm_campaign: 'product_launch',
  },
});
```

### Campaign Audience

#### Segment-Based Audience

```typescript
const audience = {
  segment: 'vip_customers',
  count: 1250,
};
```

#### Custom Filter Audience

```typescript
const audience = {
  filter: {
    and: [
      {
        field: 'sms_consent_state',
        operator: 'equals',
        value: 'opted_in',
      },
      {
        field: 'created_at',
        operator: 'gte',
        value: '2024-01-01T00:00:00Z',
      },
    ],
  },
  count: 850,
};
```

### Campaign Estimation

#### Estimate Campaign Cost

```typescript
const estimate = await api.campaigns.estimate('camp_123');

console.log(estimate);
// {
//   audience_count: 1250,
//   estimated_cost: 12.50,
//   currency: "USD",
//   segments: 1,
//   warnings: []
// }
```

#### Test Send Campaign

```typescript
const testResult = await api.campaigns.testSend('camp_123', {
  phone: '+1234567890',
  variables: {
    customer_name: 'John Doe',
    discount_code: 'WELCOME10',
  },
});

console.log(testResult);
// {
//   success: true,
//   message_id: "msg_123",
//   phone: "+1234567890",
//   rendered: "Welcome John Doe! Use code WELCOME10 for 10% off!"
// }
```

### Campaign Scheduling

#### Immediate Send

```typescript
const campaign = await api.campaigns.create({
  name: 'Urgent Sale',
  template: 'Last chance! Sale ends in 2 hours!',
  audience: { segment: 'all' },
  // No scheduled_at = immediate send
});
```

#### Scheduled Send

```typescript
const campaign = await api.campaigns.create({
  name: 'Morning Sale',
  template: "Good morning! Today's special: {{discount_code}}",
  audience: { segment: 'all' },
  scheduled_at: '2024-01-16T09:00:00Z',
});
```

#### Timezone-Aware Scheduling

```typescript
const campaign = await api.campaigns.create({
  name: 'Local Time Sale',
  template: 'Sale starts now!',
  audience: { segment: 'all' },
  scheduled_at: '2024-01-16T09:00:00-05:00', // EST timezone
  timezone: 'America/New_York',
});
```

## Discount Management

### Creating Discounts

#### Percentage Discount

```typescript
const discount = await api.discounts.create({
  code: 'WELCOME10',
  title: 'Welcome Discount',
  type: 'percentage',
  value: 10,
  currency_code: 'USD',
  starts_at: '2024-01-15T00:00:00Z',
  ends_at: '2024-01-31T23:59:59Z',
  usage_limit: 100,
  once_per_customer: true,
});
```

#### Fixed Amount Discount

```typescript
const discount = await api.discounts.create({
  code: 'SAVE20',
  title: 'Save $20',
  type: 'amount',
  value: 20,
  currency_code: 'USD',
  minimum_amount: 100,
  usage_limit: 50,
});
```

#### Free Shipping Discount

```typescript
const discount = await api.discounts.create({
  code: 'FREESHIP',
  title: 'Free Shipping',
  type: 'shipping',
  value: 0,
  minimum_amount: 50,
});
```

### Discount Validation

#### Check for Conflicts

```typescript
const conflicts = await api.discounts.checkConflicts({
  code: 'WELCOME10',
});

console.log(conflicts);
// {
//   conflicts: false,
//   existing_discount: null
// }
```

#### Validate Discount Code

```typescript
const validation = await api.discounts.validate({
  code: 'WELCOME10',
  shop_domain: 'shop.myshopify.com',
});

console.log(validation);
// {
//   valid: true,
//   discount: {
//     code: "WELCOME10",
//     type: "percentage",
//     value: 10,
//     active: true
//   }
// }
```

### Discount Apply URLs

#### Generate Apply URL

```typescript
const applyUrl = await api.discounts.getApplyUrl('disc_123');

console.log(applyUrl);
// {
//   apply_url: "https://shop.myshopify.com/discount/WELCOME10",
//   utm_params: {
//     utm_source: "sms_blossom",
//     utm_medium: "sms",
//     utm_campaign: "welcome"
//   }
// }
```

#### Custom UTM Parameters

```typescript
const applyUrl = await api.discounts.getApplyUrl('disc_123', {
  utm_source: 'sms',
  utm_medium: 'campaign',
  utm_campaign: 'flash_sale',
  utm_content: 'discount_code',
});
```

## Campaign-Discount Integration

### Attaching Discounts to Campaigns

#### Link Discount to Campaign

```typescript
const result = await api.campaigns.attachDiscount('camp_123', 'disc_123');

console.log(result);
// {
//   success: true,
//   campaign_id: "camp_123",
//   discount_id: "disc_123",
//   apply_url: "https://shop.myshopify.com/discount/WELCOME10"
// }
```

#### Set Campaign UTM Parameters

```typescript
const result = await api.campaigns.setUtm('camp_123', {
  utm_source: 'sms',
  utm_medium: 'campaign',
  utm_campaign: 'welcome_series',
  utm_content: 'discount_offer',
});
```

### Campaign Apply URLs

#### Get Campaign Apply URL

```typescript
const applyUrl = await api.campaigns.getApplyUrl('camp_123');

console.log(applyUrl);
// {
//   apply_url: "https://shop.myshopify.com/discount/WELCOME10?utm_source=sms&utm_medium=campaign",
//   utm_params: {
//     utm_source: "sms",
//     utm_medium: "campaign",
//     utm_campaign: "welcome_series"
//   }
// }
```

## Audience Snapshot

### Snapshot Campaign Audience

```typescript
const snapshot = await api.campaigns.snapshotAudience('camp_123');

console.log(snapshot);
// {
//   audience_count: 1250,
//   segment_breakdown: {
//     "vip_customers": 500,
//     "new_customers": 750
//   },
//   snapshot_date: "2024-01-15T10:30:00Z"
// }
```

### Audience Materialization

The audience snapshot process:

1. **Segment Evaluation**: Evaluate segment filters against all contacts
2. **Consent Filtering**: Filter out contacts without SMS consent
3. **Deduplication**: Remove duplicate contacts
4. **Batch Creation**: Create audience batches for queue processing
5. **Queue Jobs**: Enqueue individual contact jobs for delivery

## Campaign Metrics

### Campaign Performance

```typescript
const metrics = await api.campaigns.getMetrics('camp_123');

console.log(metrics);
// {
//   campaign_id: "camp_123",
//   status: "completed",
//   sent: 1250,
//   delivered: 1180,
//   failed: 70,
//   delivery_rate: 94.4,
//   cost: 12.50,
//   currency: "USD",
//   started_at: "2024-01-15T10:00:00Z",
//   completed_at: "2024-01-15T10:30:00Z"
// }
```

### Real-time Campaign Status

```typescript
const status = await api.campaigns.getStatus('camp_123');

console.log(status);
// {
//   campaign_id: "camp_123",
//   status: "sending",
//   progress: {
//     total: 1250,
//     sent: 750,
//     remaining: 500,
//     percentage: 60
//   },
//   estimated_completion: "2024-01-15T10:45:00Z"
// }
```

## Campaign Templates

### Template Variables

Campaign templates support all trigger variables plus campaign-specific variables:

#### Campaign-Specific Variables

| Variable         | Description           | Example                                         |
| ---------------- | --------------------- | ----------------------------------------------- |
| `campaign_name`  | Campaign name         | "Welcome Campaign"                              |
| `discount_code`  | Discount code         | "WELCOME10"                                     |
| `discount_value` | Discount value        | "10%" or "$10"                                  |
| `apply_url`      | Discount apply URL    | "https://shop.myshopify.com/discount/WELCOME10" |
| `campaign_url`   | Campaign-specific URL | "https://shop.myshopify.com/campaign/welcome"   |

#### Template Examples

```liquid
<!-- Welcome Campaign -->
Welcome to {{shop_name}}, {{customer_name}}!

Use code {{discount_code}} for {{discount_value}} off your first order.
Shop now: {{apply_url | shortlink}}

{{shop_name}}

<!-- Flash Sale Campaign -->
⚡ FLASH SALE ⚡

{{product_name}} is now {{discount_value}} off!
Use code {{discount_code}} at checkout.

Shop now: {{apply_url | shortlink}}

{{shop_name}}

<!-- Abandoned Cart Campaign -->
Hi {{customer_name}}!

You left items in your cart worth {{cart_total | money: currency}}.
Complete your purchase: {{recovery_url | shortlink}}

Use code {{discount_code}} for {{discount_value}} off!

{{shop_name}}
```

## Campaign Batching

### Batch Processing

Campaigns are processed in batches to manage load and ensure delivery:

#### Batch Configuration

```typescript
const campaign = await api.campaigns.create({
  name: 'Large Campaign',
  template: 'Special offer for you!',
  audience: { segment: 'all' },
  batch_size: 100, // Process 100 contacts per batch
  batch_delay: 30, // 30 seconds between batches
});
```

#### Batch Status

```typescript
const batches = await api.campaigns.getBatches('camp_123');

console.log(batches);
// {
//   campaign_id: "camp_123",
//   total_batches: 13,
//   completed_batches: 8,
//   processing_batches: 2,
//   pending_batches: 3,
//   batch_size: 100
// }
```

## Error Handling

### Campaign Errors

| Error                        | Description                | Resolution             |
| ---------------------------- | -------------------------- | ---------------------- |
| `invalid_segment`            | Segment not found          | Check segment ID       |
| `invalid_discount`           | Discount not found         | Check discount ID      |
| `insufficient_audience`      | No contacts in audience    | Adjust segment filters |
| `template_validation_failed` | Template has errors        | Fix template syntax    |
| `scheduling_conflict`        | Campaign already scheduled | Choose different time  |

### Discount Errors

| Error                      | Description                      | Resolution              |
| -------------------------- | -------------------------------- | ----------------------- |
| `code_already_exists`      | Discount code exists             | Choose different code   |
| `invalid_shopify_discount` | Shopify discount creation failed | Check Shopify API       |
| `insufficient_permissions` | No discount creation permissions | Check Shopify scopes    |
| `validation_failed`        | Discount validation failed       | Fix discount parameters |

## Best Practices

### Campaign Design

1. **Keep Messages Short**: Aim for single SMS (160 characters)
2. **Clear Call-to-Action**: Use action words like "Shop now", "Get discount"
3. **Personalization**: Use customer name and relevant data
4. **Urgency**: Create time-sensitive offers
5. **Testing**: Always test send before launching

### Discount Strategy

1. **Unique Codes**: Use unique, memorable discount codes
2. **Appropriate Value**: Set discount values that drive sales
3. **Time Limits**: Set expiration dates for urgency
4. **Usage Limits**: Control discount usage
5. **UTM Tracking**: Track campaign effectiveness

### Audience Targeting

1. **Segment Carefully**: Target relevant customer segments
2. **Consent Compliance**: Only target opted-in customers
3. **Frequency Capping**: Respect message frequency limits
4. **Quiet Hours**: Avoid sending during quiet hours
5. **Testing**: Test with small audiences first

## API Examples

### Complete Campaign Flow

```typescript
// 1. Create discount
const discount = await api.discounts.create({
  code: 'WELCOME10',
  title: 'Welcome Discount',
  type: 'percentage',
  value: 10,
  currency_code: 'USD',
  usage_limit: 100,
});

// 2. Create campaign
const campaign = await api.campaigns.create({
  name: 'Welcome Campaign',
  template: 'Welcome {{customer_name}}! Use code {{discount_code}} for {{discount_value}} off!',
  audience: { segment: 'new_customers' },
  discount_id: discount.id,
});

// 3. Attach discount
await api.campaigns.attachDiscount(campaign.id, discount.id);

// 4. Estimate campaign
const estimate = await api.campaigns.estimate(campaign.id);

// 5. Test send
await api.campaigns.testSend(campaign.id, {
  phone: '+1234567890',
  variables: { customer_name: 'John Doe' },
});

// 6. Send campaign
await api.campaigns.send(campaign.id);
```

### Campaign Monitoring

```typescript
// Monitor campaign progress
const status = await api.campaigns.getStatus(campaign.id);

if (status.status === 'sending') {
  console.log(`Progress: ${status.progress.percentage}%`);
  console.log(`Remaining: ${status.progress.remaining} contacts`);
}

// Get final metrics
const metrics = await api.campaigns.getMetrics(campaign.id);
console.log(`Delivery rate: ${metrics.delivery_rate}%`);
console.log(`Total cost: ${metrics.cost} ${metrics.currency}`);
```

## Next Steps

1. Review [API Reference](./API_REFERENCE.md) for endpoint details
2. Check [Templates Catalog](./TEMPLATES_CATALOG.md) for template variables
3. See [Reports Guide](./REPORTS_AND_CACHE.md) for campaign analytics
4. Use [TypeScript SDK](../sdk/index.ts) for type-safe campaign operations
