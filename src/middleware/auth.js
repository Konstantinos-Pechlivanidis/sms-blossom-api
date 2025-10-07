// src/middleware/auth.js
// JWT and session authentication middleware

import jwt from 'jsonwebtoken';
import { logger } from '../lib/logger.js';
import { getPrismaClient } from '../db/prismaClient.js';

const _prisma = getPrismaClient();

/**
 * Verify JWT token and extract claims
 */
function verifyJwtToken(token) {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }

    const decoded = jwt.verify(token, secret);
    return {
      valid: true,
      claims: decoded,
    };
  } catch (error) {
    logger.warn({ error: error.message }, 'JWT verification failed');
    return {
      valid: false,
      error: error.message,
    };
  }
}

/**
 * Verify Shopify session token
 */
async function verifyShopifySession(token) {
  try {
    // In a real implementation, you would verify the session token
    // with Shopify's session verification endpoint
    // For now, we'll assume it's valid if it exists
    if (!token) {
      return { valid: false, error: 'No session token provided' };
    }

    // Mock verification - in production, call Shopify's session verification API
    const sessionData = {
      shop: 'test-shop.myshopify.com',
      user: 'admin@test-shop.com',
      expires: Date.now() + 3600000, // 1 hour
    };

    return {
      valid: true,
      session: sessionData,
    };
  } catch (error) {
    logger.warn({ error: error.message }, 'Shopify session verification failed');
    return {
      valid: false,
      error: error.message,
    };
  }
}

/**
 * Authentication middleware
 * Supports both JWT tokens and Shopify session tokens
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.get('Authorization');
  const requestId = req.get('X-Request-ID');

  logger.info(
    {
      requestId,
      path: req.path,
      method: req.method,
      hasAuthHeader: !!authHeader,
    },
    'Authentication middleware processing',
  );

  if (!authHeader) {
    logger.warn({ requestId, path: req.path }, 'Missing Authorization header');
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Authorization header required',
    });
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    logger.warn({ requestId, scheme, hasToken: !!token }, 'Invalid Authorization header format');
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Invalid Authorization header format',
    });
  }

  // Try JWT verification first
  const jwtResult = verifyJwtToken(token);
  if (jwtResult.valid) {
    req.auth = {
      type: 'jwt',
      shop_domain: jwtResult.claims.shop_domain,
      user_id: jwtResult.claims.user_id,
      exp: jwtResult.claims.exp,
      iat: jwtResult.claims.iat,
    };

    logger.info(
      {
        requestId,
        shop_domain: req.auth.shop_domain,
        user_id: req.auth.user_id,
        auth_type: 'jwt',
      },
      'JWT authentication successful',
    );

    return next();
  }

  // Try Shopify session verification
  verifyShopifySession(token)
    .then((sessionResult) => {
      if (sessionResult.valid) {
        req.auth = {
          type: 'shopify_session',
          shop_domain: sessionResult.session.shop,
          user_id: sessionResult.session.user,
          expires: sessionResult.session.expires,
        };

        logger.info(
          {
            requestId,
            shop_domain: req.auth.shop_domain,
            user_id: req.auth.user_id,
            auth_type: 'shopify_session',
          },
          'Shopify session authentication successful',
        );

        return next();
      }

      logger.warn(
        {
          requestId,
          jwtError: jwtResult.error,
          sessionError: sessionResult.error,
        },
        'All authentication methods failed',
      );

      return res.status(401).json({
        error: 'unauthorized',
        message: 'Invalid or expired token',
      });
    })
    .catch((error) => {
      logger.error({ requestId, error: error.message }, 'Authentication middleware error');

      return res.status(500).json({
        error: 'internal_error',
        message: 'Authentication service unavailable',
      });
    });
}

/**
 * Optional authentication middleware
 * Sets req.auth if token is present, but doesn't require it
 */
export function optionalAuthMiddleware(req, res, next) {
  const authHeader = req.get('Authorization');
  const _requestId = req.get('X-Request-ID');

  if (!authHeader) {
    req.auth = null;
    return next();
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    req.auth = null;
    return next();
  }

  // Try JWT verification
  const jwtResult = verifyJwtToken(token);
  if (jwtResult.valid) {
    req.auth = {
      type: 'jwt',
      shop_domain: jwtResult.claims.shop_domain,
      user_id: jwtResult.claims.user_id,
      exp: jwtResult.claims.exp,
      iat: jwtResult.claims.iat,
    };
    return next();
  }

  // Try Shopify session verification
  verifyShopifySession(token)
    .then((sessionResult) => {
      if (sessionResult.valid) {
        req.auth = {
          type: 'shopify_session',
          shop_domain: sessionResult.session.shop,
          user_id: sessionResult.session.user,
          expires: sessionResult.session.expires,
        };
      } else {
        req.auth = null;
      }
      return next();
    })
    .catch(() => {
      req.auth = null;
      return next();
    });
}

/**
 * Generate JWT token for a shop
 */
export function generateJwtToken(shop_domain, user_id = null, expiresIn = '24h') {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }

  const payload = {
    shop_domain,
    user_id,
    iat: Math.floor(Date.now() / 1000),
  };

  return jwt.sign(payload, secret, { expiresIn });
}
