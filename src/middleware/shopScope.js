// src/middleware/shopScope.js
// Shop scoping middleware

import { getPrismaClient } from '../db/prismaClient.js';
import { logger } from '../lib/logger.js';

const prisma = getPrismaClient();

/**
 * Resolve shop information and attach to request
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function
 */
export function shopScopingMiddleware(req, res, next) {
  try {
    let shopDomain = null;

    // Try to get shop domain from different sources
    if (req.auth?.shop_domain) {
      // From JWT token
      shopDomain = req.auth.shop_domain;
    } else if (req.get('X-Shop-Domain')) {
      // From header
      shopDomain = req.get('X-Shop-Domain');
    } else if (req.query.shop) {
      // From query parameter
      shopDomain = req.query.shop;
    }

    if (!shopDomain) {
      return res.status(400).json({ 
        error: 'missing_shop_domain',
        message: 'Shop domain is required'
      });
    }

    // Normalize shop domain
    shopDomain = shopDomain.toLowerCase().trim();

    // Load shop from database
    prisma.shop.findUnique({ 
      where: { domain: shopDomain },
      select: {
        id: true,
        domain: true,
        name: true,
        timezone: true,
        locale: true,
        settingsJson: true
      }
    })
    .then(shop => {
      if (!shop) {
        logger.warn({ shopDomain }, 'Shop not found in database');
        return res.status(409).json({ 
          error: 'shop_not_installed',
          message: 'Shop is not installed or not found',
          install_url: `${process.env.APP_URL}/auth/install?shop=${shopDomain}`
        });
      }

      // Attach shop info to request
      req.shop = {
        id: shop.id,
        domain: shop.domain,
        name: shop.name,
        timezone: shop.timezone || 'UTC',
        locale: shop.locale || 'en-US',
        settings: shop.settingsJson || {}
      };

      logger.debug({ 
        shopId: shop.id, 
        shopDomain: shop.domain 
      }, 'Shop scoping successful');
      
      next();
    })
    .catch(error => {
      logger.error({ error, shopDomain }, 'Failed to load shop');
      return res.status(500).json({ 
        error: 'internal_error',
        message: 'Failed to load shop information'
      });
    });

  } catch (error) {
    logger.error({ error }, 'Shop scoping middleware error');
    return res.status(500).json({ 
      error: 'internal_error',
      message: 'Internal server error'
    });
  }
}
