import crypto from 'crypto';
import { logger } from '../services/logger.js';

/**
 * CSRF protection middleware using double-submit token pattern
 *
 * Only applies to cookie-based sessions (not Bearer token auth)
 * Implements double-submit pattern for stateless CSRF protection
 */
export function csrfMiddleware(options = {}) {
  const {
    secret = process.env.CSRF_SECRET || process.env.SESSION_SECRET,
    cookieName = 'csrf-token',
    headerName = 'x-csrf-token',
    maxAge = 24 * 60 * 60 * 1000, // 24 hours
    secure = process.env.NODE_ENV === 'production',
    sameSite = 'lax',
    skipMethods = ['GET', 'HEAD', 'OPTIONS'],
    skipPaths = ['/health', '/metrics', '/webhooks'],
    skipIf = (req) => {
      // Skip CSRF for API routes with Bearer tokens
      return req.headers.authorization?.startsWith('Bearer ');
    },
  } = options;

  if (!secret) {
    throw new Error('CSRF_SECRET or SESSION_SECRET must be set');
  }

  return async (req, res, next) => {
    try {
      // Skip CSRF for safe methods
      if (skipMethods.includes(req.method)) {
        return next();
      }

      // Skip CSRF for specific paths
      if (skipPaths.some((path) => req.path.startsWith(path))) {
        return next();
      }

      // Skip CSRF if condition is met (e.g., Bearer token auth)
      if (skipIf(req)) {
        return next();
      }

      // Generate CSRF token
      const generateToken = () => {
        const timestamp = Date.now().toString();
        const random = crypto.randomBytes(16).toString('hex');
        const data = `${timestamp}:${random}`;
        const signature = crypto.createHmac('sha256', secret).update(data).digest('hex');
        return `${data}:${signature}`;
      };

      // Verify CSRF token
      const verifyToken = (token) => {
        if (!token || typeof token !== 'string') {
          return false;
        }

        const parts = token.split(':');
        if (parts.length !== 3) {
          return false;
        }

        const [timestamp, random, signature] = parts;
        const data = `${timestamp}:${random}`;
        const expectedSignature = crypto.createHmac('sha256', secret).update(data).digest('hex');

        // Verify signature
        if (signature !== expectedSignature) {
          return false;
        }

        // Check token age
        const tokenTime = parseInt(timestamp, 10);
        const now = Date.now();
        if (now - tokenTime > maxAge) {
          return false;
        }

        return true;
      };

      // For GET requests, generate and set CSRF token
      if (req.method === 'GET') {
        const token = generateToken();

        res.cookie(cookieName, token, {
          httpOnly: false, // Allow JavaScript to read for AJAX requests
          secure,
          sameSite,
          maxAge,
        });

        // Also set in response header for AJAX requests
        res.set('X-CSRF-Token', token);

        return next();
      }

      // For state-changing requests, verify CSRF token
      const cookieToken = req.cookies[cookieName];
      const headerToken = req.headers[headerName.toLowerCase()];

      // Token must be present in both cookie and header (double-submit)
      if (!cookieToken || !headerToken) {
        logger.warn('CSRF token missing', {
          has_cookie: !!cookieToken,
          has_header: !!headerToken,
          path: req.path,
          method: req.method,
          request_id: req.headers['x-request-id'],
        });

        return res.status(403).json({
          error: 'csrf_token_missing',
          message: 'CSRF token is required',
        });
      }

      // Tokens must match (double-submit verification)
      if (cookieToken !== headerToken) {
        logger.warn('CSRF token mismatch', {
          path: req.path,
          method: req.method,
          request_id: req.headers['x-request-id'],
        });

        return res.status(403).json({
          error: 'csrf_token_mismatch',
          message: 'CSRF token mismatch',
        });
      }

      // Verify token signature and age
      if (!verifyToken(cookieToken)) {
        logger.warn('CSRF token invalid', {
          path: req.path,
          method: req.method,
          request_id: req.headers['x-request-id'],
        });

        return res.status(403).json({
          error: 'csrf_token_invalid',
          message: 'CSRF token is invalid or expired',
        });
      }

      next();
    } catch (error) {
      logger.error('CSRF middleware error', {
        error: error.message,
        path: req.path,
        method: req.method,
        request_id: req.headers['x-request-id'],
      });

      return res.status(500).json({
        error: 'server_error',
        message: 'Internal server error during CSRF verification',
      });
    }
  };
}

/**
 * CSRF token generation endpoint
 */
export function csrfTokenHandler() {
  return (req, res) => {
    const secret = process.env.CSRF_SECRET || process.env.SESSION_SECRET;

    if (!secret) {
      return res.status(500).json({
        error: 'server_error',
        message: 'CSRF secret not configured',
      });
    }

    const timestamp = Date.now().toString();
    const random = crypto.randomBytes(16).toString('hex');
    const data = `${timestamp}:${random}`;
    const signature = crypto.createHmac('sha256', secret).update(data).digest('hex');
    const token = `${data}:${signature}`;

    res.json({ csrf_token: token });
  };
}
