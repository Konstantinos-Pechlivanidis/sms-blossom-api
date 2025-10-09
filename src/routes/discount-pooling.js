import { Router } from 'express';
import { getPrismaClient } from '../db/prismaClient.js';
import { fetchExistingDiscounts, createBasicCode } from '../services/shopify-graphql.js';
import { createLinkBuilder } from '../services/link-builder.js';
import { logger } from '../lib/logger.js';

const prisma = getPrismaClient();
const router = Router();

// Helper to get shop access token
async function getShopAccessToken(shopDomain) {
  const shop = await prisma.shop.findUnique({
    where: { domain: shopDomain }
  });
  
  if (!shop || !shop.tokenOffline) {
    throw new Error('Shop not found or no access token');
  }
  
  // Decrypt the token (simplified - in production use proper encryption)
  return shop.tokenOffline;
}

// POST /discounts/sync-from-shopify
router.post('/sync-from-shopify', async (req, res) => {
  try {
    const { shop } = req.query;
    const { query = '' } = req.body;
    
    if (!shop) {
      return res.status(400).json({ error: 'missing_shop' });
    }

    const accessToken = await getShopAccessToken(shop);
    const shopifyData = await fetchExistingDiscounts({ 
      shopDomain: shop, 
      accessToken, 
      query 
    });

    const discounts = shopifyData.codeDiscountNodes.edges.map(edge => {
      const node = edge.node;
      const discount = node.codeDiscount;
      
      return {
        shopifyGid: node.id,
        code: discount.code,
        title: discount.title,
        status: discount.status,
        startsAt: discount.startsAt,
        endsAt: discount.endsAt,
        usageLimit: discount.usageLimit,
        appliesOncePerCustomer: discount.appliesOncePerCustomer,
        minimumRequirement: discount.minimumRequirement,
        customerSelection: discount.customerSelection,
        combinesWith: discount.combinesWith,
      };
    });

    logger.info({
      shop,
      query,
      count: discounts.length,
    }, 'Synced discounts from Shopify');

    res.json({
      success: true,
      discounts,
      count: discounts.length,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      shop: req.query.shop,
    }, 'Failed to sync discounts from Shopify');
    
    res.status(500).json({
      error: 'sync_failed',
      message: error.message,
    });
  }
});

// POST /discounts/:id/pool/import
router.post('/:id/pool/import', async (req, res) => {
  try {
    const { id } = req.params;
    const { shop } = req.query;
    const { codes } = req.body;
    
    if (!shop) {
      return res.status(400).json({ error: 'missing_shop' });
    }

    if (!codes || !Array.isArray(codes) || codes.length === 0) {
      return res.status(400).json({ error: 'invalid_codes' });
    }

    // Get the discount
    const discount = await prisma.discount.findFirst({
      where: { id, shopId: shop }
    });

    if (!discount) {
      return res.status(404).json({ error: 'discount_not_found' });
    }

    // Create or get the pool
    let pool = await prisma.discountCodePool.findFirst({
      where: { discountId: id }
    });

    if (!pool) {
      pool = await prisma.discountCodePool.create({
        data: {
          shopId: shop,
          discountId: id,
          name: `${discount.title || discount.code} Pool`,
          description: `Code pool for ${discount.code}`,
        }
      });
    }

    // Create discount codes
    const createdCodes = [];
    for (const code of codes) {
      try {
        const discountCode = await prisma.discountCode.create({
          data: {
            shopId: shop,
            poolId: pool.id,
            discountId: id,
            code: code.code || code,
            status: 'available',
          }
        });
        createdCodes.push(discountCode);
      } catch (error) {
        if (error.code === 'P2002') {
          // Duplicate code, skip
          logger.warn({
            code: code.code || code,
            poolId: pool.id,
          }, 'Duplicate discount code skipped');
          continue;
        }
        throw error;
      }
    }

    // Update pool statistics
    await prisma.discountCodePool.update({
      where: { id: pool.id },
      data: {
        totalCodes: {
          increment: createdCodes.length
        }
      }
    });

    logger.info({
      shop,
      discountId: id,
      poolId: pool.id,
      importedCount: createdCodes.length,
    }, 'Imported discount codes to pool');

    res.json({
      success: true,
      poolId: pool.id,
      importedCount: createdCodes.length,
      codes: createdCodes,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      shop: req.query.shop,
      discountId: req.params.id,
    }, 'Failed to import discount codes');
    
    res.status(500).json({
      error: 'import_failed',
      message: error.message,
    });
  }
});

