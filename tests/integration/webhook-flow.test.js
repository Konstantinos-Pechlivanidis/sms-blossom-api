import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MockShopifyServer } from '../mocks/mock-shopify.js';
import { MockMittoServer } from '../mocks/mock-mitto.js';

/**
 * Integration tests for webhook → eventsQueue → automationsQueue flow
 * Tests the complete webhook processing pipeline
 */
describe('Webhook Integration Flow', () => {
  let mockShopify;
  let mockMitto;
  let mockPrisma;
  let mockEnqueueJob;

  beforeAll(async () => {
    // Start mock servers
    mockShopify = new MockShopifyServer(3001);
    mockMitto = new MockMittoServer(3002);

    await mockShopify.start();
    await mockMitto.start();
  });

  afterAll(async () => {
    await mockShopify.stop();
    await mockMitto.stop();
  });

  beforeEach(() => {
    // Reset mocks
    mockPrisma = {
      event: {
        create: vi.fn(),
        findFirst: vi.fn(),
      },
      contact: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
      message: {
        create: vi.fn(),
        update: vi.fn(),
      },
    };

    mockEnqueueJob = vi.fn();

    // Mock the modules
    vi.doMock('../../src/db/prismaClient.js', () => ({
      prisma: mockPrisma,
    }));

    vi.doMock('../../src/queue/queues.js', () => ({
      enqueueJob: mockEnqueueJob,
    }));
  });

  describe('Orders Webhook Flow', () => {
    it('should process orders/create webhook end-to-end', async () => {
      // Mock webhook payload
      const webhookPayload = {
        id: 123456789,
        order_number: 1001,
        customer: {
          id: 987654321,
          email: 'customer@example.com',
          first_name: 'John',
          last_name: 'Doe',
          phone: '+1234567890',
        },
        line_items: [
          {
            id: 111111111,
            title: 'Test Product',
            quantity: 1,
            price: '29.99',
          },
        ],
        total_price: '29.99',
        currency: 'USD',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Mock event creation
      mockPrisma.event.create.mockResolvedValue({
        id: 'event-123',
        shopId: 'shop-123',
        topic: 'orders/create',
        objectId: '123456789',
        raw: webhookPayload,
        dedupeKey: 'shop-123:orders/create:123456789',
        createdAt: new Date(),
      });

      // Mock queue job enqueuing
      mockEnqueueJob.mockResolvedValue({ id: 'job-123' });

      // Simulate webhook processing
      const { processShopifyWebhook } = await import('../../src/webhooks/shopify-orders.js');

      const result = await processShopifyWebhook({
        shopId: 'shop-123',
        topic: 'orders/create',
        payload: webhookPayload,
      });

      // Verify event was stored
      expect(mockPrisma.event.create).toHaveBeenCalledWith({
        data: {
          shopId: 'shop-123',
          topic: 'orders/create',
          objectId: '123456789',
          raw: webhookPayload,
          dedupeKey: expect.stringMatching(/^shop-123:orders\/create:/),
        },
      });

      // Verify job was enqueued
      expect(mockEnqueueJob).toHaveBeenCalledWith('eventsQueue', 'orders/create', {
        eventId: expect.any(String),
        shopId: 'shop-123',
        topic: 'orders/create',
        objectId: '123456789',
        payload: webhookPayload,
      });

      expect(result).toEqual({
        ok: true,
        eventId: expect.any(String),
      });
    });

    it('should process orders/paid webhook', async () => {
      const webhookPayload = {
        id: 123456790,
        order_number: 1002,
        financial_status: 'paid',
        total_price: '59.98',
        currency: 'USD',
        customer: {
          id: 987654321,
          email: 'customer@example.com',
          first_name: 'John',
          last_name: 'Doe',
        },
      };

      mockPrisma.event.create.mockResolvedValue({
        id: 'event-124',
        shopId: 'shop-123',
        topic: 'orders/paid',
        objectId: '123456790',
        raw: webhookPayload,
        dedupeKey: 'shop-123:orders/paid:123456790',
        createdAt: new Date(),
      });

      const { processShopifyWebhook } = await import('../../src/webhooks/shopify-orders.js');

      const result = await processShopifyWebhook({
        shopId: 'shop-123',
        topic: 'orders/paid',
        payload: webhookPayload,
      });

      expect(result.ok).toBe(true);
      expect(mockEnqueueJob).toHaveBeenCalledWith('eventsQueue', 'orders/paid', expect.any(Object));
    });
  });

  describe('Fulfillment Webhook Flow', () => {
    it('should process fulfillments/create webhook', async () => {
      const webhookPayload = {
        id: 222222222,
        order_id: 123456789,
        status: 'success',
        tracking_company: 'UPS',
        tracking_number: '1Z999AA1234567890',
        created_at: new Date().toISOString(),
      };

      mockPrisma.event.create.mockResolvedValue({
        id: 'event-125',
        shopId: 'shop-123',
        topic: 'fulfillments/create',
        objectId: '222222222',
        raw: webhookPayload,
        dedupeKey: 'shop-123:fulfillments/create:222222222',
        createdAt: new Date(),
      });

      const { processShopifyWebhook } = await import('../../src/webhooks/shopify-fulfillments.js');

      const result = await processShopifyWebhook({
        shopId: 'shop-123',
        topic: 'fulfillments/create',
        payload: webhookPayload,
      });

      expect(result.ok).toBe(true);
      expect(mockEnqueueJob).toHaveBeenCalledWith(
        'eventsQueue',
        'fulfillments/create',
        expect.any(Object),
      );
    });
  });

  describe('Checkout Webhook Flow', () => {
    it('should process checkouts/create webhook (abandoned checkout)', async () => {
      const webhookPayload = {
        id: 333333333,
        token: 'checkout-token-123',
        email: 'customer@example.com',
        phone: '+1234567890',
        line_items: [
          {
            id: 444444444,
            title: 'Abandoned Product',
            quantity: 2,
            price: '19.99',
          },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockPrisma.event.create.mockResolvedValue({
        id: 'event-126',
        shopId: 'shop-123',
        topic: 'checkouts/create',
        objectId: '333333333',
        raw: webhookPayload,
        dedupeKey: 'shop-123:checkouts/create:333333333',
        createdAt: new Date(),
      });

      const { processShopifyWebhook } = await import('../../src/webhooks/shopify-checkouts.js');

      const result = await processShopifyWebhook({
        shopId: 'shop-123',
        topic: 'checkouts/create',
        payload: webhookPayload,
      });

      expect(result.ok).toBe(true);
      expect(mockEnqueueJob).toHaveBeenCalledWith(
        'eventsQueue',
        'checkouts/create',
        expect.any(Object),
      );
    });
  });

  describe('Customer Webhook Flow', () => {
    it('should process customers/create webhook', async () => {
      const webhookPayload = {
        id: 555555555,
        email: 'newcustomer@example.com',
        first_name: 'Jane',
        last_name: 'Smith',
        phone: '+1987654321',
        created_at: new Date().toISOString(),
      };

      mockPrisma.event.create.mockResolvedValue({
        id: 'event-127',
        shopId: 'shop-123',
        topic: 'customers/create',
        objectId: '555555555',
        raw: webhookPayload,
        dedupeKey: 'shop-123:customers/create:555555555',
        createdAt: new Date(),
      });

      const { processShopifyWebhook } = await import('../../src/webhooks/shopify-customers.js');

      const result = await processShopifyWebhook({
        shopId: 'shop-123',
        topic: 'customers/create',
        payload: webhookPayload,
      });

      expect(result.ok).toBe(true);
      expect(mockEnqueueJob).toHaveBeenCalledWith(
        'eventsQueue',
        'customers/create',
        expect.any(Object),
      );
    });
  });

  describe('Inventory Webhook Flow', () => {
    it('should process inventory_levels/update webhook', async () => {
      const webhookPayload = {
        inventory_item_id: 666666666,
        location_id: 777777777,
        available: 5,
        updated_at: new Date().toISOString(),
      };

      mockPrisma.event.create.mockResolvedValue({
        id: 'event-128',
        shopId: 'shop-123',
        topic: 'inventory_levels/update',
        objectId: '666666666',
        raw: webhookPayload,
        dedupeKey: 'shop-123:inventory_levels/update:666666666',
        createdAt: new Date(),
      });

      const { processShopifyWebhook } = await import('../../src/webhooks/shopify-inventory.js');

      const result = await processShopifyWebhook({
        shopId: 'shop-123',
        topic: 'inventory_levels/update',
        payload: webhookPayload,
      });

      expect(result.ok).toBe(true);
      expect(mockEnqueueJob).toHaveBeenCalledWith(
        'eventsQueue',
        'inventory_levels/update',
        expect.any(Object),
      );
    });
  });

  describe('GDPR Webhook Flow', () => {
    it('should process customers/data_request webhook', async () => {
      const webhookPayload = {
        customer: {
          id: 888888888,
          email: 'customer@example.com',
        },
        orders_requested: true,
      };

      mockPrisma.event.create.mockResolvedValue({
        id: 'event-129',
        shopId: 'shop-123',
        topic: 'customers/data_request',
        objectId: '888888888',
        raw: webhookPayload,
        dedupeKey: 'shop-123:customers/data_request:888888888',
        createdAt: new Date(),
      });

      const { processShopifyWebhook } = await import('../../src/webhooks/shopify-gdpr.js');

      const result = await processShopifyWebhook({
        shopId: 'shop-123',
        topic: 'customers/data_request',
        payload: webhookPayload,
      });

      expect(result.ok).toBe(true);
      expect(mockEnqueueJob).toHaveBeenCalledWith(
        'housekeepingQueue',
        'gdpr_customer_data_request',
        expect.any(Object),
      );
    });

    it('should process customers/redact webhook', async () => {
      const webhookPayload = {
        customer: {
          id: 999999999,
          email: 'customer@example.com',
        },
      };

      mockPrisma.event.create.mockResolvedValue({
        id: 'event-130',
        shopId: 'shop-123',
        topic: 'customers/redact',
        objectId: '999999999',
        raw: webhookPayload,
        dedupeKey: 'shop-123:customers/redact:999999999',
        createdAt: new Date(),
      });

      const { processShopifyWebhook } = await import('../../src/webhooks/shopify-gdpr.js');

      const result = await processShopifyWebhook({
        shopId: 'shop-123',
        topic: 'customers/redact',
        payload: webhookPayload,
      });

      expect(result.ok).toBe(true);
      expect(mockEnqueueJob).toHaveBeenCalledWith(
        'housekeepingQueue',
        'gdpr_customer_redact',
        expect.any(Object),
      );
    });

    it('should process shop/redact webhook', async () => {
      const webhookPayload = {
        shop_id: 123456789,
        shop_domain: 'test-shop.myshopify.com',
      };

      mockPrisma.event.create.mockResolvedValue({
        id: 'event-131',
        shopId: 'shop-123',
        topic: 'shop/redact',
        objectId: '123456789',
        raw: webhookPayload,
        dedupeKey: 'shop-123:shop/redact:123456789',
        createdAt: new Date(),
      });

      const { processShopifyWebhook } = await import('../../src/webhooks/shopify-gdpr.js');

      const result = await processShopifyWebhook({
        shopId: 'shop-123',
        topic: 'shop/redact',
        payload: webhookPayload,
      });

      expect(result.ok).toBe(true);
      expect(mockEnqueueJob).toHaveBeenCalledWith(
        'housekeepingQueue',
        'gdpr_shop_redact',
        expect.any(Object),
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockPrisma.event.create.mockRejectedValue(new Error('Database connection failed'));

      const { processShopifyWebhook } = await import('../../src/webhooks/shopify-orders.js');

      const result = await processShopifyWebhook({
        shopId: 'shop-123',
        topic: 'orders/create',
        payload: { id: 123456789 },
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('database_error');
    });

    it('should handle queue errors gracefully', async () => {
      mockPrisma.event.create.mockResolvedValue({
        id: 'event-132',
        shopId: 'shop-123',
        topic: 'orders/create',
        objectId: '123456789',
        raw: {},
        dedupeKey: 'shop-123:orders/create:123456789',
        createdAt: new Date(),
      });

      mockEnqueueJob.mockRejectedValue(new Error('Queue connection failed'));

      const { processShopifyWebhook } = await import('../../src/webhooks/shopify-orders.js');

      const result = await processShopifyWebhook({
        shopId: 'shop-123',
        topic: 'orders/create',
        payload: { id: 123456789 },
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('queue_error');
    });
  });
});


