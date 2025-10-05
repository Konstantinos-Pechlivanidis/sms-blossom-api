// src/routes/campaigns.js
// Campaigns API with segments integration

import { Router } from 'express';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { getPrismaClient } from '../db/prismaClient.js';
import { snapshotSegmentToCampaign } from '../services/segments.js';
import { estimateCost } from '../services/cost.js';
import { sendCampaignBatched } from '../services/campaigns-sender.js';
import { renderGateQueueAndSend } from '../services/messages.js';
import { buildCampaignApplyUrl } from '../services/discounts.js';

const prisma = getPrismaClient();
const router = Router();
const ajv = new Ajv({ allErrors: true, removeAdditional: true });
addFormats(ajv);

// Snapshot audience from a segment into CampaignRecipient
router.post('/:id/snapshot', async (req, res) => {
  const shop = await prisma.shop.findUnique({
    where: { domain: String(req.query.shop || '') },
  });
  if (!shop) return res.status(404).json({ error: 'unknown_shop' });
  const id = String(req.params.id);
  const camp = await prisma.campaign.findFirst({ where: { id, shopId: shop.id } });
  if (!camp) return res.status(404).json({ error: 'unknown_campaign' });

  // segmentId optional; or accept filterJson in body
  const segmentId = camp.segmentId || req.body?.segmentId || null;
  let filterJson = {};
  if (segmentId) {
    const seg = await prisma.segment.findFirst({
      where: { id: segmentId, shopId: shop.id },
    });
    if (!seg) return res.status(404).json({ error: 'unknown_segment' });
    filterJson = seg.filterJson || {};
  } else {
    filterJson = (typeof req.body === 'object' && req.body?.filterJson) || {};
  }

  const { total, inserted } = await snapshotSegmentToCampaign({
    shopId: shop.id,
    campaignId: camp.id,
    filterJson,
  });
  res.json({ ok: true, total, inserted });
});

// Estimate cost for campaign template (or text)
router.get('/:id/estimate', async (req, res) => {
  const shop = await prisma.shop.findUnique({
    where: { domain: String(req.query.shop || '') },
  });
  if (!shop) return res.status(404).json({ error: 'unknown_shop' });
  const id = String(req.params.id);
  const camp = await prisma.campaign.findFirst({ where: { id, shopId: shop.id } });
  if (!camp) return res.status(404).json({ error: 'unknown_campaign' });

  const pending = await prisma.campaignRecipient.count({
    where: { shopId: shop.id, campaignId: camp.id, status: 'pending' },
  });
  const body = camp.bodyText || `{{ shop.name }}: ${camp.name || 'Campaign'}`; // fallback if no template body stored here
  const est = estimateCost({ recipients: pending, body });
  res.json({ ok: true, recipients: pending, ...est });
});

// Test send to a specific phone (E.164) without affecting snapshot
router.post('/:id/test-send', async (req, res) => {
  const shop = await prisma.shop.findUnique({
    where: { domain: String(req.query.shop || '') },
  });
  if (!shop) return res.status(404).json({ error: 'unknown_shop' });
  const id = String(req.params.id);
  const camp = await prisma.campaign.findFirst({ where: { id, shopId: shop.id } });
  if (!camp) return res.status(404).json({ error: 'unknown_campaign' });
  const phone = String(req.body?.phone || '').trim();
  if (!phone) return res.status(422).json({ error: 'missing_phone' });

  // Try to match a contact to apply rules; else treat as ad-hoc contact with opted-in state
  const contact = await prisma.contact.findFirst({
    where: { shopId: shop.id, phoneE164: phone },
  });
  if (!contact) return res.status(404).json({ error: 'unknown_contact' });

  const result = await renderGateQueueAndSend({
    shop,
    contact,
    phoneE164: contact.phoneE164,
    templateKey: camp.templateKey || 'campaign',
    vars: { campaign: { id: camp.id, name: camp.name || 'Campaign' } },
    kind: 'campaign',
    triggerKey: `campaign:${camp.id}`,
    dedupeKey: `test:${camp.id}:${contact.id}`,
  });
  res.json({ ok: true, result });
});