// POST /discounts/:id/pool/generate
router.post('/:id/pool/generate', async (req, res) => {
  try {
    const { id } = req.params;
    const { shop } = req.query;
    const { quantity, prefix = '', pattern = 'random' } = req.body;
    
    if (!shop) {
      return res.status(400).json({ error: 'missing_shop' });
    }

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'invalid_quantity' });
    }

    // Get the discount
    const discount = await prisma.discount.findFirst({
      where: { id, shopId: shop }
    });

    if (!discount) {
      return res.status(404).json({ error: 'discount_not_found' });
    }

    // Create or get the pool
    let pool = await prisma.discountCodePool.findFirst({
      where: { discountId: id }
    });

    if (!pool) {
      pool = await prisma.discountCodePool.create({
        data: {
          shopId: shop,
          discountId: id,
          name: `${discount.title || discount.code} Pool`,
          description: `Code pool for ${discount.code}`,
        }
      });
    }

    // Generate codes
    const generatedCodes = [];
    for (let i = 0; i < quantity; i++) {
      let code;
      let attempts = 0;
      const maxAttempts = 10;

      do {
        if (pattern === 'random') {
          code = prefix + Math.random().toString(36).substring(2, 8).toUpperCase();
        } else if (pattern === 'sequential') {
          code = prefix + String(i + 1).padStart(6, '0');
        } else {
          code = prefix + Math.random().toString(36).substring(2, 8).toUpperCase();
        }
        
        attempts++;
      } while (attempts < maxAttempts);

      try {
        const discountCode = await prisma.discountCode.create({
          data: {
            shopId: shop,
            poolId: pool.id,
            discountId: id,
            code,
            status: 'available',
          }
        });
        generatedCodes.push(discountCode);
      } catch (error) {
        if (error.code === 'P2002') {
          // Duplicate code, try again
          i--;
          continue;
        }
        throw error;
      }
    }

    // Update pool statistics
    await prisma.discountCodePool.update({
      where: { id: pool.id },
      data: {
        totalCodes: {
          increment: generatedCodes.length
        }
      }
    });

    logger.info({
      shop,
      discountId: id,
      poolId: pool.id,
      generatedCount: generatedCodes.length,
    }, 'Generated discount codes for pool');

    res.json({
      success: true,
      poolId: pool.id,
      generatedCount: generatedCodes.length,
      codes: generatedCodes,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      shop: req.query.shop,
      discountId: req.params.id,
    }, 'Failed to generate discount codes');
    
    res.status(500).json({
      error: 'generation_failed',
      message: error.message,
    });
  }
});

// GET /discounts/:id/pool/status
router.get('/:id/pool/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { shop } = req.query;
    
    if (!shop) {
      return res.status(400).json({ error: 'missing_shop' });
    }

    const pool = await prisma.discountCodePool.findFirst({
      where: { 
        discountId: id,
        shopId: shop 
      },
      include: {
        codes: {
          select: {
            status: true,
          }
        }
      }
    });

    if (!pool) {
      return res.status(404).json({ error: 'pool_not_found' });
    }

    // Calculate status
    const statusCounts = pool.codes.reduce((acc, code) => {
      acc[code.status] = (acc[code.status] || 0) + 1;
      return acc;
    }, {});

    const available = statusCounts.available || 0;
    const reserved = statusCounts.reserved || 0;
    const used = statusCounts.used || 0;
    const expired = statusCounts.expired || 0;

    res.json({
      poolId: pool.id,
      total: pool.totalCodes,
      available,
      reserved,
      used,
      expired,
      status: pool.status,
      createdAt: pool.createdAt,
      updatedAt: pool.updatedAt,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      shop: req.query.shop,
      discountId: req.params.id,
    }, 'Failed to get pool status');
    
    res.status(500).json({
      error: 'status_failed',
      message: error.message,
    });
  }
});

