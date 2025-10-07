// tests/security-mw.test.js
// Tests for security middleware (JWT, shop scoping, rate limiting)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jwtVerifyMiddleware, generateJwtToken, verifyJwtToken } from '../src/middleware/jwt.js';
import { shopScopingMiddleware } from '../src/middleware/shopScope.js';
import { rateLimitMiddleware, checkRateLimit } from '../src/middleware/rateLimit.js';

// Mock dependencies
vi.mock('../src/lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../src/db/prismaClient.js', () => ({
  getPrismaClient: vi.fn(() => ({
    shop: {
      findUnique: vi.fn(),
    },
  })),
}));

vi.mock('../src/queue/queues.js', () => ({
  getRedisConnection: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
    pipeline: vi.fn(() => ({
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn(),
    })),
  })),
}));

describe('JWT Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      get: vi.fn(),
      auth: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();
  });

  it('should verify valid JWT token', () => {
    const token = generateJwtToken('test-shop.myshopify.com', 'user123');
    req.get.mockReturnValue(`Bearer ${token}`);

    jwtVerifyMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.auth).toHaveProperty('shop_domain', 'test-shop.myshopify.com');
    expect(req.auth).toHaveProperty('sub', 'user123');
  });

  it('should reject missing authorization header', () => {
    req.get.mockReturnValue(undefined);

    jwtVerifyMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'missing_token',
      message: 'Authorization header with Bearer token is required',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject invalid token format', () => {
    req.get.mockReturnValue('Invalid token');

    jwtVerifyMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'missing_token',
      message: 'Authorization header with Bearer token is required',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject invalid JWT token', () => {
    req.get.mockReturnValue('Bearer invalid-token');

    jwtVerifyMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'invalid_token',
      message: 'Invalid or expired token',
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('Shop Scoping Middleware', () => {
  let req, res, next;
  let mockPrisma;

  beforeEach(() => {
    req = {
      auth: {},
      get: vi.fn(),
      query: {},
      shop: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();

    mockPrisma = {
      shop: {
        findUnique: vi.fn(),
      },
    };
    vi.mocked(require('../src/db/prismaClient.js').getPrismaClient).mockReturnValue(mockPrisma);
  });

  it('should resolve shop from JWT token', async () => {
    req.auth = { shop_domain: 'test-shop.myshopify.com' };
    mockPrisma.shop.findUnique.mockResolvedValue({
      id: 'shop123',
      domain: 'test-shop.myshopify.com',
      name: 'Test Shop',
      timezone: 'UTC',
      locale: 'en-US',
      settingsJson: {},
    });

    await shopScopingMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.shop).toEqual({
      id: 'shop123',
      domain: 'test-shop.myshopify.com',
      name: 'Test Shop',
      timezone: 'UTC',
      locale: 'en-US',
      settings: {},
    });
  });

  it('should resolve shop from header', async () => {
    req.get.mockReturnValue('test-shop.myshopify.com');
    mockPrisma.shop.findUnique.mockResolvedValue({
      id: 'shop123',
      domain: 'test-shop.myshopify.com',
      name: 'Test Shop',
      timezone: 'UTC',
      locale: 'en-US',
      settingsJson: {},
    });

    await shopScopingMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.shop.domain).toBe('test-shop.myshopify.com');
  });

  it('should resolve shop from query parameter', async () => {
    req.query = { shop: 'test-shop.myshopify.com' };
    mockPrisma.shop.findUnique.mockResolvedValue({
      id: 'shop123',
      domain: 'test-shop.myshopify.com',
      name: 'Test Shop',
      timezone: 'UTC',
      locale: 'en-US',
      settingsJson: {},
    });

    await shopScopingMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.shop.domain).toBe('test-shop.myshopify.com');
  });

  it('should reject missing shop domain', async () => {
    await shopScopingMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: 'missing_shop_domain',
      message: 'Shop domain is required',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject unknown shop', async () => {
    req.auth = { shop_domain: 'unknown-shop.myshopify.com' };
    mockPrisma.shop.findUnique.mockResolvedValue(null);

    await shopScopingMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: 'shop_not_installed',
      message: 'Shop is not installed or not found',
      install_url: expect.stringContaining('/auth/install'),
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('Rate Limiting Middleware', () => {
  let req, res, next;
  let mockRedis;

  beforeEach(() => {
    req = {
      path: '/api/admin/test',
      ip: '127.0.0.1',
      shop: { id: 'shop123' },
      get: vi.fn(),
    };
    res = {
      set: vi.fn().mockReturnThis(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    next = vi.fn();

    mockRedis = {
      get: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn(),
      pipeline: vi.fn(() => ({
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn(),
      })),
    };
    vi.mocked(require('../src/queue/queues.js').getRedisConnection).mockReturnValue(mockRedis);
  });

  it('should allow requests within rate limit', async () => {
    mockRedis.get.mockResolvedValue('10'); // Under limit
    mockRedis.pipeline().exec.mockResolvedValue([
      [null, 11],
      [null, 1],
    ]);

    await rateLimitMiddleware()(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith({
      'X-RateLimit-Limit': '600',
      'X-RateLimit-Remaining': expect.any(String),
      'X-RateLimit-Reset': expect.any(String),
    });
  });

  it('should reject requests exceeding rate limit', async () => {
    mockRedis.get.mockResolvedValue('600'); // At limit

    await rateLimitMiddleware()(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: 'rate_limit_exceeded',
      message: 'Too many requests',
      retry_after: expect.any(Number),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle Redis unavailability gracefully', async () => {
    vi.mocked(require('../src/queue/queues.js').getRedisConnection).mockReturnValue(null);

    await rateLimitMiddleware()(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should use different limits for different paths', async () => {
    req.path = '/public/test';
    mockRedis.get.mockResolvedValue('5');

    await rateLimitMiddleware()(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('Rate Limit Check', () => {
  let mockRedis;

  beforeEach(() => {
    mockRedis = {
      get: vi.fn(),
    };
    vi.mocked(require('../src/queue/queues.js').getRedisConnection).mockReturnValue(mockRedis);
  });

  it('should check rate limit status', async () => {
    mockRedis.get.mockResolvedValue('10');

    const result = await checkRateLimit('test-key');

    expect(result).toHaveProperty('allowed', true);
    expect(result).toHaveProperty('remaining');
    expect(result).toHaveProperty('resetTime');
  });

  it('should handle Redis errors gracefully', async () => {
    mockRedis.get.mockRejectedValue(new Error('Redis error'));

    const result = await checkRateLimit('test-key');

    expect(result).toHaveProperty('allowed', true);
    expect(result).toHaveProperty('remaining');
  });
});
