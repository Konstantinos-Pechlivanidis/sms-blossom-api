// src/middleware/appProxyVerify.js
// Middleware for Shopify App Proxy signed request verification

import { verifyAppProxySignature } from '../lib/appProxyVerify.js';
import { logger } from '../lib/logger.js';

/**
 * Middleware to verify Shopify App Proxy signed requests
 * Rejects with 401 on invalid/missing signature
 * Adds req.proxyShopDomain (lowercased) from signature
 */
export function appProxyVerifyMiddleware(req, res, next) {
  try {
    // Verify the signature
    if (!verifyAppProxySignature(req.query)) {
      logger.warn({ 
        ip: req.ip, 
        userAgent: req.get('user-agent'),
        query: req.query 
      }, 'App Proxy signature verification failed');
      
      return res.status(401).json({ 
        error: 'invalid_signature',
        message: 'Request signature verification failed'
      });
    }

    // Extract and normalize shop domain
    const shopDomain = String(req.query.shop || '').toLowerCase().trim();
    if (!shopDomain) {
      logger.warn({ query: req.query }, 'App Proxy request missing shop parameter');
      return res.status(400).json({ 
        error: 'missing_shop',
        message: 'Shop parameter is required'
      });
    }

    // Attach normalized shop domain to request
    req.proxyShopDomain = shopDomain;
    
    logger.debug({ shopDomain }, 'App Proxy signature verified successfully');
    next();
  } catch (error) {
    logger.error({ error, query: req.query }, 'App Proxy verification error');
    return res.status(500).json({ 
      error: 'verification_error',
      message: 'Internal error during signature verification'
    });
  }
}
