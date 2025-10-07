// tests/webhook-integration.test.js
// Integration tests for webhook -> eventsQueue -> automationsQueue flow

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// Mock the queue system
const mockEnqueueJob = vi.fn().mockResolvedValue({ id: 'job_123' });
vi.mock('../src/queue/queues.js', () => ({
  enqueueJob: mockEnqueueJob,
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
  contact: {
    findMany: vi.fn(),
  },
};

vi.mock('../src/db/prismaClient.js', () => ({
  getPrismaClient: () => mockPrisma,
}));

// Mock the segment DSL
vi.mock('../src/services/segment-dsl.js', () => ({
  evaluateSegmentFilter: vi.fn().mockResolvedValue(true),
}));

describe('Webhook Integration Flow', () => {
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

  it('should process webhook -> eventsQueue -> automationsQueue flow', async () => {
    // Import the orders router
    const { default: ordersRouter } = await import('../src/webhooks/shopify-orders.js');

    // Create a valid HMAC signature
    const payload = JSON.stringify({ id: 123, name: 'Test Order', customer: { id: 456 } });
    const hmac = crypto
      .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET || 'test-secret')
      .update(payload, 'utf8')
      .digest('base64');

    const req = {
      body: JSON.parse(payload),
      shop: { id: 'shop_123', domain: 'test-shop.myshopify.com' },
      get: vi.fn().mockReturnValue(`sha256=${hmac}`),
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    // Mock HMAC verification to pass
    const mockVerifyHmac = vi.fn((req, res, next) => next());
    ordersRouter.stack[0].handle = mockVerifyHmac;

    // Process the webhook
    await new Promise((resolve) => {
      ordersRouter.stack[0].handle(req, res, () => {
        ordersRouter.stack[1].handle(req, res, resolve);
      });
    });

    // Verify event was stored
    expect(mockPrisma.event.create).toHaveBeenCalledWith({
      data: {
        shopId: 'shop_123',
        topic: 'orders/create',
        objectId: '123',
        raw: { id: 123, name: 'Test Order', customer: { id: 456 } },
        dedupeKey: 'shop_123:orders/create:123',
        receivedAt: expect.any(Date),
      },
    });

    // Verify job was enqueued to eventsQueue
    expect(mockEnqueueJob).toHaveBeenCalledWith('eventsQueue', 'orders:create', {
      eventId: 'event_123',
      shopId: 'shop_123',
      orderId: '123',
      orderData: { id: 123, name: 'Test Order', customer: { id: 456 } },
      requestId: `sha256=${hmac}`,
    });

    // Verify response
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ok: true, eventId: 'event_123' });
  });

  it('should handle fulfillment update webhook', async () => {
    const { default: fulfillmentsRouter } = await import('../src/webhooks/shopify-fulfillments.js');

    const payload = JSON.stringify({
      id: 789,
      order_id: 123,
      status: 'success',
      tracking_company: 'UPS',
    });
    const hmac = crypto
      .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET || 'test-secret')
      .update(payload, 'utf8')
      .digest('base64');

    const req = {
      body: JSON.parse(payload),
      shop: { id: 'shop_123', domain: 'test-shop.myshopify.com' },
      get: vi.fn().mockReturnValue(`sha256=${hmac}`),
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

    expect(mockEnqueueJob).toHaveBeenCalledWith('eventsQueue', 'fulfillments:update', {
      eventId: 'event_123',
      shopId: 'shop_123',
      fulfillmentId: '789',
      fulfillmentData: {
        id: 789,
        order_id: 123,
        status: 'success',
        tracking_company: 'UPS',
      },
      requestId: `sha256=${hmac}`,
    });
  });

  it('should handle checkout update webhook (abandoned checkout)', async () => {
    const { default: checkoutsRouter } = await import('../src/webhooks/shopify-checkouts.js');

    const payload = JSON.stringify({
      id: 456,
      email: 'customer@example.com',
      phone: '+1234567890',
      abandoned_checkout_url: 'https://checkout.shopify.com/123',
      line_items: [{ title: 'Test Product', quantity: 1 }],
    });
    const hmac = crypto
      .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET || 'test-secret')
      .update(payload, 'utf8')
      .digest('base64');

    const req = {
      body: JSON.parse(payload),
      shop: { id: 'shop_123', domain: 'test-shop.myshopify.com' },
      get: vi.fn().mockReturnValue(`sha256=${hmac}`),
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

    expect(mockEnqueueJob).toHaveBeenCalledWith('eventsQueue', 'checkouts:update', {
      eventId: 'event_123',
      shopId: 'shop_123',
      checkoutId: '456',
      checkoutData: {
        id: 456,
        email: 'customer@example.com',
        phone: '+1234567890',
        abandoned_checkout_url: 'https://checkout.shopify.com/123',
        line_items: [{ title: 'Test Product', quantity: 1 }],
      },
      requestId: `sha256=${hmac}`,
    });
  });

  it('should handle customer creation webhook', async () => {
    const { default: customersRouter } = await import('../src/webhooks/shopify-customers.js');

    const payload = JSON.stringify({
      id: 789,
      email: 'newcustomer@example.com',
      phone: '+1234567890',
      first_name: 'John',
      last_name: 'Doe',
      accepts_marketing: true,
    });
    const hmac = crypto
      .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET || 'test-secret')
      .update(payload, 'utf8')
      .digest('base64');

    const req = {
      body: JSON.parse(payload),
      shop: { id: 'shop_123', domain: 'test-shop.myshopify.com' },
      get: vi.fn().mockReturnValue(`sha256=${hmac}`),
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

    expect(mockEnqueueJob).toHaveBeenCalledWith('eventsQueue', 'customers:create', {
      eventId: 'event_123',
      shopId: 'shop_123',
      customerId: '789',
      customerData: {
        id: 789,
        email: 'newcustomer@example.com',
        phone: '+1234567890',
        first_name: 'John',
        last_name: 'Doe',
        accepts_marketing: true,
      },
      requestId: `sha256=${hmac}`,
    });
  });

  it('should handle inventory level update webhook', async () => {
    const { default: inventoryRouter } = await import('../src/webhooks/shopify-inventory.js');

    const payload = JSON.stringify({
      inventory_item_id: 123,
      location_id: 456,
      available: 10,
      updated_at: '2024-01-15T10:30:00Z',
    });
    const hmac = crypto
      .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET || 'test-secret')
      .update(payload, 'utf8')
      .digest('base64');

    const req = {
      body: JSON.parse(payload),
      shop: { id: 'shop_123', domain: 'test-shop.myshopify.com' },
      get: vi.fn().mockReturnValue(`sha256=${hmac}`),
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

    expect(mockEnqueueJob).toHaveBeenCalledWith('eventsQueue', 'inventory_levels:update', {
      eventId: 'event_123',
      shopId: 'shop_123',
      inventoryItemId: '123',
      inventoryData: {
        inventory_item_id: 123,
        location_id: 456,
        available: 10,
        updated_at: '2024-01-15T10:30:00Z',
      },
      requestId: `sha256=${hmac}`,
    });
  });
});

