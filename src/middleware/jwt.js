// src/middleware/jwt.js
// JWT verification middleware

import jwt from 'jsonwebtoken';
import { logger } from '../lib/logger.js';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

/**
 * Verify JWT token and attach user info to request
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function
 */
export function jwtVerifyMiddleware(req, res, next) {
  try {
    const authHeader = req.get('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'missing_token',
        message: 'Authorization header with Bearer token is required'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Attach user info to request
      req.auth = {
        shop_domain: decoded.shop_domain,
        sub: decoded.sub,
        iat: decoded.iat,
        exp: decoded.exp
      };
      
      logger.debug({ 
        shop_domain: decoded.shop_domain,
        sub: decoded.sub 
      }, 'JWT token verified successfully');
      
      next();
    } catch (jwtError) {
      logger.warn({ 
        error: jwtError.message,
        token: token.substring(0, 20) + '...' 
      }, 'JWT verification failed');
      
      return res.status(401).json({ 
        error: 'invalid_token',
        message: 'Invalid or expired token'
      });
    }
  } catch (error) {
    logger.error({ error }, 'JWT middleware error');
    return res.status(500).json({ 
      error: 'internal_error',
      message: 'Internal server error'
    });
  }
}

/**
 * Generate JWT token for a shop
 * @param {string} shopDomain - Shop domain
 * @param {string} sub - Subject identifier
 * @param {object} options - JWT options
 * @returns {string} - JWT token
 */
export function generateJwtToken(shopDomain, sub, options = {}) {
  const payload = {
    shop_domain: shopDomain,
    sub: sub,
    iat: Math.floor(Date.now() / 1000)
  };

  const jwtOptions = {
    expiresIn: '24h',
    issuer: 'sms-blossom-api',
    ...options
  };

  return jwt.sign(payload, JWT_SECRET, jwtOptions);
}

/**
 * Verify JWT token (utility function)
 * @param {string} token - JWT token
 * @returns {object} - Decoded token payload
 */
export function verifyJwtToken(token) {
  return jwt.verify(token, JWT_SECRET);
}
