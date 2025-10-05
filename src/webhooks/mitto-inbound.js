import { Router } from 'express';
import { getPrismaClient } from '../db/prismaClient.js';
import { updateSmsConsent } from '../services/consent.js';

const router = Router();
const prisma = getPrismaClient();

router.post('/', async (req, res) => {
  const text = String(req.body?.text || req.body?.message || '')
    .trim()
    .toUpperCase();
  const from = String(req.body?.from || req.body?.msisdn || '').trim();
  if (!text || !from) return res.sendStatus(200);

  if (['STOP', 'UNSUBSCRIBE', 'STOPALL'].includes(text)) {
    // Find all matching contacts by phone across shops (multi-tenant safe update)
    const contacts = await prisma.contact.findMany({ where: { phoneE164: from, optedOut: false } });
    for (const c of contacts) {
      try {
        await prisma.contact.update({ where: { id: c.id }, data: { optedOut: true } });
        // Best-effort push to Shopify if we have a customerId
        if (c.customerId) {
          const shop = await prisma.shop.findUnique({ where: { id: c.shopId } });
          if (shop?.domain) {
            try {
              await updateSmsConsent({
                shopDomain: shop.domain,
                customerId: c.customerId,
                marketingState: 'UNSUBSCRIBED',
                marketingOptInLevel: 'SINGLE_OPT_IN',
                consentUpdatedAt: new Date().toISOString(),
              });
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
  }
  res.sendStatus(200);
});

export default router;
