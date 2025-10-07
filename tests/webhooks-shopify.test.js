// tests/webhooks-shopify.test.js
// Comprehensive webhook tests for Shopify integration

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app } from '../src/server.js';
import { getPrismaClient } from '../src/db/prismaClient.js';

const prisma = getPrismaClient();

// Mock the queue system
vi.mock('../src/queue/driver.js', () => ({
  enqueueEvent: vi.fn().mockResolvedValue({}),
  isRedis: vi.fn().mockReturnValue(false),
}));

// Mock the logger
vi.mock('../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Shopify Webhooks', () => {
  beforeEach(async () => {
    // Clean up test data
    await prisma.event.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.shop.deleteMany();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('HMAC Verification', () => {
    it('should reject requests without HMAC signature', async () => {
      const response = await request(app)
        .post('/webhooks/shopify/orders/create')
        .send({ id: '123' })
        .expect(401);

      expect(response.body.error).toBe('invalid_signature');
    });

    it('should reject requests with invalid HMAC signature', async () => {
      const response = await request(app)
        .post('/webhooks/shopify/orders/create')
        .set('X-Shopify-Hmac-Sha256', 'invalid-signature')
        .send({ id: '123' })
        .expect(401);

      expect(response.body.error).toBe('invalid_signature');
    });

    it('should accept requests with valid HMAC signature', async () => {
      const payload = JSON.stringify({ id: '123', customer: { id: '456' } });
      const hmac = crypto
        .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET || 'test-secret')
        .update(payload, 'utf8')
        .digest('base64');

      const response = await request(app)
        .post('/webhooks/shopify/orders/create')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('X-Shopify-Shop-Domain', 'test-shop.myshopify.com')
        .set('Content-Type', 'application/json')
        .send(payload)
        .expect(200);

      expect(response.body.ok).toBe(true);
    });
  });

  describe('Orders Webhooks', () => {
    const createValidRequest = (topic, payload) => {
      const body = JSON.stringify(payload);
      const hmac = crypto
        .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET || 'test-secret')
        .update(body, 'utf8')
        .digest('base64');

      return request(app)
        .post(`/webhooks/shopify/${topic}`)
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('X-Shopify-Shop-Domain', 'test-shop.myshopify.com')
        .set('Content-Type', 'application/json')
        .send(body);
    };

    it('should handle orders/create webhook', async () => {
      const payload = {
        id: '123',
        customer: { id: '456', email: 'test@example.com' },
        total_price: '29.99',
        currency: 'USD',
        line_items: [
          {
            id: '789',
            title: 'Test Product',
            quantity: 1,
            price: '29.99',
          },
        ],
      };

      const response = await createValidRequest('orders/create', payload);

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);

      // Verify event was stored
      const event = await prisma.event.findFirst({
        where: { topic: 'orders/create', objectId: '123' },
      });

      expect(event).toBeTruthy();
      expect(event.raw).toEqual(payload);
    });

    it('should handle orders/paid webhook', async () => {
      const payload = {
        id: '123',
        customer: { id: '456', email: 'test@example.com' },
        total_price: '29.99',
        currency: 'USD',
        financial_status: 'paid',
        processed_at: '2024-01-15T10:30:00Z',
      };

      const response = await createValidRequest('orders/paid', payload);

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);

      // Verify event was stored
      const event = await prisma.event.findFirst({
        where: { topic: 'orders/paid', objectId: '123' },
      });

      expect(event).toBeTruthy();
      expect(event.raw).toEqual(payload);
    });
  });

  describe('Fulfillments Webhooks', () => {
    const createValidRequest = (topic, payload) => {
      const body = JSON.stringify(payload);
      const hmac = crypto
        .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET || 'test-secret')
        .update(body, 'utf8')
        .digest('base64');

      return request(app)
        .post(`/webhooks/shopify/${topic}`)
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('X-Shopify-Shop-Domain', 'test-shop.myshopify.com')
        .set('Content-Type', 'application/json')
        .send(body);
    };

    it('should handle fulfillments/create webhook', async () => {
      const payload = {
        id: '123',
        order_id: '456',
        status: 'success',
        tracking_company: 'UPS',
        tracking_number: '1Z999AA1234567890',
        created_at: '2024-01-15T10:30:00Z',
      };

      const response = await createValidRequest('fulfillments/create', payload);

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);

      // Verify event was stored
      const event = await prisma.event.findFirst({
        where: { topic: 'fulfillments/create', objectId: '123' },
      });

      expect(event).toBeTruthy();
      expect(event.raw).toEqual(payload);
    });

    it('should handle fulfillments/update webhook', async () => {
      const payload = {
        id: '123',
        order_id: '456',
        status: 'success',
        tracking_company: 'UPS',
        tracking_number: '1Z999AA1234567890',
        updated_at: '2024-01-15T10:30:00Z',
      };

      const response = await createValidRequest('fulfillments/update', payload);

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);

      // Verify event was stored
      const event = await prisma.event.findFirst({
        where: { topic: 'fulfillments/update', objectId: '123' },
      });

      expect(event).toBeTruthy();
      expect(event.raw).toEqual(payload);
    });
  });

  describe('Checkouts Webhooks', () => {
    const createValidRequest = (topic, payload) => {
      const body = JSON.stringify(payload);
      const hmac = crypto
        .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET || 'test-secret')
        .update(body, 'utf8')
        .digest('base64');

      return request(app)
        .post(`/webhooks/shopify/${topic}`)
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('X-Shopify-Shop-Domain', 'test-shop.myshopify.com')
        .set('Content-Type', 'application/json')
        .send(body);
    };

    it('should handle checkouts/create webhook', async () => {
      const payload = {
        id: '123',
        customer: { id: '456', email: 'test@example.com' },
        total_price: '29.99',
        currency: 'USD',
        email: 'test@example.com',
        created_at: '2024-01-15T10:30:00Z',
      };

      const response = await createValidRequest('checkouts/create', payload);

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);

      // Verify event was stored
      const event = await prisma.event.findFirst({
        where: { topic: 'checkouts/create', objectId: '123' },
      });

      expect(event).toBeTruthy();
      expect(event.raw).toEqual(payload);
    });

    it('should handle checkouts/update webhook', async () => {
      const payload = {
        id: '123',
        customer: { id: '456', email: 'test@example.com' },
        total_price: '29.99',
        currency: 'USD',
        email: 'test@example.com',
        abandoned_checkout_url: 'https://test-shop.myshopify.com/checkouts/123',
        updated_at: '2024-01-15T10:30:00Z',
      };

      const response = await createValidRequest('checkouts/update', payload);

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);

      // Verify event was stored
      const event = await prisma.event.findFirst({
        where: { topic: 'checkouts/update', objectId: '123' },
      });

      expect(event).toBeTruthy();
      expect(event.raw).toEqual(payload);
    });
  });

  describe('Customers Webhooks', () => {
    const createValidRequest = (topic, payload) => {
      const body = JSON.stringify(payload);
      const hmac = crypto
        .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET || 'test-secret')
        .update(body, 'utf8')
        .digest('base64');

      return request(app)
        .post(`/webhooks/shopify/${topic}`)
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('X-Shopify-Shop-Domain', 'test-shop.myshopify.com')
        .set('Content-Type', 'application/json')
        .send(body);
    };

    it('should handle customers/create webhook', async () => {
      const payload = {
        id: '123',
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        phone: '+1234567890',
        accepts_marketing: true,
        created_at: '2024-01-15T10:30:00Z',
      };

      const response = await createValidRequest('customers/create', payload);

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);

      // Verify event was stored
      const event = await prisma.event.findFirst({
        where: { topic: 'customers/create', objectId: '123' },
      });

      expect(event).toBeTruthy();
      expect(event.raw).toEqual(payload);
    });

    it('should handle customers/update webhook', async () => {
      const payload = {
        id: '123',
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        phone: '+1234567890',
        accepts_marketing: false,
        updated_at: '2024-01-15T10:30:00Z',
      };

      const response = await createValidRequest('customers/update', payload);

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);

      // Verify event was stored
      const event = await prisma.event.findFirst({
        where: { topic: 'customers/update', objectId: '123' },
      });

      expect(event).toBeTruthy();
      expect(event.raw).toEqual(payload);
    });
  });

  describe('Inventory Webhooks', () => {
    const createValidRequest = (topic, payload) => {
      const body = JSON.stringify(payload);
      const hmac = crypto
        .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET || 'test-secret')
        .update(body, 'utf8')
        .digest('base64');

      return request(app)
        .post(`/webhooks/shopify/${topic}`)
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('X-Shopify-Shop-Domain', 'test-shop.myshopify.com')
        .set('Content-Type', 'application/json')
        .send(body);
    };

    it('should handle inventory_levels/update webhook', async () => {
      const payload = {
        inventory_item_id: '123',
        location_id: '456',
        available: 10,
        updated_at: '2024-01-15T10:30:00Z',
      };

      const response = await createValidRequest('inventory_levels/update', payload);

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);

      // Verify event was stored
      const event = await prisma.event.findFirst({
        where: { topic: 'inventory_levels/update', objectId: '123' },
      });

      expect(event).toBeTruthy();
      expect(event.raw).toEqual(payload);
    });
  });

  describe('GDPR Webhooks', () => {
    const createValidRequest = (topic, payload) => {
      const body = JSON.stringify(payload);
      const hmac = crypto
        .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET || 'test-secret')
        .update(body, 'utf8')
        .digest('base64');

      return request(app)
        .post(`/webhooks/shopify/${topic}`)
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('X-Shopify-Shop-Domain', 'test-shop.myshopify.com')
        .set('Content-Type', 'application/json')
        .send(body);
    };

    it('should handle customers/data_request webhook', async () => {
      const payload = {
        customer: { id: '123' },
        orders_requested: [{ id: '456' }],
      };

      const response = await createValidRequest('customers/data_request', payload);

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);

      // Verify event was stored
      const event = await prisma.event.findFirst({
        where: { topic: 'customers/data_request', objectId: '123' },
      });

      expect(event).toBeTruthy();
      expect(event.raw).toEqual(payload);
    });

    it('should handle customers/redact webhook', async () => {
      const payload = {
        customer: { id: '123' },
        orders_to_redact: [{ id: '456' }],
      };

      const response = await createValidRequest('customers/redact', payload);

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);

      // Verify event was stored
      const event = await prisma.event.findFirst({
        where: { topic: 'customers/redact', objectId: '123' },
      });

      expect(event).toBeTruthy();
      expect(event.raw).toEqual(payload);
    });

    it('should handle shop/redact webhook', async () => {
      const payload = {
        shop_id: '123',
        shop_domain: 'test-shop.myshopify.com',
      };

      const response = await createValidRequest('shop/redact', payload);

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);

      // Verify event was stored
      const event = await prisma.event.findFirst({
        where: { topic: 'shop/redact', objectId: '123' },
      });

      expect(event).toBeTruthy();
      expect(event.raw).toEqual(payload);
    });
  });

  describe('Deduplication', () => {
    it('should handle duplicate events gracefully', async () => {
      const payload = { id: '123', customer: { id: '456' } };
      const body = JSON.stringify(payload);
      const hmac = crypto
        .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET || 'test-secret')
        .update(body, 'utf8')
        .digest('base64');

      // First request
      const response1 = await request(app)
        .post('/webhooks/shopify/orders/create')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('X-Shopify-Shop-Domain', 'test-shop.myshopify.com')
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(200);

      expect(response1.body.ok).toBe(true);

      // Second request (duplicate)
      const response2 = await request(app)
        .post('/webhooks/shopify/orders/create')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('X-Shopify-Shop-Domain', 'test-shop.myshopify.com')
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(200);

      expect(response2.body.ok).toBe(true);

      // Verify only one event was stored
      const events = await prisma.event.findMany({
        where: { topic: 'orders/create', objectId: '123' },
      });

      expect(events).toHaveLength(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSON payload', async () => {
      const hmac = crypto
        .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET || 'test-secret')
        .update('invalid json', 'utf8')
        .digest('base64');

      const response = await request(app)
        .post('/webhooks/shopify/orders/create')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('X-Shopify-Shop-Domain', 'test-shop.myshopify.com')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(500);

      expect(response.body.error).toBe('internal_error');
    });

    it('should handle missing shop domain', async () => {
      const payload = { id: '123' };
      const body = JSON.stringify(payload);
      const hmac = crypto
        .createHmac('sha256', process.env.WEBHOOK_HMAC_SECRET || 'test-secret')
        .update(body, 'utf8')
        .digest('base64');

      const response = await request(app)
        .post('/webhooks/shopify/orders/create')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('Content-Type', 'application/json')
        .send(body)
        .expect(500);

      expect(response.body.error).toBe('internal_error');
    });
  });
});
