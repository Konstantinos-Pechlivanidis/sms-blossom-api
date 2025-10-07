import { Router } from 'express';
import { getPrismaClient } from '../db/prismaClient.js';
import { updateSmsConsent } from '../services/consent.js';
import { logger } from '../lib/logger.js';

const router = Router();
const prisma = getPrismaClient();

router.post('/', async (req, res) => {
  const text = String(req.body?.text || req.body?.message || '')
    .trim()
    .toUpperCase();
  const from = String(req.body?.from || req.body?.msisdn || '').trim();

  logger.info(
    {
      from,
      text,
      body: req.body,
    },
    'Received Mitto inbound SMS',
  );

  if (!text || !from) {
    logger.warn('Missing text or from in inbound webhook');
    return res.sendStatus(200);
  }

  if (['STOP', 'UNSUBSCRIBE', 'STOPALL'].includes(text)) {
    logger.info({ from, text }, 'Processing STOP request');

    // Find all matching contacts by phone across shops (multi-tenant safe update)
    const contacts = await prisma.contact.findMany({ where: { phoneE164: from, optedOut: false } });

    for (const c of contacts) {
      try {
        await prisma.contact.update({
          where: { id: c.id },
          data: {
            optedOut: true,
            unsubscribedAt: new Date(),
            smsConsentState: 'opted_out',
            smsConsentSource: 'inbound_stop',
          },
        });

        // Create audit log
        await prisma.auditLog.create({
          data: {
            shopId: c.shopId,
            actor: 'system',
            action: 'consent.unsubscribe',
            entity: 'contact',
            entityId: c.id,
            diffJson: {
              optedOut: { from: false, to: true },
              smsConsentState: { from: c.smsConsentState, to: 'opted_out' },
              source: 'inbound_stop',
            },
          },
        });

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

              logger.info(
                { contactId: c.id, shopId: c.shopId, customerId: c.customerId },
                'Updated Shopify consent for STOP request',
              );
            } catch (error) {
              logger.error(
                { error: error.message, contactId: c.id, customerId: c.customerId },
                'Failed to update Shopify consent',
              );
            }
          }
        }

        logger.info(
          { contactId: c.id, shopId: c.shopId, phoneE164: from },
          'Contact unsubscribed via STOP request',
        );
      } catch (error) {
        logger.error(
          { error: error.message, contactId: c.id, phoneE164: from },
          'Failed to process STOP request for contact',
        );
      }
    }
  } else if (['HELP', 'INFO'].includes(text)) {
    logger.info({ from, text }, 'Received HELP request');
    // TODO: Send help message or store for manual follow-up
  }

  res.sendStatus(200);
});

export default router;
