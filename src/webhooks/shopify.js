import { Router } from 'express';
import { verifyShopifyHmac } from '../middleware/verifyShopifyHmac.js';
import { getPrismaClient } from '../db/prismaClient.js';
import { getQueue } from '../queue/memory.js';
import { dispatchEvent } from '../queue/dispatcher.js';
import { isRedis, enqueueEvent } from '../queue/driver.js';
import { logger } from '../lib/logger.js';

const router = Router();
const prisma = getPrismaClient();

router.post('/:topic', verifyShopifyHmac(), async (req, res, next) => {
  try {
    const topic = req.params.topic;
    const shopDomain = req.get('X-Shopify-Shop-Domain');
    let payload = {};
    try {
      payload = req.rawBody ? JSON.parse(req.rawBody.toString('utf8')) : req.body || {};
    } catch {
      payload = {};
    }
    const objectId = payload.id ? String(payload.id) : payload.admin_graphql_api_id || 'unknown';
    const dedupeKey = `${shopDomain}:${topic}:${objectId}`;

    let shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
    if (!shop) {
      shop = await prisma.shop.create({ data: { domain: shopDomain } });
    }

    let evt;
    try {
      evt = await prisma.event.create({
        data: {
          shopId: shop.id,
          topic,
          objectId,
          raw: payload,
          dedupeKey,
        },
      });
    } catch (e) {
      // Unique constraint violation short-circuits
      if (e.code === 'P2002') {
        logger.debug({ dedupeKey }, 'duplicate event ignored');
        return res.status(200).send('ok');
      } else {
        throw e;
      }
    }

    const queue = getQueue();
    await queue.enqueue('shopify', topic, { dedupeKey, topic, shopDomain, payload });

    if (isRedis()) {
      await enqueueEvent({ topic, shopDomain, shopId: shop.id, payload, eventId: evt.id });
    } else {
      // memory mode (current behavior)
      process.nextTick(async () => {
        try {
          await dispatchEvent({ topic, shopDomain, shopId: shop.id, payload });
          await prisma.event.update({ where: { id: evt.id }, data: { processedAt: new Date() } });
        } catch (e) {
          await prisma.event.update({
            where: { id: evt.id },
            data: { error: String(e?.message || e) },
          });
        }
      });
    }

    res.status(200).send('ok');
  } catch (err) {
    next(err);
  }
});

export default router;
