import { Router } from 'express';
import { toE164Loose } from '../lib/phone.js';
import { getPrismaClient } from '../db/prismaClient.js';
import { verifyAppProxySignature as _verifyAppProxySignature } from '../lib/appProxyVerify.js';
import { updateSmsConsent } from '../services/consent.js';

const router = Router();

router.get('/', async (req, res) => {
  // App Proxy signature already verified by middleware
  const prisma = getPrismaClient();
  const shopDomain = req.proxyShopDomain;
  const s = await prisma.shop.findUnique({ where: { domain: shopDomain } });
  if (!s) return res.status(404).type('html').send('<h1>Shop not found</h1>');

  const phoneE164 = toE164Loose(String(req.query.phone || ''));
  if (!phoneE164) return res.status(422).type('html').send('<h1>Invalid phone</h1>');

  const contact = await prisma.contact.findUnique({
    where: { shopId_phoneE164: { shopId: s.id, phoneE164 } },
  });
  if (contact?.customerId) {
    try {
      await updateSmsConsent({
        shopDomain,
        customerId: contact.customerId,
        marketingState: 'UNSUBSCRIBED',
        marketingOptInLevel: 'SINGLE_OPT_IN',
        consentUpdatedAt: new Date().toISOString(),
      });
    } catch (e) {
      req.log?.warn({ err: e }, 'Shopify consent update failed, continuing with local opt-out');
    }
  }

  await prisma.contact.upsert({
    where: { shopId_phoneE164: { shopId: s.id, phoneE164 } },
    create: { shopId: s.id, phoneE164, optedOut: true },
    update: { optedOut: true },
  });

  // Check Accept header for HTML vs JSON response
  const acceptsHtml = req.get('Accept')?.includes('text/html');

  if (acceptsHtml) {
    res.type('html').send(`
        <!DOCTYPE html>
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
            <p>You will no longer receive promotional SMS messages from this store.</p>
            <p>If this was a mistake, you can opt-in again during your next checkout.</p>
          </div>
        </body>
        </html>
      `);
  } else {
    res
      .type('html')
      .send(
        '<h1>Επιτυχής απεγγραφή από SMS</h1><p>Μπορείτε να εγγραφείτε ξανά οποιαδήποτε στιγμή.</p>',
      );
  }
});

export default router;
