// src/webhooks/shopify-inventory.js
// Shopify inventory webhook handlers

import { Router } from 'express';
import { verifyShopifyHmac } from '../middleware/verifyShopifyHmac.js';
import { logger } from '../lib/logger.js';
import { getPrismaClient } from '../db/prismaClient.js';
import { enqueueJob } from '../queue/queues.js';
import { randomUUID } from 'crypto';

const router = Router();
const prisma = getPrismaClient();

/**
 * POST /webhooks/shopify/inventory_levels/update
 * Handle inventory level update events
 */
router.post('/inventory_levels/update', verifyShopifyHmac, async (req, res) => {
  const { body, shop } = req;
  const topic = 'inventory_levels/update';
  const objectId = body.inventory_item_id?.toString();

  if (!objectId) {
    logger.warn(
      { shop: shop?.domain, body },
      'Missing inventory item ID in inventory_levels/update webhook',
    );
    return res.status(400).json({ error: 'missing_inventory_item_id' });
  }

  try {
    const dedupeKey = `${shop.id}:${topic}:${objectId}`;

    const existingEvent = await prisma.event.findUnique({
      where: { dedupeKey },
    });

    if (existingEvent) {
      logger.info(
        { dedupeKey, shopId: shop.id },
        'Duplicate inventory_levels/update webhook ignored',
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

    await enqueueJob('eventsQueue', 'inventory_levels:update', {
      eventId: event.id,
      shopId: shop.id,
      inventoryItemId: objectId,
      inventoryData: body,
      requestId: req.get('X-Request-ID') || randomUUID(),
    });

    logger.info(
      { eventId: event.id, shopId: shop.id, inventoryItemId: objectId },
      'Inventory level update event processed',
    );

    res.status(200).json({ ok: true, eventId: event.id });
  } catch (error) {
    logger.error(
      { error: error.message, shopId: shop.id, inventoryItemId: objectId },
      'Failed to process inventory_levels/update webhook',
    );
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;
