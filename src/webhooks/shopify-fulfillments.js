// src/webhooks/shopify-fulfillments.js
// Shopify fulfillments webhook handlers

import { Router } from 'express';
import { verifyShopifyHmac } from '../middleware/verifyShopifyHmac.js';
import { logger } from '../lib/logger.js';
import { getPrismaClient } from '../db/prismaClient.js';
import { enqueueJob } from '../queue/queues.js';
import { randomUUID } from 'crypto';

const router = Router();
const prisma = getPrismaClient();

/**
 * POST /webhooks/shopify/fulfillments/create
 * Handle fulfillment creation events
 */
router.post('/fulfillments/create', verifyShopifyHmac, async (req, res) => {
  const { body, shop } = req;
  const topic = 'fulfillments/create';
  const objectId = body.id?.toString();

  if (!objectId) {
    logger.warn(
      { shop: shop?.domain, body },
      'Missing fulfillment ID in fulfillments/create webhook',
    );
    return res.status(400).json({ error: 'missing_fulfillment_id' });
  }

  try {
    const dedupeKey = `${shop.id}:${topic}:${objectId}`;

    const existingEvent = await prisma.event.findUnique({
      where: { dedupeKey },
    });

    if (existingEvent) {
      logger.info({ dedupeKey, shopId: shop.id }, 'Duplicate fulfillments/create webhook ignored');
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

    await enqueueJob('eventsQueue', 'fulfillments:create', {
      eventId: event.id,
      shopId: shop.id,
      fulfillmentId: objectId,
      fulfillmentData: body,
      requestId: req.get('X-Request-ID') || randomUUID(),
    });

    logger.info(
      { eventId: event.id, shopId: shop.id, fulfillmentId: objectId },
      'Fulfillment creation event processed',
    );

    res.status(200).json({ ok: true, eventId: event.id });
  } catch (error) {
    logger.error(
      { error: error.message, shopId: shop.id, fulfillmentId: objectId },
      'Failed to process fulfillments/create webhook',
    );
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * POST /webhooks/shopify/fulfillments/update
 * Handle fulfillment update events
 */
router.post('/fulfillments/update', verifyShopifyHmac, async (req, res) => {
  const { body, shop } = req;
  const topic = 'fulfillments/update';
  const objectId = body.id?.toString();

  if (!objectId) {
    logger.warn(
      { shop: shop?.domain, body },
      'Missing fulfillment ID in fulfillments/update webhook',
    );
    return res.status(400).json({ error: 'missing_fulfillment_id' });
  }

  try {
    const dedupeKey = `${shop.id}:${topic}:${objectId}`;

    const existingEvent = await prisma.event.findUnique({
      where: { dedupeKey },
    });

    if (existingEvent) {
      logger.info({ dedupeKey, shopId: shop.id }, 'Duplicate fulfillments/update webhook ignored');
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

    await enqueueJob('eventsQueue', 'fulfillments:update', {
      eventId: event.id,
      shopId: shop.id,
      fulfillmentId: objectId,
      fulfillmentData: body,
      requestId: req.get('X-Request-ID') || randomUUID(),
    });

    logger.info(
      { eventId: event.id, shopId: shop.id, fulfillmentId: objectId },
      'Fulfillment update event processed',
    );

    res.status(200).json({ ok: true, eventId: event.id });
  } catch (error) {
    logger.error(
      { error: error.message, shopId: shop.id, fulfillmentId: objectId },
      'Failed to process fulfillments/update webhook',
    );
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
