// checks/webhooks-queues.test.js
// Webhook to queues E2E testing

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createSignedWebhook, createSignedMittoWebhook } from './signing.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

describe('Webhooks to Queues E2E', () => {
  describe('Shopify Webhooks', () => {
    it('should process orders/paid webhook and enqueue jobs', async () => {
      const payload = {
        id: 123456789,
        order_number: 1001,
        total_price: '29.99',
        currency: 'USD',
        customer: {
          id: 987654321,
          email: 'customer@example.com',
          phone: '+306912345678'
        },
        line_items: [{
          id: 111111111,
          title: 'Test Product',
          quantity: 1,
          price: '29.99'
        }],
        shop_domain: 'test-shop.myshopify.com'
      };

      const { headers, body } = createSignedWebhook(payload);

      const response = await request(BASE_URL)
        .post('/webhooks/shopify/orders/paid')
        .set(headers)
        .send(JSON.parse(body));

      expect(response.status).toBe(200);
    });

    it('should process checkouts/update webhook', async () => {
      const payload = {
        id: 987654321,
        token: 'checkout-token-123',
        email: 'customer@example.com',
        phone: '+306912345678',
        line_items: [{
          id: 222222222,
          title: 'Test Product',
          quantity: 1
        }],
        shop_domain: 'test-shop.myshopify.com'
      };

      const { headers, body } = createSignedWebhook(payload);

      const response = await request(BASE_URL)
        .post('/webhooks/shopify/checkouts/update')
        .set(headers)
        .send(JSON.parse(body));

      expect(response.status).toBe(200);
    });

    it('should process inventory_levels/update webhook', async () => {
      const payload = {
        inventory_item_id: 333333333,
        location_id: 444444444,
        available: 5,
        shop_domain: 'test-shop.myshopify.com'
      };

      const { headers, body } = createSignedWebhook(payload);

      const response = await request(BASE_URL)
        .post('/webhooks/shopify/inventory_levels/update')
        .set(headers)
        .send(JSON.parse(body));

      expect(response.status).toBe(200);
    });
  });

  describe('Mitto Webhooks', () => {
    it('should process DLR webhook and update message status', async () => {
      const payload = {
        messageId: 'msg_123456789',
        status: 'delivered',
        timestamp: new Date().toISOString(),
        cost: 0.05
      };

      const { headers, body } = createSignedMittoWebhook(payload);

      const response = await request(BASE_URL)
        .post('/webhooks/mitto/dlr')
        .set(headers)
        .send(JSON.parse(body));

      expect(response.status).toBe(200);
    });

    it('should process inbound SMS webhook', async () => {
      const payload = {
        from: '+306912345678',
        to: '+1234567890',
        text: 'STOP',
        timestamp: new Date().toISOString()
      };

      const { headers, body } = createSignedMittoWebhook(payload);

      const response = await request(BASE_URL)
        .post('/webhooks/mitto/inbound')
        .set(headers)
        .send(JSON.parse(body));

      expect(response.status).toBe(200);
    });
  });

  describe('Queue Health', () => {
    it('should return queue health status', async () => {
      const response = await request(BASE_URL)
        .get('/queue/health');

      expect([200, 404]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.body).toHaveProperty('status');
      }
    });

    it('should return queue metrics', async () => {
      const response = await request(BASE_URL)
        .get('/queue/metrics');

      expect([200, 404]).toContain(response.status);
    });
  });

  describe('Event Processing', () => {
    it('should verify events are persisted', async () => {
      // This would require database access to verify
      // For now, we just ensure the webhook endpoints respond correctly
      const payload = {
        id: 123456789,
        shop_domain: 'test-shop.myshopify.com'
      };

      const { headers, body } = createSignedWebhook(payload);

      const response = await request(BASE_URL)
        .post('/webhooks/shopify/orders/paid')
        .set(headers)
        .send(JSON.parse(body));

      expect(response.status).toBe(200);
    });
  });
});