// Send now (batched + throttled) — requires prior snapshot
router.post('/:id/send-now', async (req, res) => {
  const shop = await prisma.shop.findUnique({
    where: { domain: String(req.query.shop || '') },
  });
  if (!shop) return res.status(404).json({ error: 'unknown_shop' });
  const id = String(req.params.id);
  const camp = await prisma.campaign.findFirst({ where: { id, shopId: shop.id } });
  if (!camp) return res.status(404).json({ error: 'unknown_campaign' });
  const result = await sendCampaignBatched({ shop, campaign: camp });
  res.json({ ok: true, ...result });
});

// Attach a discount to a campaign (by discountId or code in DB)
router.post('/:id/attach-discount', async (req, res) => {
  const shop = await prisma.shop.findUnique({
    where: { domain: String(req.query.shop || '') },
  });
  if (!shop) return res.status(404).json({ error: 'unknown_shop' });
  const id = String(req.params.id);
  const camp = await prisma.campaign.findFirst({ where: { id, shopId: shop.id } });
  if (!camp) return res.status(404).json({ error: 'unknown_campaign' });

  const { discountId, code } = (typeof req.body === 'object' && req.body) || {};
  let disc = null;
  if (discountId)
    disc = await prisma.discount.findFirst({
      where: { id: String(discountId), shopId: shop.id },
    });
  if (!disc && code)
    disc = await prisma.discount.findFirst({
      where: { code: String(code), shopId: shop.id },
    });
  if (!disc) return res.status(404).json({ error: 'discount_not_found' });

  await prisma.campaign.update({
    where: { id: camp.id },
    data: { discountId: disc.id },
  });
  res.json({ ok: true, campaignId: camp.id, discountId: disc.id });
});

router.post('/:id/detach-discount', async (req, res) => {
  const shop = await prisma.shop.findUnique({
    where: { domain: String(req.query.shop || '') },
  });
  if (!shop) return res.status(404).json({ error: 'unknown_shop' });
  const id = String(req.params.id);
  const camp = await prisma.campaign.findFirst({ where: { id, shopId: shop.id } });
  if (!camp) return res.status(404).json({ error: 'unknown_campaign' });
  await prisma.campaign.update({
    where: { id: camp.id },
    data: { discountId: null },
  });
  res.json({ ok: true });
});

// Set UTM for a campaign
router.put('/:id/utm', async (req, res) => {
  const shop = await prisma.shop.findUnique({
    where: { domain: String(req.query.shop || '') },
  });
  if (!shop) return res.status(404).json({ error: 'unknown_shop' });
  const id = String(req.params.id);
  const camp = await prisma.campaign.findFirst({ where: { id, shopId: shop.id } });
  if (!camp) return res.status(404).json({ error: 'unknown_campaign' });
  const utmJson = (typeof req.body === 'object' && req.body) || {};
  await prisma.campaign.update({ where: { id: camp.id }, data: { utmJson } });
  res.json({ ok: true, utm: utmJson });
});

// Get a preview of discount apply URL for a campaign
router.get('/:id/apply-url', async (req, res) => {
  const shop = await prisma.shop.findUnique({
    where: { domain: String(req.query.shop || '') },
  });
  if (!shop) return res.status(404).json({ error: 'unknown_shop' });
  const id = String(req.params.id);
  const camp = await prisma.campaign.findFirst({ where: { id, shopId: shop.id } });
  if (!camp) return res.status(404).json({ error: 'unknown_campaign' });

  if (!camp.discountId) return res.status(422).json({ error: 'campaign_has_no_discount' });
  const disc = await prisma.discount.findFirst({
    where: { id: camp.discountId, shopId: shop.id },
  });
  if (!disc?.code) return res.status(404).json({ error: 'discount_not_found' });
  const redirect = String(req.query.redirect || '/checkout');
  const { url, short } = await buildCampaignApplyUrl({
    shopId: shop.id,
    shopDomain: shop.domain,
    code: disc.code,
    redirect,
    utm: camp.utmJson || {},
    short: !!req.query.short,
    campaignId: camp.id,
  });
  res.json({ ok: true, url, short });
});

export default router;
