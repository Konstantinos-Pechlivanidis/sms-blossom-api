import { createHmac, timingSafeEqual } from 'node:crypto';
import { getWebhookHmacSecret } from '../config/env.js';

// Verifies Shopify HMAC for webhooks using canonical WEBHOOK_HMAC_SECRET (with legacy WEBHOOK_SECRET support)
export function verifyShopifyHmac() {
  const secret = getWebhookHmacSecret();

  return function shopifyHmacMiddleware(req, res, next) {
    try {
      const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
      if (!hmacHeader) return res.status(401).send('Missing HMAC');
      if (!req.rawBody) return res.status(400).send('Missing raw body');

      const digest = createHmac('sha256', secret).update(req.rawBody).digest();
      const received = Buffer.from(hmacHeader, 'base64');
      if (digest.length !== received.length || !timingSafeEqual(digest, received)) {
        return res.status(401).send('Invalid HMAC');
      }
      return next();
    } catch (e) {
      return next(e);
    }
  };
}
