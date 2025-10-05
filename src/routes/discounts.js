import { Router } from 'express';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import {
  createBasicCodeDiscount,
  buildApplyUrl,
  scanAutomaticDiscountConflicts,
} from '../services/discounts.js';
import { findShopByDomain } from '../services/contacts.js';

const router = Router();
const ajv = new Ajv({ allErrors: true, removeAdditional: true, coerceTypes: true });
addFormats(ajv);

const createSchema = {
  type: 'object',
  properties: {
    code: { type: 'string', minLength: 3 },
    title: { type: 'string', nullable: true },
    kind: { enum: ['percentage', 'amount'] },
    value: { type: 'number' }, // 10 or 0.10 for percentage; amount is a number
    currencyCode: { type: 'string', nullable: true }, // required when kind=amount
    startsAt: { type: 'string', format: 'date-time', nullable: true },
    endsAt: { type: 'string', format: 'date-time', nullable: true },
    appliesOncePerCustomer: { type: 'boolean', default: true },
    usageLimit: { type: ['integer', 'null'], minimum: 1, nullable: true },
    redirect: { type: 'string', nullable: true }, // e.g., "/checkout" or "/collections/sale"
  },
  required: ['code', 'kind', 'value'],
  additionalProperties: false,
  allOf: [
    {
      if: { properties: { kind: { const: 'amount' } } },
      then: { required: ['currencyCode'] },
    },
  ],
};
const validateCreate = ajv.compile(createSchema);

function resolveShop(req) {
  return String(req.query.shop || req.get('X-Shopify-Shop-Domain') || '');
}

router.post('/', async (req, res) => {
  const shopDomain = resolveShop(req);
  if (!shopDomain) return res.status(400).json({ error: 'missing_shop' });

  const shop = await findShopByDomain(shopDomain);
  if (!shop) return res.status(400).json({ error: 'unknown_shop' });

  const body = typeof req.body === 'object' && req.body ? req.body : {};
  if (!validateCreate(body)) {
    return res.status(422).json({ error: 'invalid_payload', details: validateCreate.errors });
  }

  try {
    const created = await createBasicCodeDiscount({ shopDomain, ...body });
    const applyUrl = buildApplyUrl({
      shopDomain,
      code: created.code,
      redirect: body.redirect || '/cart',
    });

    return res.json({
      ok: true,
      code: created.code,
      title: created.title,
      id: created.id,
      startsAt: created.startsAt,
      endsAt: created.endsAt,
      applyUrl,
    });
  } catch (err) {
    const txt = JSON.stringify(err?.details || err?.message || '');
    // Common Shopify error: code already taken
    if (/already.*taken/i.test(txt) || /code.*unique/i.test(txt)) {
      return res
        .status(409)
        .json({ error: 'code_conflict', details: err?.details || err?.message });
    }
    return res.status(500).json({ error: 'shopify_error', details: err?.details || String(err) });
  }
});

router.get('/apply-url', async (req, res) => {
  const shopDomain = resolveShop(req);
  const code = String(req.query.code || '');
  const redirect = String(req.query.redirect || '/cart');
  if (!shopDomain || !code) return res.status(400).json({ error: 'missing_params' });

  const url = buildApplyUrl({ shopDomain, code, redirect });
  return res.json({ ok: true, url });
});

// Conflict scan with automatic discounts (advisory)
router.get('/conflicts', async (req, res) => {
  const shopDomain = resolveShop(req);
  if (!shopDomain) return res.status(400).json({ error: 'missing_shop' });

  const shop = await findShopByDomain(shopDomain);
  if (!shop) return res.status(400).json({ error: 'unknown_shop' });

  const autos = await scanAutomaticDiscountConflicts({ shopDomain }).catch(() => []);
  res.json({ ok: true, automaticDiscounts: autos });
});

export default router;