// POST /discounts/:id/pool/reserve
router.post('/:id/pool/reserve', async (req, res) => {
  try {
    const { id } = req.params;
    const { shop } = req.query;
    const { campaignId, count } = req.body;
    
    if (!shop) {
      return res.status(400).json({ error: 'missing_shop' });
    }

    if (!campaignId || !count || count <= 0) {
      return res.status(400).json({ error: 'invalid_parameters' });
    }

    const pool = await prisma.discountCodePool.findFirst({
      where: { 
        discountId: id,
        shopId: shop 
      }
    });

    if (!pool) {
      return res.status(404).json({ error: 'pool_not_found' });
    }

    // Check available codes
    const availableCount = await prisma.discountCode.count({
      where: {
        poolId: pool.id,
        status: 'available'
      }
    });

    if (availableCount < count) {
      return res.status(409).json({
        error: 'insufficient_codes',
        available: availableCount,
        requested: count,
      });
    }

    // Create reservation
    const reservation = await prisma.discountCodeReservation.create({
      data: {
        shopId: shop,
        poolId: pool.id,
        campaignId,
        quantity: count,
        status: 'active',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      }
    });

    // Reserve codes
    const codes = await prisma.discountCode.findMany({
      where: {
        poolId: pool.id,
        status: 'available'
      },
      take: count,
      orderBy: {
        createdAt: 'asc'
      }
    });

    await prisma.discountCode.updateMany({
      where: {
        id: {
          in: codes.map(c => c.id)
        }
      },
      data: {
        status: 'reserved',
        reservedAt: new Date(),
        reservationId: reservation.id,
      }
    });

    // Update pool statistics
    await prisma.discountCodePool.update({
      where: { id: pool.id },
      data: {
        reservedCodes: {
          increment: count
        }
      }
    });

    logger.info({
      shop,
      discountId: id,
      poolId: pool.id,
      campaignId,
      reservedCount: count,
    }, 'Reserved discount codes');

    res.json({
      success: true,
      reservationId: reservation.id,
      reservedCount: count,
      codes: codes.map(c => ({
        id: c.id,
        code: c.code,
      })),
      expiresAt: reservation.expiresAt,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      shop: req.query.shop,
      discountId: req.params.id,
    }, 'Failed to reserve discount codes');
    
    res.status(500).json({
      error: 'reservation_failed',
      message: error.message,
    });
  }
});

// DELETE /discounts/:id/pool/reservations/:reservationId
router.delete('/:id/pool/reservations/:reservationId', async (req, res) => {
  try {
    const { id, reservationId } = req.params;
    const { shop } = req.query;
    
    if (!shop) {
      return res.status(400).json({ error: 'missing_shop' });
    }

    const reservation = await prisma.discountCodeReservation.findFirst({
      where: {
        id: reservationId,
        poolId: {
          discount: {
            id: id,
            shopId: shop
          }
        }
      }
    });

    if (!reservation) {
      return res.status(404).json({ error: 'reservation_not_found' });
    }

    // Release reserved codes
    const releasedCount = await prisma.discountCode.updateMany({
      where: {
        reservationId: reservationId,
        status: 'reserved'
      },
      data: {
        status: 'available',
        reservedAt: null,
        reservationId: null,
      }
    });

    // Update pool statistics
    await prisma.discountCodePool.update({
      where: { id: reservation.poolId },
      data: {
        reservedCodes: {
          decrement: releasedCount.count
        }
      }
    });

    // Cancel reservation
    await prisma.discountCodeReservation.update({
      where: { id: reservationId },
      data: {
        status: 'cancelled'
      }
    });

    logger.info({
      shop,
      discountId: id,
      reservationId,
      releasedCount: releasedCount.count,
    }, 'Cancelled discount code reservation');

    res.json({
      success: true,
      releasedCount: releasedCount.count,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      shop: req.query.shop,
      discountId: req.params.id,
      reservationId: req.params.reservationId,
    }, 'Failed to cancel reservation');
    
    res.status(500).json({
      error: 'cancellation_failed',
      message: error.message,
    });
  }
});

export default router;
