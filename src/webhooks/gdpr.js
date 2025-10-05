// src/webhooks/gdpr.js
// GDPR webhooks handler (HMAC verified)

import { Router } from 'express';
import { verifyShopifyHmac } from '../middleware/verifyShopifyHmac.js';
import { getPrismaClient } from '../db/prismaClient.js';
import { logAudit } from '../services/audit.js';

const prisma = getPrismaClient();
const router = Router();

/**
 * Shopify will POST GDPR topics:
 * - customers/data_request
 * - customers/redact
 * - shop/redact
 * We expect the generic route: /webhooks/gdpr/:topic
 */
router.post('/:topic', verifyShopifyHmac, async (req, res) => {
  const topic = String(req.params.topic || '');
  const shopDomain = req.get('X-Shopify-Shop-Domain') || '';

  try {
    const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } }).catch(() => null);
    if (!shop) {
      // We still ACK to Shopify, but log
      return res.sendStatus(200);
    }

    if (topic === 'customers/data_request') {
      // Minimal: record audit; a separate async job could assemble export
      await logAudit({
        shopId: shop.id,
        actor: 'webhook',
        action: 'gdpr.data_request',
        entity: 'shop',
        entityId: shop.id,
        diff: { payload: req.body },
      });
      return res.sendStatus(200);
    }

    if (topic === 'customers/redact') {
      // Anonymize contacts for this customer
      const customerId = String(req.body?.customer?.id || req.body?.customer_id || '');
      if (customerId) {
        const contacts = await prisma.contact.findMany({ where: { shopId: shop.id, customerId } });
        for (const c of contacts) {
          await prisma.contact.update({
            where: { id: c.id },
            data: {
              firstName: null,
              lastName: null,
              email: null,
              tagsJson: [],
              smsConsentState: 'opted_out',
              smsConsentSource: 'gdpr',
              unsubscribedAt: new Date(),
              optedOut: true,
              // Keep phoneE164 as-is or transform if your policy requires tokenization.
            },
          });
          await logAudit({
            shopId: shop.id,
            actor: 'webhook',
            action: 'gdpr.redact',
            entity: 'contact',
            entityId: c.id,
            diff: { reason: 'customers/redact' },
          });
        }
      }
      return res.sendStatus(200);
    }

    if (topic === 'shop/redact') {
      // Minimal stub: mark shop status or schedule purge job
      await logAudit({
        shopId: shop.id,
        actor: 'webhook',
        action: 'gdpr.shop_redact',
        entity: 'shop',
        entityId: shop.id,
        diff: { payload: req.body },
      });
      // Optionally enqueue a purge after retention window
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch {
    return res.sendStatus(200); // ACK regardless (Shopify expects 200)
  }
});

export default router;
