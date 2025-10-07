import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import {
  shopifyOrdersRouter,
  shopifyFulfillmentsRouter,
  shopifyCheckoutsRouter,
  shopifyCustomersRouter,
  shopifyInventoryRouter,
  shopifyGdprRouter,
} from '../../src/webhooks/shopify-orders.js';
import { mittoDlrRouter, mittoInboundRouter } from '../../src/webhooks/mitto-dlr.js';

/**
 * Contract tests for webhook endpoints
 * Validates HMAC verification and payload processing
 */
describe('Webhook Contract Tests', () => {
  let app;
  const webhookSecret = 'test_webhook_secret';
  const mittoSecret = 'test_mitto_secret';

  beforeAll(() => {
    app = express();
    app.use(express.raw({ type: 'application/json' }));
    app.use(express.json());

    // Set environment variables for HMAC verification
    process.env.WEBHOOK_HMAC_SECRET = webhookSecret;
    process.env.MITTO_HMAC_SECRET = mittoSecret;

    // Register webhook routes
    app.use('/webhooks/shopify', shopifyOrdersRouter);
    app.use('/webhooks/shopify', shopifyFulfillmentsRouter);
    app.use('/webhooks/shopify', shopifyCheckoutsRouter);
    app.use('/webhooks/shopify', shopifyCustomersRouter);
    app.use('/webhooks/shopify', shopifyInventoryRouter);
    app.use('/webhooks/shopify', shopifyGdprRouter);
    app.use('/webhooks/mitto/dlr', mittoDlrRouter);
    app.use('/webhooks/mitto/inbound', mittoInboundRouter);
  });

  function generateShopifyHmac(payload) {
    return crypto.createHmac('sha256', webhookSecret).update(payload, 'utf8').digest('base64');
  }

  function generateMittoHmac(payload) {
    return crypto.createHmac('sha256', mittoSecret).update(JSON.stringify(payload)).digest('hex');
  }

  describe('Shopify Webhooks', () => {
    it('should process orders/create webhook with valid HMAC', async () => {
      const payload = JSON.stringify({
        id: 123456789,
        order_number: 1001,
        customer: {
          id: 987654321,
          email: 'customer@example.com',
          first_name: 'John',
          last_name: 'Doe',
        },
        line_items: [
          {
            id: 111111111,
            title: 'Test Product',
            quantity: 1,
            price: '29.99',
          },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const hmac = generateShopifyHmac(payload);

      const response = await request(app)
        .post('/webhooks/shopify/orders/create')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('X-Shopify-Shop-Domain', 'test-shop.myshopify.com')
        .set('X-Shopify-Topic', 'orders/create')
        .send(payload)
        .expect(200);

      expect(response.body).toHaveProperty('ok');
      expect(response.body.ok).toBe(true);
    });

    it('should process orders/paid webhook', async () => {
      const payload = JSON.stringify({
        id: 123456790,
        order_number: 1002,
        financial_status: 'paid',
        total_price: '59.98',
        currency: 'USD',
      });

      const hmac = generateShopifyHmac(payload);

      const response = await request(app)
        .post('/webhooks/shopify/orders/paid')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('X-Shopify-Shop-Domain', 'test-shop.myshopify.com')
        .set('X-Shopify-Topic', 'orders/paid')
        .send(payload)
        .expect(200);

      expect(response.body).toHaveProperty('ok');
      expect(response.body.ok).toBe(true);
    });

    it('should process fulfillments/create webhook', async () => {
      const payload = JSON.stringify({
        id: 222222222,
        order_id: 123456789,
        status: 'success',
        tracking_company: 'UPS',
        tracking_number: '1Z999AA1234567890',
        created_at: new Date().toISOString(),
      });

      const hmac = generateShopifyHmac(payload);

      const response = await request(app)
        .post('/webhooks/shopify/fulfillments/create')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('X-Shopify-Shop-Domain', 'test-shop.myshopify.com')
        .set('X-Shopify-Topic', 'fulfillments/create')
        .send(payload)
        .expect(200);

      expect(response.body).toHaveProperty('ok');
      expect(response.body.ok).toBe(true);
    });

    it('should process checkouts/create webhook (abandoned checkout)', async () => {
      const payload = JSON.stringify({
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
      });

      const hmac = generateShopifyHmac(payload);

      const response = await request(app)
        .post('/webhooks/shopify/checkouts/create')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('X-Shopify-Shop-Domain', 'test-shop.myshopify.com')
        .set('X-Shopify-Topic', 'checkouts/create')
        .send(payload)
        .expect(200);

      expect(response.body).toHaveProperty('ok');
      expect(response.body.ok).toBe(true);
    });

    it('should process customers/create webhook', async () => {
      const payload = JSON.stringify({
        id: 555555555,
        email: 'newcustomer@example.com',
        first_name: 'Jane',
        last_name: 'Smith',
        phone: '+1987654321',
        created_at: new Date().toISOString(),
      });

      const hmac = generateShopifyHmac(payload);

      const response = await request(app)
        .post('/webhooks/shopify/customers/create')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('X-Shopify-Shop-Domain', 'test-shop.myshopify.com')
        .set('X-Shopify-Topic', 'customers/create')
        .send(payload)
        .expect(200);

      expect(response.body).toHaveProperty('ok');
      expect(response.body.ok).toBe(true);
    });

    it('should process inventory_levels/update webhook', async () => {
      const payload = JSON.stringify({
        inventory_item_id: 666666666,
        location_id: 777777777,
        available: 5,
        updated_at: new Date().toISOString(),
      });

      const hmac = generateShopifyHmac(payload);

      const response = await request(app)
        .post('/webhooks/shopify/inventory_levels/update')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('X-Shopify-Shop-Domain', 'test-shop.myshopify.com')
        .set('X-Shopify-Topic', 'inventory_levels/update')
        .send(payload)
        .expect(200);

      expect(response.body).toHaveProperty('ok');
      expect(response.body.ok).toBe(true);
    });

    it('should process GDPR webhooks', async () => {
      // Test customers/data_request
      const dataRequestPayload = JSON.stringify({
        customer: {
          id: 888888888,
          email: 'customer@example.com',
        },
        orders_requested: true,
      });

      const hmac = generateShopifyHmac(dataRequestPayload);

      const response = await request(app)
        .post('/webhooks/shopify/customers/data_request')
        .set('X-Shopify-Hmac-Sha256', hmac)
        .set('X-Shopify-Shop-Domain', 'test-shop.myshopify.com')
        .set('X-Shopify-Topic', 'customers/data_request')
        .send(dataRequestPayload)
        .expect(200);

      expect(response.body).toHaveProperty('ok');
      expect(response.body.ok).toBe(true);
    });

    it('should reject webhooks with invalid HMAC', async () => {
      const payload = JSON.stringify({
        id: 123456789,
        order_number: 1001,
      });

      const response = await request(app)
        .post('/webhooks/shopify/orders/create')
        .set('X-Shopify-Hmac-Sha256', 'invalid_hmac')
        .set('X-Shopify-Shop-Domain', 'test-shop.myshopify.com')
        .set('X-Shopify-Topic', 'orders/create')
        .send(payload)
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('invalid_hmac');
    });

    it('should reject webhooks without HMAC header', async () => {
      const payload = JSON.stringify({
        id: 123456789,
        order_number: 1001,
      });

      const response = await request(app)
        .post('/webhooks/shopify/orders/create')
        .set('X-Shopify-Shop-Domain', 'test-shop.myshopify.com')
        .set('X-Shopify-Topic', 'orders/create')
        .send(payload)
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('missing_hmac');
    });
  });

  describe('Mitto Webhooks', () => {
    it('should process DLR webhook with valid HMAC', async () => {
      const payload = {
        message_id: 'msg_123456789',
        status: 'delivered',
        delivered_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
      };

      const hmac = generateMittoHmac(payload);

      const response = await request(app)
        .post('/webhooks/mitto/dlr')
        .set('X-Mitto-Signature', hmac)
        .send(payload)
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body.success).toBe(true);
    });

    it('should process inbound STOP message', async () => {
      const payload = {
        from: '+1234567890',
        text: 'STOP',
        timestamp: new Date().toISOString(),
      };

      const hmac = generateMittoHmac(payload);

      const response = await request(app)
        .post('/webhooks/mitto/inbound')
        .set('X-Mitto-Signature', hmac)
        .send(payload)
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body.success).toBe(true);
    });

    it('should process inbound HELP message', async () => {
      const payload = {
        from: '+1234567890',
        text: 'HELP',
        timestamp: new Date().toISOString(),
      };

      const hmac = generateMittoHmac(payload);

      const response = await request(app)
        .post('/webhooks/mitto/inbound')
        .set('X-Mitto-Signature', hmac)
        .send(payload)
        .expect(200);

      expect(response.body).toHaveProperty('success');
      expect(response.body.success).toBe(true);
    });

    it('should reject DLR webhook with invalid HMAC', async () => {
      const payload = {
        message_id: 'msg_123456789',
        status: 'delivered',
      };

      const response = await request(app)
        .post('/webhooks/mitto/dlr')
        .set('X-Mitto-Signature', 'invalid_signature')
        .send(payload)
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('invalid_signature');
    });
  });
});
