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
    // App Proxy signature already verified by middleware
    const shopDomain = req.proxyShopDomain;
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

    // Check Accept header for HTML vs JSON response
    const acceptsHtml = req.get('Accept')?.includes('text/html');
    
    if (acceptsHtml) {
      return res.status(200)
        .send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Unsubscribed from SMS</title>
  <style>
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0; 
      padding: 40px 20px; 
      background: #f8f9fa; 
      color: #333;
    }
    .container { 
      max-width: 500px; 
      margin: 0 auto; 
      background: white; 
      padding: 40px; 
      border-radius: 8px; 
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    h1 { 
      color: #28a745; 
      margin-bottom: 20px; 
      font-size: 24px;
    }
    p { 
      margin-bottom: 15px; 
      line-height: 1.5;
    }
    .success { 
      color: #28a745; 
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>✓ Successfully Unsubscribed</h1>
    <p class="success">You have been unsubscribed from SMS marketing messages.</p>
    <p>This phone number will no longer receive promotional SMS messages from this store.</p>
    <p>If this was a mistake, you can opt-in again during your next checkout.</p>
  </div>
</body>
</html>`);
    } else {
      return res.status(200).json({
        success: true,
        message: 'You have been unsubscribed from SMS marketing messages',
        unsubscribed_at: new Date().toISOString()
      });
    }
  } catch {
    return res.status(500).send('<h1>Something went wrong</h1>');
  }
});

export default router;
