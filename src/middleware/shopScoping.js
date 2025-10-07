import { prisma } from '../db/prismaClient.js';
import { logger } from '../services/logger.js';

/**
 * Shop scoping middleware that resolves and attaches shop information to the request.
 *
 * Resolves shop from:
 * 1. JWT token claims (dest field)
 * 2. X-Shop-Domain header
 * 3. ?shop query parameter
 *
 * Attaches req.shop with { id, domain, tz, locale }
 * Returns 409 if shop is not installed
 */
export function shopScopingMiddleware() {
  return async (req, res, next) => {
    try {
      let shopDomain = null;

      // 1. Try to get shop domain from JWT token claims
      if (req.auth?.dest) {
        shopDomain = req.auth.dest;
      }

      // 2. Try X-Shop-Domain header
      if (!shopDomain && req.headers['x-shop-domain']) {
        shopDomain = req.headers['x-shop-domain'];
      }

      // 3. Try ?shop query parameter
      if (!shopDomain && req.query.shop) {
        shopDomain = req.query.shop;
      }

      if (!shopDomain) {
        return res.status(400).json({
          error: 'shop_domain_required',
          message: 'Shop domain must be provided via token, header, or query parameter',
        });
      }

      // Normalize shop domain (remove protocol, www, trailing slash)
      shopDomain = shopDomain
        .replace(/^https?:\/\//, '')
        .replace(/^www\./, '')
        .replace(/\/$/, '')
        .toLowerCase();

      // Load shop from database
      const shop = await prisma.shop.findUnique({
        where: { domain: shopDomain },
        select: {
          id: true,
          domain: true,
          timezone: true,
          locale: true,
          installed: true,
          accessToken: true,
        },
      });

      if (!shop) {
        logger.warn('Shop not found', {
          shop_domain: shopDomain,
          request_id: req.headers['x-request-id'],
        });

        return res.status(409).json({
          error: 'shop_not_installed',
          message: 'Shop is not installed or not found',
          install_url: `${process.env.APP_URL}/install?shop=${encodeURIComponent(shopDomain)}`,
        });
      }

      if (!shop.installed) {
        logger.warn('Shop not installed', {
          shop_domain: shopDomain,
          shop_id: shop.id,
          request_id: req.headers['x-request-id'],
        });

        return res.status(409).json({
          error: 'shop_not_installed',
          message: 'Shop is not installed',
          install_url: `${process.env.APP_URL}/install?shop=${encodeURIComponent(shopDomain)}`,
        });
      }

      // Attach shop to request
      req.shop = {
        id: shop.id,
        domain: shop.domain,
        tz: shop.timezone || 'UTC',
        locale: shop.locale || 'en',
      };

      // Add shop context to logger
      req.logger = logger.child({
        shop_id: shop.id,
        shop_domain: shop.domain,
      });

      next();
    } catch (error) {
      logger.error('Shop scoping error', {
        error: error.message,
        shop_domain: req.headers['x-shop-domain'] || req.query.shop,
        request_id: req.headers['x-request-id'],
      });

      return res.status(500).json({
        error: 'server_error',
        message: 'Internal server error during shop resolution',
      });
    }
  };
}

/**
 * Optional shop scoping - doesn't fail if shop is not found
 */
export function optionalShopScopingMiddleware() {
  return async (req, res, next) => {
    try {
      let shopDomain = null;

      // Try to get shop domain from various sources
      if (req.auth?.dest) {
        shopDomain = req.auth.dest;
      } else if (req.headers['x-shop-domain']) {
        shopDomain = req.headers['x-shop-domain'];
      } else if (req.query.shop) {
        shopDomain = req.query.shop;
      }

      if (shopDomain) {
        // Normalize shop domain
        shopDomain = shopDomain
          .replace(/^https?:\/\//, '')
          .replace(/^www\./, '')
          .replace(/\/$/, '')
          .toLowerCase();

        // Load shop from database
        const shop = await prisma.shop.findUnique({
          where: { domain: shopDomain },
          select: {
            id: true,
            domain: true,
            timezone: true,
            locale: true,
            installed: true,
          },
        });

        if (shop && shop.installed) {
          req.shop = {
            id: shop.id,
            domain: shop.domain,
            tz: shop.timezone || 'UTC',
            locale: shop.locale || 'en',
          };

          req.logger = logger.child({
            shop_id: shop.id,
            shop_domain: shop.domain,
          });
        }
      }

      next();
    } catch (error) {
      logger.error('Optional shop scoping error', {
        error: error.message,
        request_id: req.headers['x-request-id'],
      });

      // Continue without shop context
      next();
    }
  };
}
