// src/routes/public-back-in-stock.js
// Public App Proxy route for back-in-stock interest registration

import { Router } from 'express';
import { getPrismaClient } from '../db/prismaClient.js';
import { verifyAppProxySignature } from '../lib/appProxyVerify.js';
import { toE164Loose } from '../lib/phone.js';
import { upsertInterest } from '../services/back-in-stock.js';
import { resolveByInventoryItem } from '../services/shopify-products.js';

const prisma = getPrismaClient();
const router = Router();

/**
 * POST /public/back-in-stock/interest
 * Query (signed by App Proxy): shop, timestamp, signature
 * Body: { phone: "+3069...", inventoryItemId: "1234567890" }
 */
router.post('/interest', async (req, res) => {
  try {
    // App Proxy signature already verified by middleware
    const shopDomain = req.proxyShopDomain;
    const { phone, inventoryItemId } = (typeof req.body === 'object' && req.body) || {};
    if (!shopDomain || !phone || !inventoryItemId)
      return res.status(422).json({ error: 'missing_params' });

    const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
    if (!shop) return res.status(404).json({ error: 'unknown_shop' });

    const phoneE164 = toE164Loose(String(phone));
    if (!phoneE164) return res.status(422).json({ error: 'invalid_phone' });

    const contact = await prisma.contact.findFirst({ where: { shopId: shop.id, phoneE164 } });
    if (!contact) return res.status(404).json({ error: 'unknown_contact' });
    if (contact.optedOut || contact.smsConsentState !== 'opted_in') {
      return res.status(403).json({ error: 'no_consent' });
    }

    // Enrich with product meta (best-effort)
    const productMeta = await resolveByInventoryItem({
      shopDomain,
      inventoryItemNumericId: String(inventoryItemId),
    }).catch(() => null);
    const id = await upsertInterest({
      shop,
      contact,
      inventoryItemId: String(inventoryItemId),
      productMeta,
    });

    return res.json({ ok: true, id, productMeta: productMeta || null });
  } catch {
    return res.status(500).json({ error: 'server_error' });
  }
});

export default router;
