// src/webhooks/shopify-orders.js
// Shopify orders webhook handlers

import { Router } from 'express';
import { verifyShopifyHmac } from '../middleware/verifyShopifyHmac.js';
import { logger } from '../lib/logger.js';
import { getPrismaClient } from '../db/prismaClient.js';
import { enqueueJob } from '../queue/queues.js';
import { randomUUID } from 'crypto';

const router = Router();
const prisma = getPrismaClient();

/**
 * POST /webhooks/shopify/orders/create
 * Handle order creation events
 */
router.post('/orders/create', verifyShopifyHmac, async (req, res) => {
  const { body, shop } = req;
  const topic = 'orders/create';
  const objectId = body.id?.toString();

  if (!objectId) {
    logger.warn({ shop: shop?.domain, body }, 'Missing order ID in orders/create webhook');
    return res.status(400).json({ error: 'missing_order_id' });
  }

  try {
    // Create dedupe key
    const dedupeKey = `${shop.id}:${topic}:${objectId}`;

    // Check for existing event
    const existingEvent = await prisma.event.findUnique({
      where: { dedupeKey },
    });

    if (existingEvent) {
      logger.info({ dedupeKey, shopId: shop.id }, 'Duplicate orders/create webhook ignored');
      return res.status(200).json({ ok: true, duplicate: true });
    }

    // Store event
    const event = await prisma.event.create({
      data: {
        shopId: shop.id,
        topic,
        objectId,
        raw: body,
        dedupeKey,
        receivedAt: new Date(),
      },
    });

    // Enqueue for processing
    await enqueueJob('eventsQueue', 'orders:create', {
      eventId: event.id,
      shopId: shop.id,
      orderId: objectId,
      orderData: body,
      requestId: req.get('X-Request-ID') || randomUUID(),
    });

    logger.info(
      { eventId: event.id, shopId: shop.id, orderId: objectId },
      'Order creation event processed',
    );

    res.status(200).json({ ok: true, eventId: event.id });
  } catch (error) {
    logger.error(
      { error: error.message, shopId: shop.id, orderId: objectId },
      'Failed to process orders/create webhook',
    );
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * POST /webhooks/shopify/orders/paid
 * Handle order payment events
 */
router.post('/orders/paid', verifyShopifyHmac, async (req, res) => {
  const { body, shop } = req;
  const topic = 'orders/paid';
  const objectId = body.id?.toString();

  if (!objectId) {
    logger.warn({ shop: shop?.domain, body }, 'Missing order ID in orders/paid webhook');
    return res.status(400).json({ error: 'missing_order_id' });
  }

  try {
    const dedupeKey = `${shop.id}:${topic}:${objectId}`;

    const existingEvent = await prisma.event.findUnique({
      where: { dedupeKey },
    });

    if (existingEvent) {
      logger.info({ dedupeKey, shopId: shop.id }, 'Duplicate orders/paid webhook ignored');
      return res.status(200).json({ ok: true, duplicate: true });
    }

    const event = await prisma.event.create({
      data: {
        shopId: shop.id,
        topic,
        objectId,
        raw: body,
        dedupeKey,
        receivedAt: new Date(),
      },
    });

    await enqueueJob('eventsQueue', 'orders:paid', {
      eventId: event.id,
      shopId: shop.id,
      orderId: objectId,
      orderData: body,
      requestId: req.get('X-Request-ID') || randomUUID(),
    });

    logger.info(
      { eventId: event.id, shopId: shop.id, orderId: objectId },
      'Order payment event processed',
    );

    res.status(200).json({ ok: true, eventId: event.id });
  } catch (error) {
    logger.error(
      { error: error.message, shopId: shop.id, orderId: objectId },
      'Failed to process orders/paid webhook',
    );
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
