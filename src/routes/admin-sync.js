// src/routes/admin-sync.js
// Admin sync routes for Shopify customers

import { Router } from 'express';
import { getPrismaClient } from '../db/prismaClient.js';
import { shopifyCustomersSync } from '../services/shopify-customers-sync.js';
import { logger } from '../lib/logger.js';

const prisma = getPrismaClient();
const router = Router();

/**
 * POST /admin/sync/customers
 * Trigger customers sync for a shop
 */
router.post('/customers', async (req, res) => {
  const { shopDomain, accessToken, metafieldsConfig } = req.body;

  if (!shopDomain) {
    return res.status(400).json({ error: 'missing_shop_domain' });
  }

  if (!accessToken) {
    return res.status(400).json({ error: 'missing_access_token' });
  }

  try {
    // Get shop from database
    const shop = await prisma.shop.findUnique({
      where: { domain: shopDomain },
    });

    if (!shop) {
      return res.status(404).json({ error: 'shop_not_found' });
    }

    // Start sync in background (async)
    shopifyCustomersSync({
      shopDomain,
      accessToken,
      metafieldsConfig,
    }).catch(error => {
      logger.error(
        { error: error.message, shopDomain },
        'Background customers sync failed',
      );
    });

    res.json({
      ok: true,
      message: 'Customers sync started',
      shopDomain,
    });
  } catch (error) {
    logger.error(
      { error: error.message, shopDomain },
      'Failed to start customers sync',
    );
    
    res.status(500).json({
      error: 'sync_failed',
      message: error.message,
    });
  }
});

/**
 * GET /admin/sync/customers/status
 * Get last sync status for a shop
 */
router.get('/customers/status', async (req, res) => {
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

    // Get contact statistics
    const totalContacts = await prisma.contact.count({
      where: { shopId: shop.id },
    });

    const contactsWithGender = await prisma.contact.count({
      where: { 
        shopId: shop.id,
        gender: { not: 'unknown' },
      },
    });

    const contactsWithAge = await prisma.contact.count({
      where: { 
        shopId: shop.id,
        ageYears: { not: null },
      },
    });

    const contactsWithConversion = await prisma.contact.count({
      where: { 
        shopId: shop.id,
        conversionCount: { gt: 0 },
      },
    });

    res.json({
      ok: true,
      shopDomain,
      stats: {
        totalContacts,
        contactsWithGender,
        contactsWithAge,
        contactsWithConversion,
        genderPercentage: totalContacts > 0 ? Math.round((contactsWithGender / totalContacts) * 100) : 0,
        agePercentage: totalContacts > 0 ? Math.round((contactsWithAge / totalContacts) * 100) : 0,
        conversionPercentage: totalContacts > 0 ? Math.round((contactsWithConversion / totalContacts) * 100) : 0,
      },
    });
  } catch (error) {
    logger.error(
      { error: error.message, shopDomain },
      'Failed to get sync status',
    );
    
    res.status(500).json({
      error: 'status_failed',
      message: error.message,
    });
  }
});

export default router;
