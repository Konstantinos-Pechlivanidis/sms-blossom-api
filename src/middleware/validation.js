import { z } from 'zod';
import { logger } from '../services/logger.js';

/**
 * Input validation middleware using Zod schemas
 *
 * Validates req.body, req.query, and req.params against provided schemas
 * Returns 400 with validation errors on failure
 */
export function validateRequest(schemas = {}) {
  const { body: bodySchema, query: querySchema, params: paramsSchema } = schemas;

  return async (req, res, next) => {
    try {
      const errors = [];

      // Validate request body
      if (bodySchema) {
        try {
          req.body = bodySchema.parse(req.body);
        } catch (error) {
          if (error instanceof z.ZodError) {
            errors.push({
              field: 'body',
              errors: error.errors.map((err) => ({
                path: err.path.join('.'),
                message: err.message,
                code: err.code,
              })),
            });
          }
        }
      }

      // Validate query parameters
      if (querySchema) {
        try {
          req.query = querySchema.parse(req.query);
        } catch (error) {
          if (error instanceof z.ZodError) {
            errors.push({
              field: 'query',
              errors: error.errors.map((err) => ({
                path: err.path.join('.'),
                message: err.message,
                code: err.code,
              })),
            });
          }
        }
      }

      // Validate route parameters
      if (paramsSchema) {
        try {
          req.params = paramsSchema.parse(req.params);
        } catch (error) {
          if (error instanceof z.ZodError) {
            errors.push({
              field: 'params',
              errors: error.errors.map((err) => ({
                path: err.path.join('.'),
                message: err.message,
                code: err.code,
              })),
            });
          }
        }
      }

      if (errors.length > 0) {
        logger.warn('Request validation failed', {
          errors,
          path: req.path,
          method: req.method,
          request_id: req.headers['x-request-id'],
        });

        return res.status(400).json({
          error: 'validation_failed',
          message: 'Request validation failed',
          details: errors,
        });
      }

      next();
    } catch (error) {
      logger.error('Validation middleware error', {
        error: error.message,
        path: req.path,
        method: req.method,
        request_id: req.headers['x-request-id'],
      });

      return res.status(500).json({
        error: 'server_error',
        message: 'Internal server error during validation',
      });
    }
  };
}

/**
 * Common validation schemas
 */
export const commonSchemas = {
  // Shop domain validation
  shopDomain: z
    .string()
    .min(1, 'Shop domain is required')
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*\.myshopify\.com$/, 'Invalid shop domain format'),

  // Phone number validation (E.164 format)
  phoneE164: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number format (E.164 required)'),

  // Email validation
  email: z.string().email('Invalid email format').max(254, 'Email too long'),

  // UUID validation
  uuid: z.string().uuid('Invalid UUID format'),

  // Pagination
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).default('desc'),
  }),

  // Date range
  dateRange: z
    .object({
      start_date: z.string().datetime().optional(),
      end_date: z.string().datetime().optional(),
    })
    .refine(
      (data) => {
        if (data.start_date && data.end_date) {
          return new Date(data.start_date) <= new Date(data.end_date);
        }
        return true;
      },
      {
        message: 'Start date must be before end date',
        path: ['end_date'],
      },
    ),

  // Campaign creation
  campaignCreate: z.object({
    name: z.string().min(1, 'Campaign name is required').max(100),
    segment_id: z.string().uuid('Invalid segment ID'),
    template_id: z.string().uuid('Invalid template ID'),
    discount_id: z.string().uuid('Invalid discount ID').optional(),
    schedule_at: z.string().datetime().optional(),
    batch_size: z.number().int().min(1).max(1000).default(100),
    utm_source: z.string().max(50).optional(),
    utm_medium: z.string().max(50).optional(),
    utm_campaign: z.string().max(50).optional(),
  }),

  // Message creation
  messageCreate: z.object({
    contact_id: z.string().uuid('Invalid contact ID'),
    body: z.string().min(1, 'Message body is required').max(1600),
    template_id: z.string().uuid('Invalid template ID').optional(),
    metadata: z.record(z.any()).optional(),
  }),

  // Segment filter DSL
  segmentFilter: z.object({
    operator: z.enum(['and', 'or']).default('and'),
    conditions: z.array(
      z.object({
        field: z.string(),
        operator: z.enum([
          'equals',
          'not_equals',
          'contains',
          'not_contains',
          'in',
          'not_in',
          'gt',
          'gte',
          'lt',
          'lte',
        ]),
        value: z.union([z.string(), z.number(), z.boolean(), z.array(z.any())]),
      }),
    ),
  }),

  // Webhook payload validation
  webhookPayload: z
    .object({
      id: z.union([z.string(), z.number()]),
      created_at: z.string().datetime().optional(),
      updated_at: z.string().datetime().optional(),
      // Additional fields depend on webhook type
    })
    .passthrough(), // Allow additional fields

  // Admin API authentication
  adminAuth: z.object({
    shop_domain: z.string().min(1),
    user_id: z.string().optional(),
    scopes: z.array(z.string()).optional(),
  }),

  // Rate limiting configuration
  rateLimitConfig: z.object({
    window_ms: z.number().int().min(1000).max(3600000), // 1 second to 1 hour
    max_requests: z.number().int().min(1).max(10000),
    burst_limit: z.number().int().min(1).max(1000),
  }),
};

/**
 * Sanitize input to prevent XSS and injection attacks
 */
export function sanitizeInput(input) {
  if (typeof input === 'string') {
    return input
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/['"]/g, '') // Remove quotes
      .trim();
  }

  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }

  if (typeof input === 'object' && input !== null) {
    const sanitized = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }

  return input;
}

/**
 * Sanitization middleware
 */
export function sanitizeMiddleware() {
  return (req, res, next) => {
    try {
      // Sanitize request body
      if (req.body && typeof req.body === 'object') {
        req.body = sanitizeInput(req.body);
      }

      // Sanitize query parameters
      if (req.query && typeof req.query === 'object') {
        req.query = sanitizeInput(req.query);
      }

      // Sanitize route parameters
      if (req.params && typeof req.params === 'object') {
        req.params = sanitizeInput(req.params);
      }

      next();
    } catch (error) {
      logger.error('Sanitization middleware error', {
        error: error.message,
        path: req.path,
        method: req.method,
        request_id: req.headers['x-request-id'],
      });

      return res.status(500).json({
        error: 'server_error',
        message: 'Internal server error during input sanitization',
      });
    }
  };
}
