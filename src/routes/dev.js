// src/routes/dev.js
// Development helpers for testing abandoned checkout flow

import { Router } from 'express';
import { getPrismaClient } from '../db/prismaClient.js';
import { dispatchEvent } from '../queue/dispatcher.js';

const router = Router();
const prisma = getPrismaClient();

function assertDev(req, res) {
  if (process.env.NODE_ENV === 'production') {
    res.status(403).json({ error: 'dev_only' });
    return false;
  }
  return true;
}

// Trigger orders/paid via dispatcher
// POST /dev/trigger/orders-paid { shop, customerId, orderName? }
router.post('/trigger/orders-paid', async (req, res) => {
  if (!assertDev(req, res)) return;
  const shopDomain = String(req.body?.shop || '');
  const customerId = String(req.body?.customerId || '');
  const orderName = String(req.body?.orderName || 'TEST-ORDER-123');

  const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop) return res.status(404).json({ error: 'unknown_shop' });
  if (!customerId) return res.status(400).json({ error: 'missing_customerId' });

  const payload = { customer: { id: customerId }, name: orderName };
  await dispatchEvent({ topic: 'orders/paid', shopDomain, shopId: shop.id, payload });
  res.json({ ok: true, triggered: 'orders/paid', shop: shopDomain, customerId, orderName });
});

// Trigger checkouts/update (simulate a live checkout heartbeat)
// POST /dev/trigger/checkouts-update { shop, token, customerId?, email?, recoveryUrl? }
router.post('/trigger/checkouts-update', async (req, res) => {
  if (!assertDev(req, res)) return;
  const shopDomain = String(req.body?.shop || '');
  const token = String(req.body?.token || '');
  const customerId = req.body?.customerId ? String(req.body.customerId) : null;
  const email = req.body?.email ? String(req.body.email) : null;
  const recoveryUrl = req.body?.recoveryUrl ? String(req.body.recoveryUrl) : null;

  const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop) return res.status(404).json({ error: 'unknown_shop' });
  if (!token) return res.status(400).json({ error: 'missing_token' });

  const payload = { token, customer_id: customerId, email, recovery_url: recoveryUrl };
  await dispatchEvent({ topic: 'checkouts/update', shopDomain, shopId: shop.id, payload });
  res.json({ ok: true, triggered: 'checkouts/update', token });
});

// List jobs for a shop
// GET /dev/jobs?shop=<store>.myshopify.com
router.get('/jobs', async (req, res) => {
  if (!assertDev(req, res)) return;
  const shopDomain = String(req.query.shop || '');
  const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop) return res.status(404).json({ error: 'unknown_shop' });
  const jobs = await prisma.job.findMany({ where: { shopId: shop.id }, orderBy: { runAt: 'asc' } });
  res.json(jobs);
});

// Simulate GDPR webhooks (no HMAC needed in dev)
router.post('/trigger/gdpr/data-request', async (req, res) => {
  if (!assertDev(req, res)) return;
  const shop = String(req.body?.shop || '');
  const customerId = String(req.body?.customerId || '');
  const shopRow = await prisma.shop.findUnique({ where: { domain: shop } });
  if (!shopRow) return res.status(404).json({ error: 'unknown_shop' });
  const payload = { customer: { id: customerId } };
  await dispatchEvent({
    topic: 'customers/data_request',
    shopDomain: shop,
    shopId: shopRow.id,
    payload,
  });
  res.json({ ok: true });
});

router.post('/trigger/gdpr/customer-redact', async (req, res) => {
  if (!assertDev(req, res)) return;
  const shop = String(req.body?.shop || '');
  const customerId = String(req.body?.customerId || '');
  const email = req.body?.email || null;
  const phone = req.body?.phone || null;
  const shopRow = await prisma.shop.findUnique({ where: { domain: shop } });
  if (!shopRow) return res.status(404).json({ error: 'unknown_shop' });
  const payload = { customer: { id: customerId, email, phone } };
  await dispatchEvent({ topic: 'customers/redact', shopDomain: shop, shopId: shopRow.id, payload });
  res.json({ ok: true });
});

router.post('/trigger/gdpr/shop-redact', async (req, res) => {
  if (!assertDev(req, res)) return;
  const shop = String(req.body?.shop || '');
  const shopRow = await prisma.shop.findUnique({ where: { domain: shop } });
  if (!shopRow) return res.status(404).json({ error: 'unknown_shop' });
  const payload = { shop_domain: shop };
  await dispatchEvent({ topic: 'shop/redact', shopDomain: shop, shopId: shopRow.id, payload });
  res.json({ ok: true });
});

// View audit logs
router.get('/audit', async (req, res) => {
  if (!assertDev(req, res)) return;
  const shop = String(req.query.shop || '');
  const shopRow = await prisma.shop.findUnique({ where: { domain: shop } });
  if (!shopRow) return res.status(404).json({ error: 'unknown_shop' });
  const logs = await prisma.auditLog.findMany({
    where: { shopId: shopRow.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(logs);
});

export default router;
