import { logger } from '../services/logger.js';

/**
 * Security logging middleware that redacts PII and logs security-relevant information
 *
 * Logs:
 * - x-request-id
 * - shop_domain
 * - route and method
 * - outcome (success/failure)
 * - Redacted PII fields
 */
export function securityLoggingMiddleware() {
  return (req, res, next) => {
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] || 'unknown';
    const shopDomain = req.shop?.domain || req.headers['x-shop-domain'] || 'unknown';

    // Redact sensitive fields from request
    const redactedReq = redactSensitiveData({
      method: req.method,
      url: req.url,
      headers: redactHeaders(req.headers),
      body: redactBody(req.body),
      query: redactQuery(req.query),
      params: req.params,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    // Log request start
    logger.info('Request started', {
      request_id: requestId,
      shop_domain: shopDomain,
      route: `${req.method} ${req.path}`,
      ip: req.ip || req.connection.remoteAddress,
      user_agent: req.headers['user-agent'],
      ...redactedReq,
    });

    // Override res.json to capture response
    const originalJson = res.json;
    res.json = function (body) {
      const duration = Date.now() - startTime;
      const outcome = res.statusCode < 400 ? 'success' : 'error';

      // Redact sensitive fields from response
      const redactedRes = redactSensitiveData(body);

      // Log request completion
      logger.info('Request completed', {
        request_id: requestId,
        shop_domain: shopDomain,
        route: `${req.method} ${req.path}`,
        status_code: res.statusCode,
        outcome,
        duration_ms: duration,
        response_size: JSON.stringify(redactedRes).length,
      });

      // Log security events
      if (res.statusCode >= 400) {
        logger.warn('Security event', {
          request_id: requestId,
          shop_domain: shopDomain,
          route: `${req.method} ${req.path}`,
          status_code: res.statusCode,
          error_type: getErrorType(res.statusCode),
          duration_ms: duration,
          ...redactedReq,
        });
      }

      return originalJson.call(this, redactedRes);
    };

    // Override res.send for non-JSON responses
    const originalSend = res.send;
    res.send = function (body) {
      const duration = Date.now() - startTime;
      const outcome = res.statusCode < 400 ? 'success' : 'error';

      // Log request completion
      logger.info('Request completed', {
        request_id: requestId,
        shop_domain: shopDomain,
        route: `${req.method} ${req.path}`,
        status_code: res.statusCode,
        outcome,
        duration_ms: duration,
        response_size: typeof body === 'string' ? body.length : 0,
      });

      // Log security events
      if (res.statusCode >= 400) {
        logger.warn('Security event', {
          request_id: requestId,
          shop_domain: shopDomain,
          route: `${req.method} ${req.path}`,
          status_code: res.statusCode,
          error_type: getErrorType(res.statusCode),
          duration_ms: duration,
          ...redactedReq,
        });
      }

      return originalSend.call(this, body);
    };

    next();
  };
}

/**
 * Redact sensitive data from objects
 */
function redactSensitiveData(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(redactSensitiveData);
  }

  const redacted = {};
  const sensitiveFields = [
    'password',
    'token',
    'secret',
    'key',
    'auth',
    'phone',
    'email',
    'ssn',
    'credit_card',
    'cvv',
    'access_token',
    'refresh_token',
    'api_key',
    'phoneE164',
    'phone_e164',
    'phone_number',
    'customer_email',
    'customer_phone',
    'billing_email',
    'shipping_email',
    'contact_email',
    'contact_phone',
  ];

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();

    if (sensitiveFields.some((field) => lowerKey.includes(field))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveData(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Redact sensitive headers
 */
function redactHeaders(headers) {
  const redacted = { ...headers };
  const sensitiveHeaders = [
    'authorization',
    'cookie',
    'x-api-key',
    'x-auth-token',
    'x-csrf-token',
    'x-session-id',
    'x-shopify-hmac-sha256',
  ];

  for (const header of sensitiveHeaders) {
    if (redacted[header]) {
      redacted[header] = '[REDACTED]';
    }
  }

  return redacted;
}

/**
 * Redact sensitive body fields
 */
function redactBody(body) {
  if (!body || typeof body !== 'object') {
    return body;
  }

  return redactSensitiveData(body);
}

/**
 * Redact sensitive query parameters
 */
function redactQuery(query) {
  if (!query || typeof query !== 'object') {
    return query;
  }

  const redacted = { ...query };
  const sensitiveParams = ['token', 'key', 'secret', 'auth', 'password'];

  for (const [key, _value] of Object.entries(redacted)) {
    if (sensitiveParams.some((param) => key.toLowerCase().includes(param))) {
      redacted[key] = '[REDACTED]';
    }
  }

  return redacted;
}

/**
 * Get error type from status code
 */
function getErrorType(statusCode) {
  if (statusCode >= 500) {
    return 'server_error';
  } else if (statusCode === 429) {
    return 'rate_limited';
  } else if (statusCode === 403) {
    return 'forbidden';
  } else if (statusCode === 401) {
    return 'unauthorized';
  } else if (statusCode === 409) {
    return 'conflict';
  } else if (statusCode >= 400) {
    return 'client_error';
  }
  return 'unknown';
}

/**
 * Log authentication events
 */
export function logAuthEvent(event, details = {}) {
  logger.info('Authentication event', {
    event,
    timestamp: new Date().toISOString(),
    ...details,
  });
}

/**
 * Log security violations
 */
export function logSecurityViolation(violation, details = {}) {
  logger.warn('Security violation', {
    violation,
    timestamp: new Date().toISOString(),
    ...details,
  });
}

/**
 * Log rate limiting events
 */
export function logRateLimit(shopDomain, ip, limit, current) {
  logger.warn('Rate limit exceeded', {
    shop_domain: shopDomain,
    ip,
    limit,
    current,
    timestamp: new Date().toISOString(),
  });
}
