// src/routes/admin-system-segments.js
// Admin system segments routes

import { Router } from 'express';
import { getPrismaClient } from '../db/prismaClient.js';
import { createSystemSegments, getSystemSegments, deleteSystemSegments } from '../services/system-segments.js';
import { logger } from '../lib/logger.js';

const prisma = getPrismaClient();
const router = Router();

/**
 * POST /admin/system-segments/refresh
 * Create or update all system segments for a shop
 */
router.post('/refresh', async (req, res) => {
  const { shopDomain } = req.body;

  if (!shopDomain) {
    return res.status(400).json({ error: 'missing_shop_domain' });
  }

  try {
    // Get shop from database
    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
    });

    if (!shop) {
      return res.status(404).json({ error: 'shop_not_found' });
    }

    // Create system segments
    const result = await createSystemSegments(shop.id);

    res.json({
      ok: true,
      message: 'System segments refreshed',
      shopDomain,
      result,
    });
  } catch (error) {
    logger.error(
      { error: error.message, shopDomain },
      'Failed to refresh system segments',
    );
    
    res.status(500).json({
      error: 'refresh_failed',
      message: error.message,
    });
  }
});

/**
 * GET /admin/system-segments
 * Get system segments for a shop
 */
router.get('/', async (req, res) => {
  const { shopDomain } = req.query;

  if (!shopDomain) {
    return res.status(400).json({ error: 'missing_shop_domain' });
  }

  try {
    // Get shop from database
    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
    });

    if (!shop) {
      return res.status(404).json({ error: 'shop_not_found' });
    }

    // Get system segments
    const segments = await getSystemSegments(shop.id);

    res.json({
      ok: true,
      shopDomain,
      segments,
    });
  } catch (error) {
    logger.error(
      { error: error.message, shopDomain },
      'Failed to get system segments',
    );
    
    res.status(500).json({
      error: 'get_failed',
      message: error.message,
    });
  }
});

/**
 * DELETE /admin/system-segments
 * Delete all system segments for a shop
 */
router.delete('/', async (req, res) => {
  const { shopDomain } = req.body;

  if (!shopDomain) {
    return res.status(400).json({ error: 'missing_shop_domain' });
  }

  try {
    // Get shop from database
    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
    });

    if (!shop) {
      return res.status(404).json({ error: 'shop_not_found' });
    }

    // Delete system segments
    const deletedCount = await deleteSystemSegments(shop.id);

    res.json({
      ok: true,
      message: 'System segments deleted',
      shopDomain,
      deletedCount,
    });
  } catch (error) {
    logger.error(
      { error: error.message, shopDomain },
      'Failed to delete system segments',
    );
    
    res.status(500).json({
      error: 'delete_failed',
      message: error.message,
    });
  }
});

export default router;
