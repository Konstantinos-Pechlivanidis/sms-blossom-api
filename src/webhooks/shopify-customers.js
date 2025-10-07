// src/webhooks/shopify-customers.js
// Shopify customers webhook handlers

import { Router } from 'express';
import { verifyShopifyHmac } from '../middleware/verifyShopifyHmac.js';
import { logger } from '../lib/logger.js';
import { getPrismaClient } from '../db/prismaClient.js';
import { enqueueJob } from '../queue/queues.js';
import { randomUUID } from 'crypto';

const router = Router();
const prisma = getPrismaClient();

/**
 * POST /webhooks/shopify/customers/create
 * Handle customer creation events
 */
router.post('/customers/create', verifyShopifyHmac, async (req, res) => {
  const { body, shop } = req;
  const topic = 'customers/create';
  const objectId = body.id?.toString();

  if (!objectId) {
    logger.warn({ shop: shop?.domain, body }, 'Missing customer ID in customers/create webhook');
    return res.status(400).json({ error: 'missing_customer_id' });
  }

  try {
    const dedupeKey = `${shop.id}:${topic}:${objectId}`;

    const existingEvent = await prisma.event.findUnique({
      where: { dedupeKey },
    });

    if (existingEvent) {
      logger.info({ dedupeKey, shopId: shop.id }, 'Duplicate customers/create webhook ignored');
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

    await enqueueJob('eventsQueue', 'customers:create', {
      eventId: event.id,
      shopId: shop.id,
      customerId: objectId,
      customerData: body,
      requestId: req.get('X-Request-ID') || randomUUID(),
    });

    logger.info(
      { eventId: event.id, shopId: shop.id, customerId: objectId },
      'Customer creation event processed',
    );

    res.status(200).json({ ok: true, eventId: event.id });
  } catch (error) {
    logger.error(
      { error: error.message, shopId: shop.id, customerId: objectId },
      'Failed to process customers/create webhook',
    );
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * POST /webhooks/shopify/customers/update
 * Handle customer update events
 */
router.post('/customers/update', verifyShopifyHmac, async (req, res) => {
  const { body, shop } = req;
  const topic = 'customers/update';
  const objectId = body.id?.toString();

  if (!objectId) {
    logger.warn({ shop: shop?.domain, body }, 'Missing customer ID in customers/update webhook');
    return res.status(400).json({ error: 'missing_customer_id' });
  }

  try {
    const dedupeKey = `${shop.id}:${topic}:${objectId}`;

    const existingEvent = await prisma.event.findUnique({
      where: { dedupeKey },
    });

    if (existingEvent) {
      logger.info({ dedupeKey, shopId: shop.id }, 'Duplicate customers/update webhook ignored');
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

    await enqueueJob('eventsQueue', 'customers:update', {
      eventId: event.id,
      shopId: shop.id,
      customerId: objectId,
      customerData: body,
      requestId: req.get('X-Request-ID') || randomUUID(),
    });

    logger.info(
      { eventId: event.id, shopId: shop.id, customerId: objectId },
      'Customer update event processed',
    );

    res.status(200).json({ ok: true, eventId: event.id });
  } catch (error) {
    logger.error(
      { error: error.message, shopId: shop.id, customerId: objectId },
      'Failed to process customers/update webhook',
    );
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