describe('Segment Preview Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.contact.findMany.mockResolvedValue([
      {
        id: 'contact_1',
        phoneE164: '+1234567890',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        optedOut: false,
        tagsJson: ['vip', 'newsletter'],
        createdAt: new Date('2024-01-01'),
        lastOrderAt: new Date('2024-01-15'),
        totalSpent: 150.0,
      },
      {
        id: 'contact_2',
        phoneE164: '+0987654321',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        optedOut: true,
        tagsJson: ['newsletter'],
        createdAt: new Date('2024-01-10'),
        lastOrderAt: null,
        totalSpent: 0,
      },
    ]);
  });

  it('should preview segment with DSL filter', async () => {
    const { default: segmentsPreviewRouter } = await import('../src/routes/segments-preview.js');

    const req = {
      body: {
        shopId: 'shop_123',
        filter: {
          and: [
            { field: 'optedOut', operator: 'equals', value: false },
            { field: 'totalSpent', operator: 'greater_than', value: 100 },
          ],
        },
        limit: 5,
      },
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    // Mock the segment DSL evaluation
    const { evaluateSegmentFilter } = await import('../src/services/segment-dsl.js');
    evaluateSegmentFilter.mockImplementation((contact, filter) => {
      if (filter.and) {
        return filter.and.every((condition) => {
          if (condition.field === 'optedOut') {
            return contact.optedOut === condition.value;
          }
          if (condition.field === 'totalSpent') {
            return contact.totalSpent > condition.value;
          }
          return false;
        });
      }
      return false;
    });

    await new Promise((resolve) => {
      segmentsPreviewRouter.stack[0].handle(req, res, () => {
        segmentsPreviewRouter.stack[1].handle(req, res, resolve);
      });
    });

    expect(mockPrisma.contact.findMany).toHaveBeenCalledWith({
      where: { shopId: 'shop_123' },
      select: {
        id: true,
        phoneE164: true,
        firstName: true,
        lastName: true,
        email: true,
        optedOut: true,
        tagsJson: true,
        createdAt: true,
        lastOrderAt: true,
        totalSpent: true,
      },
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      shopId: 'shop_123',
      filter: req.body.filter,
      totalMatches: 1,
      sampleIds: ['contact_1'],
      sampleContacts: [
        {
          id: 'contact_1',
          phoneE164: '+1234567890',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        },
      ],
      errors: [],
      evaluated: 2,
      metadata: {
        limit: 5,
        timeout: 5000,
        evaluated: 2,
        errorCount: 0,
      },
    });
  });

  it('should handle segment preview timeout', async () => {
    const { default: segmentsPreviewRouter } = await import('../src/routes/segments-preview.js');

    const req = {
      body: {
        shopId: 'shop_123',
        filter: { field: 'optedOut', operator: 'equals', value: false },
        timeout: 1, // Very short timeout
      },
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    // Mock a slow evaluation
    const { evaluateSegmentFilter } = await import('../src/services/segment-dsl.js');
    evaluateSegmentFilter.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return true;
    });

    await new Promise((resolve) => {
      segmentsPreviewRouter.stack[0].handle(req, res, () => {
        segmentsPreviewRouter.stack[1].handle(req, res, resolve);
      });
    });

    expect(res.status).toHaveBeenCalledWith(408);
    expect(res.json).toHaveBeenCalledWith({
      error: 'timeout',
      message: 'Segment preview timed out',
      timeout: 1,
    });
  });
});


