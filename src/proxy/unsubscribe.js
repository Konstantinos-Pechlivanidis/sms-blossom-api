import { Router } from 'express';
import { toE164Loose } from '../lib/phone.js';
import { getPrismaClient } from '../db/prismaClient.js';
import { verifyAppProxySignature } from '../lib/appProxyVerify.js';
import { updateSmsConsent } from '../services/consent.js';

const router = Router();

router.get('/', async (req, res) => {
  if (!verifyAppProxySignature(req.query))
    return res.status(401).type('html').send('<h1>Unauthorized</h1>');

  const prisma = getPrismaClient();
  const shopDomain = String(req.query.shop || '');
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

  res
    .type('html')
    .send(
      '<h1>Επιτυχής απεγγραφή από SMS</h1><p>Μπορείτε να εγγραφείτε ξανά οποιαδήποτε στιγμή.</p>',
    );
});

export default router;
