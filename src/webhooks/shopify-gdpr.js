// src/webhooks/shopify-gdpr.js
// Shopify GDPR webhook handlers

import { Router } from 'express';
import { verifyShopifyHmac } from '../middleware/verifyShopifyHmac.js';
import { logger } from '../lib/logger.js';
import { getPrismaClient } from '../db/prismaClient.js';
import { enqueueJob } from '../queue/queues.js';
import { randomUUID } from 'crypto';

const router = Router();
const prisma = getPrismaClient();

/**
 * POST /webhooks/shopify/customers/data_request
 * Handle customer data request events
 */
router.post('/customers/data_request', verifyShopifyHmac, async (req, res) => {
  const { body, shop } = req;
  const topic = 'customers/data_request';
  const objectId = body.customer?.id?.toString();

  if (!objectId) {
    logger.warn(
      { shop: shop?.domain, body },
      'Missing customer ID in customers/data_request webhook',
    );
    return res.status(400).json({ error: 'missing_customer_id' });
  }

  try {
    const dedupeKey = `${shop.id}:${topic}:${objectId}`;

    const existingEvent = await prisma.event.findUnique({
      where: { dedupeKey },
    });

    if (existingEvent) {
      logger.info(
        { dedupeKey, shopId: shop.id },
        'Duplicate customers/data_request webhook ignored',
      );
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

    // Enqueue GDPR data request job
    await enqueueJob('housekeepingQueue', 'gdpr:data_request', {
      eventId: event.id,
      shopId: shop.id,
      customerId: objectId,
      customerData: body.customer,
      requestId: req.get('X-Request-ID') || randomUUID(),
    });

    logger.info(
      { eventId: event.id, shopId: shop.id, customerId: objectId },
      'Customer data request event processed',
    );

    res.status(200).json({ ok: true, eventId: event.id });
  } catch (error) {
    logger.error(
      { error: error.message, shopId: shop.id, customerId: objectId },
      'Failed to process customers/data_request webhook',
    );
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * POST /webhooks/shopify/customers/redact
 * Handle customer redaction events
 */
router.post('/customers/redact', verifyShopifyHmac, async (req, res) => {
  const { body, shop } = req;
  const topic = 'customers/redact';
  const objectId = body.customer?.id?.toString();

  if (!objectId) {
    logger.warn({ shop: shop?.domain, body }, 'Missing customer ID in customers/redact webhook');
    return res.status(400).json({ error: 'missing_customer_id' });
  }

  try {
    const dedupeKey = `${shop.id}:${topic}:${objectId}`;

    const existingEvent = await prisma.event.findUnique({
      where: { dedupeKey },
    });

    if (existingEvent) {
      logger.info({ dedupeKey, shopId: shop.id }, 'Duplicate customers/redact webhook ignored');
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

    // Enqueue GDPR customer redaction job
    await enqueueJob('housekeepingQueue', 'gdpr:customer_redact', {
      eventId: event.id,
      shopId: shop.id,
      customerId: objectId,
      customerData: body.customer,
      requestId: req.get('X-Request-ID') || randomUUID(),
    });

    logger.info(
      { eventId: event.id, shopId: shop.id, customerId: objectId },
      'Customer redaction event processed',
    );

    res.status(200).json({ ok: true, eventId: event.id });
  } catch (error) {
    logger.error(
      { error: error.message, shopId: shop.id, customerId: objectId },
      'Failed to process customers/redact webhook',
    );
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * POST /webhooks/shopify/shop/redact
 * Handle shop redaction events
 */
router.post('/shop/redact', verifyShopifyHmac, async (req, res) => {
  const { body, shop } = req;
  const topic = 'shop/redact';
  const objectId = shop.id.toString();

  try {
    const dedupeKey = `${shop.id}:${topic}:${objectId}`;

    const existingEvent = await prisma.event.findUnique({
      where: { dedupeKey },
    });

    if (existingEvent) {
      logger.info({ dedupeKey, shopId: shop.id }, 'Duplicate shop/redact webhook ignored');
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

    // Enqueue GDPR shop redaction job
    await enqueueJob('housekeepingQueue', 'gdpr:shop_redact', {
      eventId: event.id,
      shopId: shop.id,
      shopData: body,
      requestId: req.get('X-Request-ID') || randomUUID(),
    });

    logger.info({ eventId: event.id, shopId: shop.id }, 'Shop redaction event processed');

    res.status(200).json({ ok: true, eventId: event.id });
  } catch (error) {
    logger.error(
      { error: error.message, shopId: shop.id },
      'Failed to process shop/redact webhook',
    );
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
