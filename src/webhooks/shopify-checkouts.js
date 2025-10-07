// src/webhooks/shopify-checkouts.js
// Shopify checkouts webhook handlers

import { Router } from 'express';
import { verifyShopifyHmac } from '../middleware/verifyShopifyHmac.js';
import { logger } from '../lib/logger.js';
import { getPrismaClient } from '../db/prismaClient.js';
import { enqueueJob } from '../queue/queues.js';
import { randomUUID } from 'crypto';

const router = Router();
const prisma = getPrismaClient();

/**
 * POST /webhooks/shopify/checkouts/create
 * Handle checkout creation events
 */
router.post('/checkouts/create', verifyShopifyHmac, async (req, res) => {
  const { body, shop } = req;
  const topic = 'checkouts/create';
  const objectId = body.id?.toString();

  if (!objectId) {
    logger.warn({ shop: shop?.domain, body }, 'Missing checkout ID in checkouts/create webhook');
    return res.status(400).json({ error: 'missing_checkout_id' });
  }

  try {
    const dedupeKey = `${shop.id}:${topic}:${objectId}`;

    const existingEvent = await prisma.event.findUnique({
      where: { dedupeKey },
    });

    if (existingEvent) {
      logger.info({ dedupeKey, shopId: shop.id }, 'Duplicate checkouts/create webhook ignored');
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

    await enqueueJob('eventsQueue', 'checkouts:create', {
      eventId: event.id,
      shopId: shop.id,
      checkoutId: objectId,
      checkoutData: body,
      requestId: req.get('X-Request-ID') || randomUUID(),
    });

    logger.info(
      { eventId: event.id, shopId: shop.id, checkoutId: objectId },
      'Checkout creation event processed',
    );

    res.status(200).json({ ok: true, eventId: event.id });
  } catch (error) {
    logger.error(
      { error: error.message, shopId: shop.id, checkoutId: objectId },
      'Failed to process checkouts/create webhook',
    );
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * POST /webhooks/shopify/checkouts/update
 * Handle checkout update events (abandoned checkout detection)
 */
router.post('/checkouts/update', verifyShopifyHmac, async (req, res) => {
  const { body, shop } = req;
  const topic = 'checkouts/update';
  const objectId = body.id?.toString();

  if (!objectId) {
    logger.warn({ shop: shop?.domain, body }, 'Missing checkout ID in checkouts/update webhook');
    return res.status(400).json({ error: 'missing_checkout_id' });
  }

  try {
    const dedupeKey = `${shop.id}:${topic}:${objectId}`;

    const existingEvent = await prisma.event.findUnique({
      where: { dedupeKey },
    });

    if (existingEvent) {
      logger.info({ dedupeKey, shopId: shop.id }, 'Duplicate checkouts/update webhook ignored');
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

    await enqueueJob('eventsQueue', 'checkouts:update', {
      eventId: event.id,
      shopId: shop.id,
      checkoutId: objectId,
      checkoutData: body,
      requestId: req.get('X-Request-ID') || randomUUID(),
    });

    logger.info(
      { eventId: event.id, shopId: shop.id, checkoutId: objectId },
      'Checkout update event processed',
    );

    res.status(200).json({ ok: true, eventId: event.id });
  } catch (error) {
    logger.error(
      { error: error.message, shopId: shop.id, checkoutId: objectId },
      'Failed to process checkouts/update webhook',
    );
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
