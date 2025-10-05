// src/routes/settings.js
// Shop settings management (timezone, quiet hours, frequency caps)

import { Router } from 'express';
import Ajv from 'ajv';
import { getPrismaClient } from '../db/prismaClient.js';
import { defaultSettings } from '../services/rules.js';

const prisma = getPrismaClient();
const router = Router();
const ajv = new Ajv({
  allErrors: true,
  removeAdditional: true,
  useDefaults: true,
  coerceTypes: true,
});

const schema = {
  type: 'object',
  properties: {
    timezone: { type: 'string', nullable: true },
    quietHours: {
      type: 'object',
      properties: {
        start: { type: 'integer', minimum: 0, maximum: 23 },
        end: { type: 'integer', minimum: 0, maximum: 23 },
      },
      required: ['start', 'end'],
      additionalProperties: false,
    },
    cap: {
      type: 'object',
      properties: {
        windowHours: { type: 'integer', minimum: 1, default: 24 },
        maxPerWindow: { type: 'integer', minimum: 1, default: 1 },
      },
      required: ['windowHours', 'maxPerWindow'],
      additionalProperties: false,
    },
    abandoned: {
      type: 'object',
      properties: {
        delayMinutes: { type: 'integer', minimum: 5, maximum: 1440, default: 30 },
      },
      required: ['delayMinutes'],
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};
const validate = ajv.compile(schema);

function resolveShop(req) {
  return String(req.query.shop || req.get('X-Shopify-Shop-Domain') || '');
}

router.get('/', async (req, res) => {
  const domain = resolveShop(req);
  if (!domain) return res.status(400).json({ error: 'missing_shop' });
  const shop = await prisma.shop.findUnique({ where: { domain } });
  if (!shop) return res.status(404).json({ error: 'unknown_shop' });

  const settings = {
    timezone: shop.timezone || 'Europe/Athens',
    ...(shop.settingsJson || defaultSettings()),
  };
  res.json({ ok: true, shop: domain, settings });
});

router.put('/', async (req, res) => {
  const domain = resolveShop(req);
  if (!domain) return res.status(400).json({ error: 'missing_shop' });
  const shop = await prisma.shop.findUnique({ where: { domain } });
  if (!shop) return res.status(404).json({ error: 'unknown_shop' });

  const body = typeof req.body === 'object' && req.body ? req.body : {};
  if (!validate(body))
    return res.status(422).json({ error: 'invalid_payload', details: validate.errors });

  const data = {
    ...(typeof body.timezone === 'string' ? { timezone: body.timezone } : {}),
    settingsJson: {
      ...(shop.settingsJson || defaultSettings()),
      ...(body.quietHours ? { quietHours: body.quietHours } : {}),
      ...(body.cap ? { cap: body.cap } : {}),
      ...(body.abandoned ? { abandoned: body.abandoned } : {}),
    },
  };

  const updated = await prisma.shop.update({ where: { id: shop.id }, data });
  res.json({
    ok: true,
    shop: domain,
    settings: { timezone: updated.timezone, ...(updated.settingsJson || {}) },
  });
});

export default router;
