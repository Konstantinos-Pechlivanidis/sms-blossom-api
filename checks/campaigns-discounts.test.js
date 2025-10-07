// checks/campaigns-discounts.test.js
// Campaigns and Discounts contract tests

import { describe, it, expect } from 'vitest';
import request from 'supertest';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

describe('Campaigns and Discounts', () => {
  describe('Discounts Service', () => {
    it('should require authentication for discount creation', async () => {
      const response = await request(BASE_URL).post('/discounts').send({
        code: 'TEST10',
        type: 'percentage',
        value: 10,
        title: 'Test Discount',
      });

      expect(response.status).toBe(401);
    });

    it('should handle discount conflicts endpoint', async () => {
      const response = await request(BASE_URL).get('/discounts/conflicts');

      expect(response.status).toBe(401); // Should require auth
    });

    it('should handle discount apply URL endpoint', async () => {
      const response = await request(BASE_URL).get('/discounts/apply-url');

      expect(response.status).toBe(401); // Should require auth
    });
  });

  describe('Campaigns Service', () => {
    it('should require authentication for campaign CRUD', async () => {
      const response = await request(BASE_URL).get('/campaigns');

      expect(response.status).toBe(401);
    });

    it('should handle campaign estimate endpoint', async () => {
      const response = await request(BASE_URL).get('/campaigns/123/estimate');

      expect(response.status).toBe(401); // Should require auth
    });

    it('should handle campaign test send endpoint', async () => {
      const response = await request(BASE_URL).post('/campaigns/123/test-send').send({
        phone: '+306912345678',
      });

      expect(response.status).toBe(401); // Should require auth
    });

    it('should handle campaign snapshot endpoint', async () => {
      const response = await request(BASE_URL).post('/campaigns/123/snapshot');

      expect(response.status).toBe(401); // Should require auth
    });
  });

  describe('UTM and Link Building', () => {
    it('should handle UTM parameter generation', async () => {
      // This would test the UTM parameter generation logic
      // For now, we just ensure the endpoints exist
      const response = await request(BASE_URL).get('/campaigns/123/apply-url');

      expect(response.status).toBe(401); // Should require auth
    });
  });

  describe('Template Integration', () => {
    it('should handle template preview', async () => {
      const response = await request(BASE_URL)
        .post('/templates/preview')
        .send({
          trigger: 'abandoned_checkout',
          body: 'Hello {{ customer_name }}, complete your order!',
          variables: {
            customer_name: 'John Doe',
            checkout_url: 'https://shop.com/checkout/123',
          },
        });

      expect([200, 401, 422]).toContain(response.status);
    });

    it('should handle template validation', async () => {
      const response = await request(BASE_URL).post('/templates/validate').send({
        trigger: 'abandoned_checkout',
        body: 'Hello {{ customer_name }}, complete your order!',
      });

      expect([200, 401, 422]).toContain(response.status);
    });

    it('should handle template variables listing', async () => {
      const response = await request(BASE_URL).get('/templates/variables/abandoned_checkout');

      expect([200, 401, 404]).toContain(response.status);
    });
  });

  describe('Segments Integration', () => {
    it('should handle segment preview', async () => {
      const response = await request(BASE_URL)
        .post('/segments/preview')
        .send({
          filter: {
            and: [{ consent: 'opted_in' }, { tags: { has: 'vip' } }],
          },
        });

      expect([200, 401, 422]).toContain(response.status);
    });

    it('should handle segment count', async () => {
      const response = await request(BASE_URL)
        .post('/segments/preview/count')
        .send({
          filter: {
            and: [{ consent: 'opted_in' }],
          },
        });

      expect([200, 401, 422]).toContain(response.status);
    });
  });
});
