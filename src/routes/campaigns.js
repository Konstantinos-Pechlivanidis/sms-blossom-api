// src/routes/campaigns.js
// Campaigns API with segments integration

import { Router } from 'express';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { getPrismaClient } from '../db/prismaClient.js';
import {
  createCampaign,
  getCampaign,
  listCampaigns,
  snapshotCampaignAudience,
  estimateCampaign,
  testSendCampaign,
  sendCampaign,
  attachDiscountToCampaign,
  detachDiscountFromCampaign,
  setCampaignUtm,
  getCampaignApplyUrl,
} from '../services/campaigns-service.js';

const prisma = getPrismaClient();
const router = Router();
const ajv = new Ajv({ allErrors: true, removeAdditional: true });
addFormats(ajv);

// Helper function to resolve shop
function resolveShop(req) {
  return String(req.query.shop || req.get('X-Shopify-Shop-Domain') || '');
}

// Create campaign
router.post('/', async (req, res) => {
  const shopDomain = resolveShop(req);
  if (!shopDomain) return res.status(400).json({ error: 'missing_shop' });

  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
  });
  if (!shop) return res.status(400).json({ error: 'unknown_shop' });

  try {
    const result = await createCampaign({
      shopId: shop.id,
      ...req.body,
    });
    res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'create_campaign_error', details: err.message });
  }
});

// Get campaign
router.get('/:id', async (req, res) => {
  const shopDomain = resolveShop(req);
  if (!shopDomain) return res.status(400).json({ error: 'missing_shop' });

  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
  });
  if (!shop) return res.status(400).json({ error: 'unknown_shop' });

  try {
    const result = await getCampaign({
      shopId: shop.id,
      campaignId: req.params.id,
    });
    res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'get_campaign_error', details: err.message });
  }
});

// List campaigns
router.get('/', async (req, res) => {
  const shopDomain = resolveShop(req);
  if (!shopDomain) return res.status(400).json({ error: 'missing_shop' });

  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
  });
  if (!shop) return res.status(400).json({ error: 'unknown_shop' });

  try {
    const result = await listCampaigns({
      shopId: shop.id,
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0,
      status: req.query.status,
    });
    res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'list_campaigns_error', details: err.message });
  }
});

// Snapshot audience from a segment into CampaignRecipient
router.post('/:id/snapshot', async (req, res) => {
  const shopDomain = resolveShop(req);
  if (!shopDomain) return res.status(400).json({ error: 'missing_shop' });

  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
  });
  if (!shop) return res.status(400).json({ error: 'unknown_shop' });

  try {
    const result = await snapshotCampaignAudience({
      shopId: shop.id,
      campaignId: req.params.id,
    });
    res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'snapshot_campaign_error', details: err.message });
  }
});

// Estimate cost for campaign template (or text)
router.get('/:id/estimate', async (req, res) => {
  const shopDomain = resolveShop(req);
  if (!shopDomain) return res.status(400).json({ error: 'missing_shop' });

  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
  });
  if (!shop) return res.status(400).json({ error: 'unknown_shop' });

  try {
    const result = await estimateCampaign({
      shopId: shop.id,
      campaignId: req.params.id,
    });
    res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'estimate_campaign_error', details: err.message });
  }
});

// Test send to a specific phone (E.164) without affecting snapshot
router.post('/:id/test-send', async (req, res) => {
  const shopDomain = resolveShop(req);
  if (!shopDomain) return res.status(400).json({ error: 'missing_shop' });

  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
  });
  if (!shop) return res.status(400).json({ error: 'unknown_shop' });

  const phone = String(req.body?.phone || '').trim();
  if (!phone) return res.status(422).json({ error: 'missing_phone' });

  try {
    const result = await testSendCampaign({
      shopId: shop.id,
      campaignId: req.params.id,
      phoneE164: phone,
    });
    res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'test_send_campaign_error', details: err.message });
  }
});

// Send now (batched + throttled) — requires prior snapshot
router.post('/:id/send-now', async (req, res) => {
  const shopDomain = resolveShop(req);
  if (!shopDomain) return res.status(400).json({ error: 'missing_shop' });

  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
  });
  if (!shop) return res.status(400).json({ error: 'unknown_shop' });

  try {
    const result = await sendCampaign({
      shopId: shop.id,
      campaignId: req.params.id,
    });
    res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'send_campaign_error', details: err.message });
  }
});

// Attach a discount to a campaign (by discountId or code in DB)
router.post('/:id/attach-discount', async (req, res) => {
  const shopDomain = resolveShop(req);
  if (!shopDomain) return res.status(400).json({ error: 'missing_shop' });

  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
  });
  if (!shop) return res.status(400).json({ error: 'unknown_shop' });

  const { discountId } = req.body;
  if (!discountId) return res.status(422).json({ error: 'missing_discount_id' });

  try {
    const result = await attachDiscountToCampaign({
      shopId: shop.id,
      campaignId: req.params.id,
      discountId,
    });
    res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'attach_discount_error', details: err.message });
  }
});

// Detach discount from campaign
router.post('/:id/detach-discount', async (req, res) => {
  const shopDomain = resolveShop(req);
  if (!shopDomain) return res.status(400).json({ error: 'missing_shop' });

  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
  });
  if (!shop) return res.status(400).json({ error: 'unknown_shop' });

  try {
    const result = await detachDiscountFromCampaign({
      shopId: shop.id,
      campaignId: req.params.id,
    });
    res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'detach_discount_error', details: err.message });
  }
});

// Set UTM for a campaign
router.put('/:id/utm', async (req, res) => {
  const shopDomain = resolveShop(req);
  if (!shopDomain) return res.status(400).json({ error: 'missing_shop' });

  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
  });
  if (!shop) return res.status(400).json({ error: 'unknown_shop' });

  const utmJson = req.body || {};
  if (!utmJson || typeof utmJson !== 'object') {
    return res.status(422).json({ error: 'invalid_utm_json' });
  }

  try {
    const result = await setCampaignUtm({
      shopId: shop.id,
      campaignId: req.params.id,
      utmJson,
    });
    res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'set_utm_error', details: err.message });
  }
});

// Get a preview of discount apply URL for a campaign
router.get('/:id/apply-url', async (req, res) => {
  const shopDomain = resolveShop(req);
  if (!shopDomain) return res.status(400).json({ error: 'missing_shop' });

  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain },
  });
  if (!shop) return res.status(400).json({ error: 'unknown_shop' });

  try {
    const result = await getCampaignApplyUrl({
      shopId: shop.id,
      campaignId: req.params.id,
    });
    res.json(result);
  } catch (err) {
    return res.status(500).json({ error: 'get_apply_url_error', details: err.message });
  }
});

export default router;
