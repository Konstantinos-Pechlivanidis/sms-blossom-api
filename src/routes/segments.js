// src/routes/segments.js
// Segments API routes

import { Router } from 'express';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { getPrismaClient } from '../db/prismaClient.js';
import { upsertSegment, previewSegment } from '../services/segments.js';

const prisma = getPrismaClient();
const router = Router();
const ajv = new Ajv({ allErrors: true, removeAdditional: true });
addFormats(ajv);

const schema = {
  type: 'object',
  properties: {
    id: { type: 'string', nullable: true },
    name: { type: 'string', minLength: 2 },
    filterJson: { type: 'object' },
  },
  required: ['name', 'filterJson'],
  additionalProperties: false,
};
const validate = ajv.compile(schema);

// Create/Update
router.post('/', async (req, res) => {
  const shop = await prisma.shop.findUnique({
    where: { domain: String(req.query.shop || '') },
  });
  if (!shop) return res.status(404).json({ error: 'unknown_shop' });

  const body = typeof req.body === 'object' ? req.body : {};
  if (!validate(body))
    return res.status(422).json({ error: 'invalid_payload', details: validate.errors });

  const row = await upsertSegment({
    shopId: shop.id,
    id: body.id || null,
    name: body.name,
    filterJson: body.filterJson,
  });
  res.json({ ok: true, segment: row });
});

// Preview (count + sample)
router.post('/preview', async (req, res) => {
  const shop = await prisma.shop.findUnique({
    where: { domain: String(req.query.shop || '') },
  });
  if (!shop) return res.status(404).json({ error: 'unknown_shop' });

  const body = typeof req.body === 'object' ? req.body : {};
  const limit = Number(req.query.limit || '25');
  const { count, sample } = await previewSegment({
    shopId: shop.id,
    filterJson: body.filterJson || {},
    limit,
  });
  res.json({ ok: true, count, sample });
});

export default router;
