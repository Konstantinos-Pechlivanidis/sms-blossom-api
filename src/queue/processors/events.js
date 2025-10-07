// src/queue/processors/events.js
// Shopify events processor

import { logger } from '../../lib/logger.js';
import { enqueueJob } from '../queues.js';

/**
 * Process Shopify events and forward to automations queue
 * @param {Object} job - BullMQ job
 * @returns {Promise<void>}
 */
export async function processEvent(job) {
  const { data } = job;
  const { topic, shopId, objectId, raw, requestId } = data;

  logger.info(
    {
      jobId: job.id,
      topic,
      shopId,
      objectId,
      requestId,
    },
    'Processing Shopify event',
  );

  try {
    // Normalize event context based on topic
    const context = normalizeEventContext(topic, raw, shopId);

    if (!context) {
      logger.warn({ topic, shopId, objectId }, 'No context generated for event, skipping');
      return;
    }

    // Forward to automations queue for evaluation
    await enqueueJob('automations', 'evaluate', {
      trigger: topic,
      shopId,
      context,
      originalEvent: {
        topic,
        objectId,
        raw,
      },
      requestId,
    });

    logger.info(
      {
        jobId: job.id,
        topic,
        shopId,
        context: Object.keys(context),
        requestId,
      },
      'Event forwarded to automations queue',
    );
  } catch (error) {
    logger.error(
      {
        error: error.message,
        jobId: job.id,
        topic,
        shopId,
        requestId,
      },
      'Failed to process event',
    );
    throw error;
  }
}

/**
 * Normalize event context based on topic
 * @param {string} topic - Event topic
 * @param {Object} raw - Raw event data
 * @param {string} shopId - Shop ID
 * @returns {Object|null} Normalized context
 */
function normalizeEventContext(topic, raw, shopId) {
  try {
    switch (topic) {
      case 'orders/paid':
        return {
          order_number: raw.order_number,
          order_total: raw.total_price,
          currency: raw.currency,
          customer_name: raw.customer?.first_name || 'Customer',
          customer_email: raw.customer?.email,
          customer_phone: raw.customer?.phone,
          order_url: `https://${shopId}/admin/orders/${raw.id}`,
          shop_name: raw.shop_name || shopId,
        };

      case 'orders/create':
        return {
          order_number: raw.order_number,
          order_total: raw.total_price,
          currency: raw.currency,
          customer_name: raw.customer?.first_name || 'Customer',
          customer_email: raw.customer?.email,
          customer_phone: raw.customer?.phone,
          order_url: `https://${shopId}/admin/orders/${raw.id}`,
          shop_name: raw.shop_name || shopId,
        };

      case 'checkouts/update':
        return {
          checkout_id: raw.id,
          cart_total: raw.total_price,
          currency: raw.currency,
          customer_name: raw.customer?.first_name || 'Customer',
          customer_email: raw.customer?.email,
          customer_phone: raw.customer?.phone,
          recovery_url: raw.abandoned_checkout_url,
          shop_name: raw.shop_name || shopId,
        };

      case 'fulfillments/update':
        return {
          order_number: raw.order_number,
          tracking_number: raw.tracking_number,
          carrier: raw.tracking_company,
          tracking_url: raw.tracking_url,
          customer_name: raw.customer?.first_name || 'Customer',
          customer_email: raw.customer?.email,
          customer_phone: raw.customer?.phone,
          shop_name: raw.shop_name || shopId,
        };

      case 'customers/create':
        return {
          customer_name: raw.first_name || 'Customer',
          customer_email: raw.email,
          customer_phone: raw.phone,
          shop_name: raw.shop_name || shopId,
        };

      default:
        logger.warn({ topic }, 'Unknown event topic, skipping normalization');
        return null;
    }
  } catch (error) {
    logger.error({ error: error.message, topic, shopId }, 'Failed to normalize event context');
    return null;
  }
}
