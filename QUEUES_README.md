# BullMQ Queue System Documentation

## Overview

The SMS Blossom queue system is built on BullMQ with Redis as the message broker. It provides a robust, scalable foundation for processing Shopify events, automation evaluation, campaign delivery, and housekeeping tasks.

## Architecture

### Queue Topology

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Shopify       │    │     Events       │    │  Automations    │
│   Webhooks      │───▶│     Queue        │───▶│     Queue       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                                                         ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Campaigns     │    │    Delivery      │    │  Housekeeping   │
│     Queue       │───▶│     Queue        │    │     Queue       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Queue Definitions

#### 1. Events Queue (`events`)

- **Purpose**: Process incoming Shopify webhook events
- **Processors**: `events:{topic}` (orders/paid, orders/create, checkouts/update, etc.)
- **Flow**: Normalizes event data and forwards to automations queue
- **Data**: `{ topic, shopId, objectId, raw, requestId }`

#### 2. Automations Queue (`automations`)

- **Purpose**: Evaluate automation rules and trigger delivery
- **Processors**: `automations:evaluate`
- **Flow**: Checks consent, quiet hours, frequency caps, and custom rules
- **Data**: `{ trigger, shopId, context, originalEvent, requestId }`

#### 3. Campaigns Queue (`campaigns`)

- **Purpose**: Batch process campaign audiences
- **Processors**: `campaigns:batch`
- **Flow**: Materializes audience segments and enqueues delivery jobs
- **Data**: `{ campaignId, shopId, batchSize, requestId }`

#### 4. Delivery Queue (`delivery`)

- **Purpose**: Send messages via SMS provider
- **Processors**: `delivery:send`
- **Flow**: Renders templates and sends via Mitto (Sprint 5)
- **Data**: `{ shopId, recipient, template, context, requestId }`

#### 5. Housekeeping Queue (`housekeeping`)

- **Purpose**: Maintenance and cleanup tasks
- **Processors**: `housekeeping:repeat`
- **Flow**: Scheduled cleanup, retries, and report rollups
- **Data**: `{ task, shopId, requestId }`

## Redis Configuration

### Connection Factory

```javascript
import { getRedisConnection } from './src/queue/queues.js';

const redis = getRedisConnection();
```

### Environment Variables

- `REDIS_URL`: Redis connection string (default: `redis://localhost:6379`)
- `REDIS_PREFIX`: Key prefix (default: `smsblossom:dev`)

### Health Checks

```javascript
import { checkRedisHealth } from './src/queue/queues.js';

const isHealthy = await checkRedisHealth();
```

## Processors

### Events Processor

```javascript
// src/queue/processors/events.js
export async function processEvent(job) {
  const { topic, shopId, objectId, raw } = job.data;

  // Normalize event context
  const context = normalizeEventContext(topic, raw, shopId);

  // Forward to automations queue
  await enqueueJob('automations', 'evaluate', {
    trigger: topic,
    shopId,
    context,
    requestId: job.data.requestId,
  });
}
```

### Automations Processor

```javascript
// src/queue/processors/automations.js
export async function evaluateAutomation(job) {
  const { trigger, shopId, context } = job.data;

  // Get active automations
  const automations = await getActiveAutomations(shopId, trigger);

  // Evaluate each automation
  for (const automation of automations) {
    if (await shouldTrigger(automation, context)) {
      await enqueueJob('delivery', 'send', {
        automationId: automation.id,
        shopId,
        template: automation.template,
        context,
        requestId: job.data.requestId,
      });
    }
  }
}
```

### Campaigns Processor

```javascript
// src/queue/processors/campaigns.js
export async function processCampaignBatch(job) {
  const { campaignId, shopId, batchSize } = job.data;

  // Get campaign and segment
  const campaign = await getCampaign(campaignId);
  const audience = await getAudience(campaign.segment, batchSize);

  // Enqueue delivery jobs
  for (const contact of audience) {
    await enqueueJob('delivery', 'send', {
      campaignId,
      shopId,
      contactId: contact.id,
      template: campaign.template,
      context: buildContext(contact),
    });
  }
}
```

### Delivery Processor

```javascript
// src/queue/processors/delivery.js
export async function processDelivery(job) {
  const { shopId, recipient, template, context } = job.data;

  // Render template
  const renderResult = await renderTemplate({
    body: template,
    vars: context,
  });

  // Create message record
  const message = await createMessage({
    shopId,
    body: renderResult.text,
    recipient,
    status: 'queued',
  });

  // TODO: Send via Mitto in Sprint 5
  logger.info('Message queued for delivery (placeholder)');
}
```

