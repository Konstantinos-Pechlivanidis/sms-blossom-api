// tests/webhooks.test.js
// Webhook signature verification and integration tests

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { verifyShopifyHmac } from '../src/middleware/verifyShopifyHmac.js';
import { enqueueJob } from '../src/queue/queues.js';

// Mock the queue system
vi.mock('../src/queue/queues.js', () => ({
  enqueueJob: vi.fn().mockResolvedValue({ id: 'job_123' }),
}));

// Mock Prisma
const mockPrisma = {
  event: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  shop: {
    findUnique: vi.fn(),
  },
};

vi.mock('../src/db/prismaClient.js', () => ({
  getPrismaClient: () => mockPrisma,
}));

describe('Webhook Signature Verification', () => {
  beforeEach(() => {
    // Set required environment variable
    process.env.WEBHOOK_HMAC_SECRET = 'test-secret-key';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should verify valid HMAC signature', () => {
    const payload = JSON.stringify({ id: 123, name: 'Test Order' });
    const hmac = crypto
      .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET)
      .update(payload, 'utf8')
      .digest('base64');

    const req = {
      get: vi.fn().mockImplementation((header) => {
        if (header === 'X-Shopify-Hmac-Sha256') return hmac;
        return undefined;
      }),
      body: JSON.parse(payload),
      rawBody: payload,
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    const next = vi.fn();

    const middleware = verifyShopifyHmac();
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should reject invalid HMAC signature', () => {
    const payload = JSON.stringify({ id: 123, name: 'Test Order' });
    const invalidHmac = 'invalid-signature';

    const req = {
      get: vi.fn().mockImplementation((header) => {
        if (header === 'X-Shopify-Hmac-Sha256') return invalidHmac;
        return undefined;
      }),
      body: JSON.parse(payload),
      rawBody: payload,
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    const next = vi.fn();

    const middleware = verifyShopifyHmac();
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'invalid_hmac' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should reject missing HMAC signature', () => {
    const req = {
      get: vi.fn().mockImplementation((header) => {
        if (header === 'X-Shopify-Hmac-Sha256') return undefined;
        return undefined;
      }),
      body: { id: 123 },
      rawBody: JSON.stringify({ id: 123 }),
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    const next = vi.fn();

    const middleware = verifyShopifyHmac();
    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'missing_hmac' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle different HMAC formats', () => {
    const payload = JSON.stringify({ id: 123 });
    const hmac = crypto
      .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET)
      .update(payload, 'utf8')
      .digest('base64');

    const req = {
      get: vi.fn().mockImplementation((header) => {
        if (header === 'X-Shopify-Hmac-Sha256') return hmac; // Without sha256= prefix
        return undefined;
      }),
      body: JSON.parse(payload),
      rawBody: payload,
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    const next = vi.fn();

    const middleware = verifyShopifyHmac();
    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('Webhook Integration Tests', () => {
  beforeEach(() => {
    process.env.WEBHOOK_HMAC_SECRET = 'test-secret-key';
    vi.clearAllMocks();
    mockPrisma.shop.findUnique.mockResolvedValue({
      id: 'shop_123',
      domain: 'test-shop.myshopify.com',
    });
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({
      id: 'event_123',
      shopId: 'shop_123',
      topic: 'orders/create',
      objectId: '123',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should process orders/create webhook', async () => {
    const { default: ordersRouter } = await import('../src/webhooks/shopify-orders.js');

    const req = {
      body: { id: 123, name: 'Test Order' },
      shop: { id: 'shop_123', domain: 'test-shop.myshopify.com' },
      get: vi.fn().mockReturnValue('test-request-id'),
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    // Mock the HMAC verification middleware
    const mockVerifyHmac = vi.fn((req, res, next) => next());
    ordersRouter.stack[0].handle = mockVerifyHmac;

    await new Promise((resolve) => {
      ordersRouter.stack[0].handle(req, res, () => {
        ordersRouter.stack[1].handle(req, res, resolve);
      });
    });

    expect(mockPrisma.event.create).toHaveBeenCalledWith({
      data: {
        shopId: 'shop_123',
        topic: 'orders/create',
        objectId: '123',
        raw: { id: 123, name: 'Test Order' },
        dedupeKey: 'shop_123:orders/create:123',
        receivedAt: expect.any(Date),
      },
    });

    expect(enqueueJob).toHaveBeenCalledWith('eventsQueue', 'orders:create', {
      eventId: 'event_123',
      shopId: 'shop_123',
      orderId: '123',
      orderData: { id: 123, name: 'Test Order' },
      requestId: 'test-request-id',
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true, eventId: 'event_123' });
  });

  it('should handle duplicate webhook events', async () => {
    mockPrisma.event.findUnique.mockResolvedValue({
      id: 'existing_event_123',
      shopId: 'shop_123',
      topic: 'orders/create',
    });

    const { default: ordersRouter } = await import('../src/webhooks/shopify-orders.js');

    const req = {
      body: { id: 123, name: 'Test Order' },
      shop: { id: 'shop_123', domain: 'test-shop.myshopify.com' },
      get: vi.fn().mockReturnValue('test-request-id'),
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    const mockVerifyHmac = vi.fn((req, res, next) => next());
    ordersRouter.stack[0].handle = mockVerifyHmac;

    await new Promise((resolve) => {
      ordersRouter.stack[0].handle(req, res, () => {
        ordersRouter.stack[1].handle(req, res, resolve);
      });
    });

    expect(mockPrisma.event.create).not.toHaveBeenCalled();
    expect(enqueueJob).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true, duplicate: true });
  });

  it('should handle missing order ID', async () => {
    const { default: ordersRouter } = await import('../src/webhooks/shopify-orders.js');

    const req = {
      body: { name: 'Test Order' }, // Missing id
      shop: { id: 'shop_123', domain: 'test-shop.myshopify.com' },
      get: vi.fn().mockReturnValue('test-request-id'),
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    const mockVerifyHmac = vi.fn((req, res, next) => next());
    ordersRouter.stack[0].handle = mockVerifyHmac;

    await new Promise((resolve) => {
      ordersRouter.stack[0].handle(req, res, () => {
        ordersRouter.stack[1].handle(req, res, resolve);
      });
    });

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'missing_order_id' });
  });

  it('should handle database errors gracefully', async () => {
    mockPrisma.event.create.mockRejectedValue(new Error('Database connection failed'));

    const { default: ordersRouter } = await import('../src/webhooks/shopify-orders.js');

    const req = {
      body: { id: 123, name: 'Test Order' },
      shop: { id: 'shop_123', domain: 'test-shop.myshopify.com' },
      get: vi.fn().mockReturnValue('test-request-id'),
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    const mockVerifyHmac = vi.fn((req, res, next) => next());
    ordersRouter.stack[0].handle = mockVerifyHmac;

    await new Promise((resolve) => {
      ordersRouter.stack[0].handle(req, res, () => {
        ordersRouter.stack[1].handle(req, res, resolve);
      });
    });

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'internal_error' });
  });
});

describe('GDPR Webhook Tests', () => {
  beforeEach(() => {
    process.env.WEBHOOK_HMAC_SECRET = 'test-secret-key';
    vi.clearAllMocks();
    mockPrisma.shop.findUnique.mockResolvedValue({
      id: 'shop_123',
      domain: 'test-shop.myshopify.com',
    });
    mockPrisma.event.findUnique.mockResolvedValue(null);
    mockPrisma.event.create.mockResolvedValue({
      id: 'event_123',
      shopId: 'shop_123',
      topic: 'customers/redact',
      objectId: 'customer_123',
    });
  });

  it('should process customers/redact webhook', async () => {
    const { default: gdprRouter } = await import('../src/webhooks/shopify-gdpr.js');

    const req = {
      body: {
        customer: {
          id: 123,
          email: 'test@example.com',
          phone: '+1234567890',
        },
      },
      shop: { id: 'shop_123', domain: 'test-shop.myshopify.com' },
      get: vi.fn().mockReturnValue('test-request-id'),
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    const mockVerifyHmac = vi.fn((req, res, next) => next());
    gdprRouter.stack[0].handle = mockVerifyHmac;

    await new Promise((resolve) => {
      gdprRouter.stack[0].handle(req, res, () => {
        gdprRouter.stack[1].handle(req, res, resolve);
      });
    });

    expect(mockPrisma.event.create).toHaveBeenCalledWith({
      data: {
        shopId: 'shop_123',
        topic: 'customers/redact',
        objectId: '123',
        raw: {
          customer: {
            id: 123,
            email: 'test@example.com',
            phone: '+1234567890',
          },
        },
        dedupeKey: 'shop_123:customers/redact:123',
        receivedAt: expect.any(Date),
      },
    });

    expect(enqueueJob).toHaveBeenCalledWith('housekeepingQueue', 'gdpr:customer_redact', {
      eventId: 'event_123',
      shopId: 'shop_123',
      customerId: '123',
      customerData: {
        id: 123,
        email: 'test@example.com',
        phone: '+1234567890',
      },
      requestId: 'test-request-id',
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true, eventId: 'event_123' });
  });

  it('should process shop/redact webhook', async () => {
    const { default: gdprRouter } = await import('../src/webhooks/shopify-gdpr.js');

    const req = {
      body: { shop_domain: 'test-shop.myshopify.com' },
      shop: { id: 'shop_123', domain: 'test-shop.myshopify.com' },
      get: vi.fn().mockReturnValue('test-request-id'),
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    const mockVerifyHmac = vi.fn((req, res, next) => next());
    gdprRouter.stack[0].handle = mockVerifyHmac;

    await new Promise((resolve) => {
      gdprRouter.stack[0].handle(req, res, () => {
        gdprRouter.stack[1].handle(req, res, resolve);
      });
    });

    expect(enqueueJob).toHaveBeenCalledWith('housekeepingQueue', 'gdpr:shop_redact', {
      eventId: 'event_123',
      shopId: 'shop_123',
      shopData: { shop_domain: 'test-shop.myshopify.com' },
      requestId: 'test-request-id',
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true, eventId: 'event_123' });
  });
});


