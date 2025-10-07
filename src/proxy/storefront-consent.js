// src/proxy/storefront-consent.js
// App Proxy POST → collects SMS consent (PCD-safe, production-ready)

import express from 'express';
import Ajv from 'ajv';
import { verifyAppProxySignature as _verifyAppProxySignature } from '../lib/appProxyVerify.js';
import { toE164Loose } from '../lib/phone.js';
import { ensureCustomerIdByPhone, updateSmsConsent } from '../services/consent.js';
import { upsertContactByPhone, findShopByDomain } from '../services/contacts.js';

export const router = express.Router();

const ajv = new Ajv({ allErrors: true, removeAdditional: true });
const schema = {
  type: 'object',
  properties: {
    phone: { type: 'string', minLength: 5 },
    email: { type: 'string', nullable: true },
    optInLevel: {
      type: 'string',
      enum: ['SINGLE_OPT_IN', 'CONFIRMED_OPT_IN'],
      default: 'SINGLE_OPT_IN',
    },
  },
  required: ['phone'],
  additionalProperties: true,
};
const validate = ajv.compile(schema);

router.post('/', async (req, res) => {
  // App Proxy signature already verified by middleware
  const shopDomain = req.proxyShopDomain;
  const shop = await findShopByDomain(shopDomain); // must resolve by Prisma Shop.domain
  if (!shop) return res.status(400).json({ error: 'unknown_shop' });

  const payload = typeof req.body === 'object' && req.body ? req.body : {};
  if (!validate(payload)) {
    return res.status(422).json({ error: 'invalid_payload', details: validate.errors });
  }

  const phoneE164 = toE164Loose(payload.phone);
  if (!phoneE164) return res.status(422).json({ error: 'invalid_phone' });

  const email = payload.email || null;
  const optInLevel = payload.optInLevel || 'SINGLE_OPT_IN';

  try {
    // 1) Find/create Shopify customer (PCD-safe: we never select 'phone')
    const customerId = await ensureCustomerIdByPhone({
      shopDomain,
      phoneE164,
      emailIfCreate: email,
    });

    // 2) Try to push consent to Shopify; if blocked due to PCD, mark pending
    let shopifyResult = null;
    let shopifyPushPending = false;

    if (customerId) {
      try {
        shopifyResult = await updateSmsConsent({
          shopDomain,
          customerId,
          marketingState: 'SUBSCRIBED',
          marketingOptInLevel: optInLevel,
          consentUpdatedAt: new Date().toISOString(),
        });
      } catch (err) {
        const msg = JSON.stringify(err?.details || err?.message || '');
        // When Protected Customer Data isn’t approved yet, Shopify denies — we degrade gracefully
        if (/Protected customer data|ACCESS_DENIED|phone field/i.test(msg)) {
          shopifyPushPending = true;
        } else {
          throw err; // unknown error → bubble up
        }
      }
    } else {
      // No customer yet (e.g., no email to create) — store locally and plan a re-push later
      shopifyPushPending = true;
    }

    // 3) Local DB upsert — treat as opted-in in our system either way
    await upsertContactByPhone({
      shopId: shop.id,
      phoneE164,
      customerId: customerId || undefined,
      state: 'SUBSCRIBED',
      source: 'storefront_proxy',
    });

    return res.json({
      ok: true,
      phoneE164,
      linkedToCustomer: !!customerId,
      shopify: shopifyResult
        ? {
            id: shopifyResult.id,
            state: shopifyResult.smsMarketingConsent?.marketingState,
            level: shopifyResult.smsMarketingConsent?.marketingOptInLevel,
          }
        : null,
      shopifyPushPending,
      pcdApproved: process.env.PCD_APPROVED === 'true',
    });
  } catch (err) {
    req.log?.error({ err, details: err?.details }, 'consent flow failed');
    return res.status(500).json({ error: 'shopify_error', details: err?.details || String(err) });
  }
});

export default router;
