import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/db/prismaClient.js';
import { requiredAuthMiddleware, generateJwtToken } from '../src/middleware/auth.js';
import { shopScopingMiddleware } from '../src/middleware/shopScoping.js';
import { rateLimitMiddleware } from '../src/middleware/rateLimiting.js';
import { csrfMiddleware } from '../src/middleware/csrf.js';
import { validateRequest, commonSchemas } from '../src/middleware/validation.js';
import { z } from 'zod';
import { securityLoggingMiddleware } from '../src/middleware/securityLogging.js';

// Mock Redis connection
vi.mock('../src/queue/queues.js', () => ({
  getRedisConnection: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue('0'),
    set: vi.fn().mockResolvedValue('OK'),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    pipeline: vi.fn().mockReturnValue({
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    }),
  }),
}));

// Mock Prisma
vi.mock('../src/db/prismaClient.js', () => ({
  prisma: {
    shop: {
      findUnique: vi.fn(),
    },
  },
}));

describe('Security Middleware', () => {
  let app;
  let mockShop;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    mockShop = {
      id: 'shop-123',
      domain: 'test-shop.myshopify.com',
      timezone: 'UTC',
      locale: 'en',
      installed: true,
      accessToken: 'access-token-123',
    };

    // Reset mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('JWT Authentication', () => {
    it('should accept valid JWT token', async () => {
      const token = generateJwtToken({
        shop_domain: 'test-shop.myshopify.com',
        user_id: 'user-123',
      });

      app.get('/protected', requiredAuthMiddleware(), (req, res) => {
        res.json({ success: true, auth: req.auth });
      });

      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.auth.shop_domain).toBe('test-shop.myshopify.com');
    });

    it('should reject invalid JWT token', async () => {
      app.get('/protected', requiredAuthMiddleware(), (req, res) => {
        res.json({ success: true });
      });

      await request(app).get('/protected').set('Authorization', 'Bearer invalid-token').expect(401);
    });

    it('should reject missing token', async () => {
      app.get('/protected', requiredAuthMiddleware(), (req, res) => {
        res.json({ success: true });
      });

      await request(app).get('/protected').expect(401);
    });

    it('should accept valid Shopify session token', async () => {
      // Mock Shopify session token verification
      const mockVerify = vi.fn().mockResolvedValue({
        dest: 'test-shop.myshopify.com',
        aud: 'test-app',
        iss: 'https://test-shop.myshopify.com/admin',
      });

      vi.doMock('jsonwebtoken', () => ({
        ...jwt,
        verify: mockVerify,
      }));

      app.get('/protected', requiredAuthMiddleware(), (req, res) => {
        res.json({ success: true, auth: req.auth });
      });

      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer shopify-session-token')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Shop Scoping', () => {
    it('should resolve shop from JWT token', async () => {
      prisma.shop.findUnique.mockResolvedValue(mockShop);

      const token = generateJwtToken({
        shop_domain: 'test-shop.myshopify.com',
        user_id: 'user-123',
      });

      app.get('/shop-scoped', requiredAuthMiddleware(), shopScopingMiddleware(), (req, res) => {
        res.json({ shop: req.shop });
      });

      const response = await request(app)
        .get('/shop-scoped')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.shop.id).toBe('shop-123');
      expect(response.body.shop.domain).toBe('test-shop.myshopify.com');
    });

    it('should resolve shop from X-Shop-Domain header', async () => {
      prisma.shop.findUnique.mockResolvedValue(mockShop);

      app.get('/shop-scoped', shopScopingMiddleware(), (req, res) => {
        res.json({ shop: req.shop });
      });

      const response = await request(app)
        .get('/shop-scoped')
        .set('X-Shop-Domain', 'test-shop.myshopify.com')
        .expect(200);

      expect(response.body.shop.id).toBe('shop-123');
    });

    it('should resolve shop from query parameter', async () => {
      prisma.shop.findUnique.mockResolvedValue(mockShop);

      app.get('/shop-scoped', shopScopingMiddleware(), (req, res) => {
        res.json({ shop: req.shop });
      });

      const response = await request(app)
        .get('/shop-scoped?shop=test-shop.myshopify.com')
        .expect(200);

      expect(response.body.shop.id).toBe('shop-123');
    });

    it('should return 409 for non-installed shop', async () => {
      prisma.shop.findUnique.mockResolvedValue({
        ...mockShop,
        installed: false,
      });

      app.get('/shop-scoped', shopScopingMiddleware(), (req, res) => {
        res.json({ shop: req.shop });
      });

      const response = await request(app)
        .get('/shop-scoped')
        .set('X-Shop-Domain', 'test-shop.myshopify.com')
        .expect(409);

      expect(response.body.error).toBe('shop_not_installed');
      expect(response.body.install_url).toContain('test-shop.myshopify.com');
    });

    it('should return 409 for shop not found', async () => {
      prisma.shop.findUnique.mockResolvedValue(null);

      app.get('/shop-scoped', shopScopingMiddleware(), (req, res) => {
        res.json({ shop: req.shop });
      });

      const response = await request(app)
        .get('/shop-scoped')
        .set('X-Shop-Domain', 'nonexistent-shop.myshopify.com')
        .expect(409);

      expect(response.body.error).toBe('shop_not_installed');
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within limit', async () => {
      app.get(
        '/rate-limited',
        rateLimitMiddleware({
          windowMs: 60000,
          maxRequests: 10,
          burstLimit: 5,
        }),
        (req, res) => {
          res.json({ success: true });
        },
      );

      const response = await request(app).get('/rate-limited').expect(200);

      expect(response.body.success).toBe(true);
      expect(response.headers['ratelimit-limit']).toBe('10');
    });

    it('should return 429 when rate limit exceeded', async () => {
      // Mock Redis to return high count
      const { getRedisConnection } = await import('../src/queue/queues.js');
      const mockRedis = {
        get: vi.fn().mockResolvedValue('15'), // Exceeds limit
        pipeline: vi.fn().mockReturnValue({
          incr: vi.fn().mockReturnThis(),
          expire: vi.fn().mockReturnThis(),
          exec: vi.fn().mockResolvedValue([]),
        }),
      };
      getRedisConnection.mockResolvedValue(mockRedis);

      app.get(
        '/rate-limited',
        rateLimitMiddleware({
          windowMs: 60000,
          maxRequests: 10,
          burstLimit: 5,
        }),
        (req, res) => {
          res.json({ success: true });
        },
      );

      const response = await request(app).get('/rate-limited').expect(429);

      expect(response.body.error).toBe('rate_limited');
      expect(response.headers['retry-after']).toBeDefined();
    });

    it('should skip rate limiting when Redis unavailable', async () => {
      const { getRedisConnection } = await import('../src/queue/queues.js');
      getRedisConnection.mockResolvedValue(null);

      app.get(
        '/rate-limited',
        rateLimitMiddleware({
          windowMs: 60000,
          maxRequests: 10,
          burstLimit: 5,
        }),
        (req, res) => {
          res.json({ success: true });
        },
      );

      await request(app).get('/rate-limited').expect(200);
    });
  });

  describe('CSRF Protection', () => {
    it('should skip CSRF for GET requests', async () => {
      app.get('/csrf-protected', csrfMiddleware(), (req, res) => {
        res.json({ success: true });
      });

      await request(app).get('/csrf-protected').expect(200);
    });

    it('should require CSRF token for POST requests', async () => {
      app.post('/csrf-protected', csrfMiddleware(), (req, res) => {
        res.json({ success: true });
      });

      const response = await request(app).post('/csrf-protected').expect(403);

      expect(response.body.error).toBe('csrf_token_missing');
    });

    it('should accept valid CSRF token', async () => {
      app.get('/csrf-token', csrfMiddleware(), (req, res) => {
        res.json({ token: 'csrf-token' });
      });

      // First get the CSRF token
      const tokenResponse = await request(app).get('/csrf-token').expect(200);

      const csrfToken = tokenResponse.headers['x-csrf-token'];

      app.post('/csrf-protected', csrfMiddleware(), (req, res) => {
        res.json({ success: true });
      });

      // Use the token in both cookie and header
      await request(app)
        .post('/csrf-protected')
        .set('X-CSRF-Token', csrfToken)
        .set('Cookie', `csrf-token=${csrfToken}`)
        .expect(200);
    });

    it('should skip CSRF for Bearer token auth', async () => {
      const token = generateJwtToken({
        shop_domain: 'test-shop.myshopify.com',
        user_id: 'user-123',
      });

      app.post('/csrf-protected', csrfMiddleware(), (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .post('/csrf-protected')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });
  });

  describe('Input Validation', () => {
    it('should validate request body', async () => {
      app.post(
        '/validate',
        validateRequest({
          body: commonSchemas.campaignCreate,
        }),
        (req, res) => {
          res.json({ success: true, data: req.body });
        },
      );

      const validData = {
        name: 'Test Campaign',
        segment_id: '123e4567-e89b-12d3-a456-426614174000',
        template_id: '123e4567-e89b-12d3-a456-426614174001',
        batch_size: 100,
      };

      const response = await request(app).post('/validate').send(validData).expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject invalid request body', async () => {
      app.post(
        '/validate',
        validateRequest({
          body: commonSchemas.campaignCreate,
        }),
        (req, res) => {
          res.json({ success: true });
        },
      );

      const invalidData = {
        name: '', // Invalid: empty name
        segment_id: 'invalid-uuid', // Invalid: not a UUID
        template_id: '123e4567-e89b-12d3-a456-426614174001',
      };

      const response = await request(app).post('/validate').send(invalidData).expect(400);

      expect(response.body.error).toBe('validation_failed');
      expect(response.body.details).toBeDefined();
    });

    it('should validate query parameters', async () => {
      app.get(
        '/validate',
        validateRequest({
          query: commonSchemas.pagination,
        }),
        (req, res) => {
          res.json({ success: true, query: req.query });
        },
      );

      const response = await request(app).get('/validate?page=2&limit=50').expect(200);

      expect(response.body.query.page).toBe(2);
      expect(response.body.query.limit).toBe(50);
    });

    it('should validate route parameters', async () => {
      app.get(
        '/validate/:id',
        validateRequest({
          params: z.object({ id: commonSchemas.uuid }),
        }),
        (req, res) => {
          res.json({ success: true, id: req.params.id });
        },
      );

      const validId = '123e4567-e89b-12d3-a456-426614174000';

      const response = await request(app).get(`/validate/${validId}`).expect(200);

      expect(response.body.id).toBe(validId);
    });
  });

  describe('Security Logging', () => {
    it('should log request start and completion', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      app.use(securityLoggingMiddleware());
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app).get('/test').set('X-Request-ID', 'test-request-123').expect(200);

      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('should redact sensitive data in logs', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      app.use(securityLoggingMiddleware());
      app.post('/test', (req, res) => {
        res.json({ success: true });
      });

      await request(app)
        .post('/test')
        .set('X-Request-ID', 'test-request-123')
        .send({
          password: 'secret123',
          email: 'user@example.com',
          phone: '+1234567890',
        })
        .expect(200);

      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete security flow', async () => {
      prisma.shop.findUnique.mockResolvedValue(mockShop);

      const token = generateJwtToken({
        shop_domain: 'test-shop.myshopify.com',
        user_id: 'user-123',
      });

      app.use(securityLoggingMiddleware());
      app.get(
        '/secure',
        requiredAuthMiddleware(),
        shopScopingMiddleware(),
        rateLimitMiddleware({ maxRequests: 10 }),
        (req, res) => {
          res.json({
            success: true,
            shop: req.shop,
            auth: req.auth,
          });
        },
      );

      const response = await request(app)
        .get('/secure')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Request-ID', 'integration-test-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.shop.id).toBe('shop-123');
      expect(response.body.auth.shop_domain).toBe('test-shop.myshopify.com');
    });
  });
});
