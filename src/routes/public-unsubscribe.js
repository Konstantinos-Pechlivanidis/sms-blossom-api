// src/routes/public-unsubscribe.js
// Public unsubscribe route (App Proxy GET → HTML)

import { Router } from 'express';
import { getPrismaClient } from '../db/prismaClient.js';
import { verifyAppProxySignature } from '../lib/appProxyVerify.js';
import { updateLocalAndRemoteConsent } from '../services/consent-unified.js';

const prisma = getPrismaClient();
const router = Router();

/**
 * GET /public/unsubscribe?shop=<store>&timestamp=...&signature=...&phone=<E164>
 * App Proxy signed link. Marks contact as opted_out, pushes consent to Shopify (best-effort),
 * writes an AuditLog, and renders a simple HTML confirmation.
 */
router.get('/', async (req, res) => {
  try {
    if (!verifyAppProxySignature(req.query)) {
      return res.status(401).send('<h1>Invalid signature</h1>');
    }
    const shopDomain = String(req.query.shop || '');
    const phone = String(req.query.phone || '').trim();
    if (!shopDomain || !phone) return res.status(422).send('<h1>Missing shop or phone</h1>');

    const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } }).catch(() => null);
    if (!shop) return res.status(404).send('<h1>Unknown shop</h1>');

    const contact = await prisma.contact.findFirst({
      where: { shopId: shop.id, phoneE164: phone },
    });
    if (!contact) {
      return res
        .status(200)
        .send("<h1>Unsubscribed</h1><p>If this number was on our list, it's now unsubscribed.</p>");
    }

    await updateLocalAndRemoteConsent({
      shop,
      contact,
      nextState: 'opted_out',
      source: 'public_unsubscribe',
      pushToShopify: true,
      reqMeta: { actor: 'public', ip: req.ip, ua: req.get('user-agent') },
    });

    return res.status(200)
      .send(`<html><head><meta charset="utf-8"><title>Unsubscribed</title></head>
<body style="font-family:system-ui;margin:40px;">
  <h1>You've been unsubscribed</h1>
  <p>This phone number will no longer receive SMS from this store.</p>
  <p>If this was a mistake, you can opt-in again on your next checkout.</p>
</body></html>`);
  } catch {
    return res.status(500).send('<h1>Something went wrong</h1>');
  }
});

export default router;
