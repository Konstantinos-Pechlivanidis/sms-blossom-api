// tests/webhook-contracts.test.js
// Contract tests for webhook payload validation

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

describe('Webhook Payload Contract Tests', () => {
  beforeEach(() => {
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

  describe('Orders Webhook Contracts', () => {
    it('should accept valid orders/create payload', async () => {
      const { default: ordersRouter } = await import('../src/webhooks/shopify-orders.js');

      const validPayload = {
        id: 123,
        name: '#1001',
        email: 'customer@example.com',
        phone: '+1234567890',
        customer: {
          id: 456,
          email: 'customer@example.com',
          first_name: 'John',
          last_name: 'Doe',
        },
        line_items: [
          {
            id: 789,
            title: 'Test Product',
            quantity: 1,
            price: '29.99',
          },
        ],
        total_price: '29.99',
        currency: 'USD',
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
      };

      const req = {
        body: validPayload,
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

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true, eventId: 'event_123' });
    });

    it('should reject orders/create payload without ID', async () => {
      const { default: ordersRouter } = await import('../src/webhooks/shopify-orders.js');

      const invalidPayload = {
        name: '#1001',
        email: 'customer@example.com',
        // Missing id field
      };

      const req = {
        body: invalidPayload,
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

    it('should accept valid orders/paid payload', async () => {
      const { default: ordersRouter } = await import('../src/webhooks/shopify-orders.js');

      const validPayload = {
        id: 123,
        name: '#1001',
        email: 'customer@example.com',
        phone: '+1234567890',
        financial_status: 'paid',
        fulfillment_status: null,
        total_price: '29.99',
        currency: 'USD',
        processed_at: '2024-01-15T10:30:00Z',
      };

      const req = {
        body: validPayload,
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

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true, eventId: 'event_123' });
    });
  });

  describe('Fulfillments Webhook Contracts', () => {
    it('should accept valid fulfillments/create payload', async () => {
      const { default: fulfillmentsRouter } = await import(
        '../src/webhooks/shopify-fulfillments.js'
      );

      const validPayload = {
        id: 789,
        order_id: 123,
        status: 'success',
        tracking_company: 'UPS',
        tracking_number: '1Z999AA1234567890',
        tracking_url: 'https://www.ups.com/track?trackingNumber=1Z999AA1234567890',
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
      };

      const req = {
        body: validPayload,
        shop: { id: 'shop_123', domain: 'test-shop.myshopify.com' },
        get: vi.fn().mockReturnValue('test-request-id'),
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockVerifyHmac = vi.fn((req, res, next) => next());
      fulfillmentsRouter.stack[0].handle = mockVerifyHmac;

      await new Promise((resolve) => {
        fulfillmentsRouter.stack[0].handle(req, res, () => {
          fulfillmentsRouter.stack[1].handle(req, res, resolve);
        });
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true, eventId: 'event_123' });
    });

    it('should reject fulfillments/create payload without ID', async () => {
      const { default: fulfillmentsRouter } = await import(
        '../src/webhooks/shopify-fulfillments.js'
      );

      const invalidPayload = {
        order_id: 123,
        status: 'success',
        // Missing id field
      };

      const req = {
        body: invalidPayload,
        shop: { id: 'shop_123', domain: 'test-shop.myshopify.com' },
        get: vi.fn().mockReturnValue('test-request-id'),
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockVerifyHmac = vi.fn((req, res, next) => next());
      fulfillmentsRouter.stack[0].handle = mockVerifyHmac;

      await new Promise((resolve) => {
        fulfillmentsRouter.stack[0].handle(req, res, () => {
          fulfillmentsRouter.stack[1].handle(req, res, resolve);
        });
      });

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'missing_fulfillment_id' });
    });
  });

  describe('Checkouts Webhook Contracts', () => {
    it('should accept valid checkouts/create payload', async () => {
      const { default: checkoutsRouter } = await import('../src/webhooks/shopify-checkouts.js');

      const validPayload = {
        id: 456,
        email: 'customer@example.com',
        phone: '+1234567890',
        abandoned_checkout_url: 'https://checkout.shopify.com/123',
        line_items: [
          {
            id: 789,
            title: 'Test Product',
            quantity: 1,
            price: '29.99',
          },
        ],
        total_price: '29.99',
        currency: 'USD',
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
      };

      const req = {
        body: validPayload,
        shop: { id: 'shop_123', domain: 'test-shop.myshopify.com' },
        get: vi.fn().mockReturnValue('test-request-id'),
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockVerifyHmac = vi.fn((req, res, next) => next());
      checkoutsRouter.stack[0].handle = mockVerifyHmac;

      await new Promise((resolve) => {
        checkoutsRouter.stack[0].handle(req, res, () => {
          checkoutsRouter.stack[1].handle(req, res, resolve);
        });
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true, eventId: 'event_123' });
    });

    it('should reject checkouts/create payload without ID', async () => {
      const { default: checkoutsRouter } = await import('../src/webhooks/shopify-checkouts.js');

      const invalidPayload = {
        email: 'customer@example.com',
        phone: '+1234567890',
        // Missing id field
      };

      const req = {
        body: invalidPayload,
        shop: { id: 'shop_123', domain: 'test-shop.myshopify.com' },
        get: vi.fn().mockReturnValue('test-request-id'),
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockVerifyHmac = vi.fn((req, res, next) => next());
      checkoutsRouter.stack[0].handle = mockVerifyHmac;

      await new Promise((resolve) => {
        checkoutsRouter.stack[0].handle(req, res, () => {
          checkoutsRouter.stack[1].handle(req, res, resolve);
        });
      });

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'missing_checkout_id' });
    });
  });

  describe('Customers Webhook Contracts', () => {
    it('should accept valid customers/create payload', async () => {
      const { default: customersRouter } = await import('../src/webhooks/shopify-customers.js');

      const validPayload = {
        id: 789,
        email: 'customer@example.com',
        phone: '+1234567890',
        first_name: 'John',
        last_name: 'Doe',
        accepts_marketing: true,
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
      };

      const req = {
        body: validPayload,
        shop: { id: 'shop_123', domain: 'test-shop.myshopify.com' },
        get: vi.fn().mockReturnValue('test-request-id'),
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockVerifyHmac = vi.fn((req, res, next) => next());
      customersRouter.stack[0].handle = mockVerifyHmac;

      await new Promise((resolve) => {
        customersRouter.stack[0].handle(req, res, () => {
          customersRouter.stack[1].handle(req, res, resolve);
        });
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true, eventId: 'event_123' });
    });

    it('should reject customers/create payload without ID', async () => {
      const { default: customersRouter } = await import('../src/webhooks/shopify-customers.js');

      const invalidPayload = {
        email: 'customer@example.com',
        phone: '+1234567890',
        first_name: 'John',
        last_name: 'Doe',
        // Missing id field
      };

      const req = {
        body: invalidPayload,
        shop: { id: 'shop_123', domain: 'test-shop.myshopify.com' },
        get: vi.fn().mockReturnValue('test-request-id'),
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockVerifyHmac = vi.fn((req, res, next) => next());
      customersRouter.stack[0].handle = mockVerifyHmac;

      await new Promise((resolve) => {
        customersRouter.stack[0].handle(req, res, () => {
          customersRouter.stack[1].handle(req, res, resolve);
        });
      });

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'missing_customer_id' });
    });
  });

  describe('Inventory Webhook Contracts', () => {
    it('should accept valid inventory_levels/update payload', async () => {
      const { default: inventoryRouter } = await import('../src/webhooks/shopify-inventory.js');

      const validPayload = {
        inventory_item_id: 123,
        location_id: 456,
        available: 10,
        updated_at: '2024-01-15T10:30:00Z',
      };

      const req = {
        body: validPayload,
        shop: { id: 'shop_123', domain: 'test-shop.myshopify.com' },
        get: vi.fn().mockReturnValue('test-request-id'),
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockVerifyHmac = vi.fn((req, res, next) => next());
      inventoryRouter.stack[0].handle = mockVerifyHmac;

      await new Promise((resolve) => {
        inventoryRouter.stack[0].handle(req, res, () => {
          inventoryRouter.stack[1].handle(req, res, resolve);
        });
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true, eventId: 'event_123' });
    });

    it('should reject inventory_levels/update payload without inventory_item_id', async () => {
      const { default: inventoryRouter } = await import('../src/webhooks/shopify-inventory.js');

      const invalidPayload = {
        location_id: 456,
        available: 10,
        // Missing inventory_item_id field
      };

      const req = {
        body: invalidPayload,
        shop: { id: 'shop_123', domain: 'test-shop.myshopify.com' },
        get: vi.fn().mockReturnValue('test-request-id'),
      };

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      const mockVerifyHmac = vi.fn((req, res, next) => next());
      inventoryRouter.stack[0].handle = mockVerifyHmac;

      await new Promise((resolve) => {
        inventoryRouter.stack[0].handle(req, res, () => {
          inventoryRouter.stack[1].handle(req, res, resolve);
        });
      });

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'missing_inventory_item_id' });
    });
  });

  describe('GDPR Webhook Contracts', () => {
    it('should accept valid customers/data_request payload', async () => {
      const { default: gdprRouter } = await import('../src/webhooks/shopify-gdpr.js');

      const validPayload = {
        customer: {
          id: 123,
          email: 'customer@example.com',
          phone: '+1234567890',
        },
        shop_domain: 'test-shop.myshopify.com',
        orders_to_redact: [456, 789],
      };

      const req = {
        body: validPayload,
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

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ ok: true, eventId: 'event_123' });
    });

    it('should reject customers/data_request payload without customer ID', async () => {
      const { default: gdprRouter } = await import('../src/webhooks/shopify-gdpr.js');

      const invalidPayload = {
        customer: {
          email: 'customer@example.com',
          phone: '+1234567890',
          // Missing id field
        },
        shop_domain: 'test-shop.myshopify.com',
      };

      const req = {
        body: invalidPayload,
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

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'missing_customer_id' });
    });
  });
});
