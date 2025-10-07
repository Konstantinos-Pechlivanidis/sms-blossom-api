// scripts/enqueueSmoke.js
// Smoke test script for queue system

import { enqueueJob } from '../src/queue/queues.js';
import { logger } from '../src/lib/logger.js';

/**
 * Enqueue sample jobs for manual verification
 */
async function enqueueSmokeTest() {
  logger.info('Starting queue smoke test...');

  // Check if Redis is configured
  const queueDriver = process.env.QUEUE_DRIVER || 'memory';
  if (queueDriver !== 'redis') {
    logger.warn({ queueDriver }, 'Queue driver is not Redis - BullMQ workers not available');
    logger.info('Smoke test skipped - Redis not configured');
    return;
  }

  try {
    // Test events queue
    await enqueueJob('events', 'orders/paid', {
      topic: 'orders/paid',
      shopId: 'test-shop.myshopify.com',
      objectId: 'gid://shopify/Order/123456789',
      raw: {
        id: 123456789,
        order_number: '#1001',
        total_price: '99.99',
        currency: 'USD',
        customer: {
          first_name: 'John',
          last_name: 'Doe',
          email: 'john@example.com',
          phone: '+1234567890',
        },
        shop_name: 'Test Store',
      },
      requestId: 'smoke_test_events',
    });

    // Test automations queue
    await enqueueJob('automations', 'evaluate', {
      trigger: 'orders/paid',
      shopId: 'test-shop.myshopify.com',
      context: {
        order_number: '#1001',
        order_total: '99.99',
        currency: 'USD',
        customer_name: 'John Doe',
        customer_phone: '+1234567890',
        customer_email: 'john@example.com',
        shop_name: 'Test Store',
      },
      requestId: 'smoke_test_automations',
    });

    // Test campaigns queue
    await enqueueJob('campaigns', 'batch', {
      campaignId: 'test-campaign-123',
      shopId: 'test-shop.myshopify.com',
      batchSize: 10,
      requestId: 'smoke_test_campaigns',
    });

    // Test delivery queue
    await enqueueJob('delivery', 'send', {
      shopId: 'test-shop.myshopify.com',
      recipient: '+1234567890',
      template: 'Hello {{ customer_name }}, your order {{ order_number }} is ready!',
      context: {
        customer_name: 'John Doe',
        order_number: '#1001',
      },
      requestId: 'smoke_test_delivery',
    });

    // Test housekeeping queue
    await enqueueJob('housekeeping', 'cleanup', {
      task: 'cleanup_old_messages',
      shopId: 'test-shop.myshopify.com',
      requestId: 'smoke_test_housekeeping',
    });

    logger.info('✅ All smoke test jobs enqueued successfully');

    // Wait a moment for processing
    await new Promise((resolve) => setTimeout(resolve, 2000));

    logger.info('Smoke test completed');
  } catch (error) {
    logger.error({ error }, '❌ Smoke test failed');
    process.exit(1);
  }
}

// Run smoke test
enqueueSmokeTest()
  .then(() => {
    logger.info('Smoke test script completed');
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ error }, 'Smoke test script failed');
    process.exit(1);
  });
