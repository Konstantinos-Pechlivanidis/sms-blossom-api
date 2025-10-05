// src/routes/reports.js
// Reports API routes

import { Router } from 'express';
import { getPrismaClient } from '../db/prismaClient.js';
import { parseRange } from '../lib/dates.js';
import {
  getOverview,
  getCampaignAttribution,
  getAutomationAttribution,
  getMessagingTimeseries,
} from '../services/reports.js';

const prisma = getPrismaClient();
const router = Router();

/**
 * GET /reports/overview?shop=<domain>&from=YYYY-MM-DD&to=YYYY-MM-DD&window=7d
 */
router.get('/overview', async (req, res) => {
  try {
    const shopDomain = String(req.query.shop || '');
    const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
    if (!shop) return res.status(404).json({ error: 'unknown_shop' });

    const { start, end } = parseRange({
      from: req.query.from,
      to: req.query.to,
      window: req.query.window,
    });
    const data = await getOverview({ shopId: shop.id, from: start, to: end });
    res.json({ ok: true, range: { from: start, to: end }, ...data });
  } catch (e) {
    res.status(500).json({ error: 'server_error', details: String(e?.message || e) });
  }
});

/**
 * GET /reports/campaigns?shop=<domain>&from=&to=&window=
 */
router.get('/campaigns', async (req, res) => {
  try {
    const shopDomain = String(req.query.shop || '');
    const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
    if (!shop) return res.status(404).json({ error: 'unknown_shop' });
    const { start, end } = parseRange({
      from: req.query.from,
      to: req.query.to,
      window: req.query.window,
    });
    const items = await getCampaignAttribution({ shopId: shop.id, from: start, to: end });
    res.json({ ok: true, range: { from: start, to: end }, items });
  } catch (e) {
    res.status(500).json({ error: 'server_error', details: String(e?.message || e) });
  }
});

/**
 * GET /reports/automations?shop=<domain>&from=&to=&window=
 */
router.get('/automations', async (req, res) => {
  try {
    const shopDomain = String(req.query.shop || '');
    const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
    if (!shop) return res.status(404).json({ error: 'unknown_shop' });
    const { start, end } = parseRange({
      from: req.query.from,
      to: req.query.to,
      window: req.query.window,
    });
    const ac = await getAutomationAttribution({ shopId: shop.id, from: start, to: end });
    res.json({ ok: true, range: { from: start, to: end }, items: [ac] });
  } catch (e) {
    res.status(500).json({ error: 'server_error', details: String(e?.message || e) });
  }
});

/**
 * GET /reports/messaging/timeseries?shop=<domain>&from=&to=&window=
 */
router.get('/messaging/timeseries', async (req, res) => {
  try {
    const shopDomain = String(req.query.shop || '');
    const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
    if (!shop) return res.status(404).json({ error: 'unknown_shop' });
    const { start, end } = parseRange({
      from: req.query.from,
      to: req.query.to,
      window: req.query.window,
    });
    const series = await getMessagingTimeseries({ shopId: shop.id, from: start, to: end });
    res.json({ ok: true, range: { from: start, to: end }, series });
  } catch (e) {
    res.status(500).json({ error: 'server_error', details: String(e?.message || e) });
  }
});

export default router;