### Housekeeping Processor

```javascript
// src/queue/processors/housekeeping.js
export async function processHousekeeping(job) {
  const { task, shopId } = job.data;

  switch (task) {
    case 'cleanup_old_messages':
      await cleanupOldMessages(shopId);
      break;
    case 'retry_failed_messages':
      await retryFailedMessages(shopId);
      break;
    case 'rollup_reports':
      await rollupReports(shopId);
      break;
  }
}
```

## Job Configuration

### Default Options

```javascript
{
  removeOnComplete: 100,
  removeOnFail: 50,
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
}
```

### Job Data Structure

```javascript
{
  // Standard fields
  requestId: 'req_1234567890_abc123',
  enqueuedAt: '2024-01-15T10:30:00Z',

  // Business fields
  shopId: 'shop.myshopify.com',
  trigger: 'orders/paid',
  context: { /* event context */ },

  // Request tracing
  xRequestId: 'req_1234567890_abc123',
}
```

## Error Handling

### Exponential Backoff

- **Attempts**: 5 maximum
- **Backoff**: Exponential with 2s base delay
- **Dead Letter**: Failed jobs moved to DLQ after max attempts

### Error Logging

```javascript
worker.on('failed', (job, error) => {
  logger.error(
    {
      jobId: job.id,
      queue: queueName,
      error: error.message,
      requestId: job.data?.requestId,
      shopId: job.data?.shopId,
    },
    'Job failed',
  );
});
```

## Observability

### Health Endpoints

- `GET /queue/health` - Redis and worker status
- `GET /queue/metrics` - Queue depth and processing stats

### Metrics

```javascript
{
  redis: true,
  workers: {
    workerCount: 5,
    workers: [
      { name: 'events', isRunning: true },
      { name: 'automations', isRunning: true },
      // ...
    ]
  },
  queues: {
    events: { waiting: 0, active: 2, completed: 150, failed: 1 },
    automations: { waiting: 1, active: 1, completed: 75, failed: 0 },
    // ...
  }
}
```

### Logging

```javascript
// Job lifecycle logging
logger.info(
  {
    jobId: job.id,
    queue: queueName,
    duration: Date.now() - job.timestamp,
    requestId: job.data?.requestId,
    shopId: job.data?.shopId,
  },
  'Job completed',
);
```

## Usage Examples

### Enqueue Event

```javascript
import { enqueueJob } from './src/queue/queues.js';

await enqueueJob('events', 'orders/paid', {
  topic: 'orders/paid',
  shopId: 'shop.myshopify.com',
  objectId: 'gid://shopify/Order/123456789',
  raw: {
    /* Shopify order data */
  },
  requestId: 'req_123',
});
```

### Enqueue Campaign

```javascript
await enqueueJob('campaigns', 'batch', {
  campaignId: 'campaign-123',
  shopId: 'shop.myshopify.com',
  batchSize: 100,
  requestId: 'req_456',
});
```

### Enqueue Housekeeping

```javascript
await enqueueJob('housekeeping', 'cleanup', {
  task: 'cleanup_old_messages',
  shopId: 'shop.myshopify.com',
  requestId: 'req_789',
});
```

## Testing

### Smoke Test

```bash
node scripts/enqueueSmoke.js
```

### Manual Verification

1. Start Redis server
2. Start workers: `node src/queue/worker.js`
3. Run smoke test: `node scripts/enqueueSmoke.js`
4. Check logs for job lifecycle
5. Verify queue health: `GET /queue/health`

## Deployment

### Production Considerations

- **Redis**: Use managed Redis service (AWS ElastiCache, Redis Cloud)
- **Monitoring**: Set up alerts for queue depth and failure rates
- **Scaling**: Adjust worker concurrency based on load
- **Persistence**: Configure Redis persistence for durability

### Environment Variables

```bash
REDIS_URL=redis://user:pass@redis.example.com:6379
REDIS_PREFIX=smsblossom:prod
```

## Troubleshooting

### Common Issues

1. **Redis Connection**: Check `REDIS_URL` and network connectivity
2. **Job Failures**: Check logs for error details and retry logic
3. **Queue Depth**: Monitor queue metrics and scale workers
4. **Memory Usage**: Configure job retention limits

### Debug Commands

```bash
# Check Redis connection
redis-cli ping

# Monitor queue activity
redis-cli monitor

# Check queue metrics
curl http://localhost:3000/queue/health
```
