// tests/segments-preview.test.js
// Segment preview endpoint tests

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/server.js';
import { getPrismaClient } from '../src/db/prismaClient.js';

const prisma = getPrismaClient();

// Mock the logger
vi.mock('../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Segment Preview', () => {
  let testShop;

  beforeEach(async () => {
    // Clean up test data
    await prisma.event.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.shop.deleteMany();

    // Create test shop
    testShop = await prisma.shop.create({
      data: { domain: 'test-shop.myshopify.com' },
    });

    // Create test contacts
    await prisma.contact.createMany({
      data: [
        {
          shopId: testShop.id,
          phoneE164: '+1234567890',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          smsConsentState: 'opted_in',
          tagsJson: ['vip', 'premium'],
          locale: 'en',
          optedOut: false,
        },
        {
          shopId: testShop.id,
          phoneE164: '+1234567891',
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@example.com',
          smsConsentState: 'opted_out',
          tagsJson: ['regular'],
          locale: 'el',
          optedOut: true,
        },
        {
          shopId: testShop.id,
          phoneE164: '+1234567892',
          firstName: 'Bob',
          lastName: 'Johnson',
          email: 'bob@example.com',
          smsConsentState: 'unknown',
          tagsJson: ['vip'],
          locale: 'en',
          optedOut: false,
        },
      ],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /segments/preview', () => {
    it('should preview segment with consent filter', async () => {
      const filter = { consent: 'opted_in' };

      const response = await request(app)
        .post('/segments/preview')
        .send({
          shop: 'test-shop.myshopify.com',
          filter,
          limit: 10,
        })
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.count).toBe(1);
      expect(response.body.sampleIds).toHaveLength(1);
      expect(response.body.shop).toBe('test-shop.myshopify.com');
      expect(response.body.filter).toEqual(filter);
      expect(response.body.executionTime).toBeGreaterThan(0);
    });

    it('should preview segment with tag filter', async () => {
      const filter = { tag: 'vip' };

      const response = await request(app)
        .post('/segments/preview')
        .send({
          shop: 'test-shop.myshopify.com',
          filter,
          limit: 10,
        })
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.count).toBe(2);
      expect(response.body.sampleIds).toHaveLength(2);
    });

    it('should preview segment with complex filter', async () => {
      const filter = {
        and: [{ consent: 'opted_in' }, { tag: 'vip' }, { locale: 'en' }],
      };

      const response = await request(app)
        .post('/segments/preview')
        .send({
          shop: 'test-shop.myshopify.com',
          filter,
          limit: 10,
        })
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.count).toBe(1);
      expect(response.body.sampleIds).toHaveLength(1);
    });

    it('should preview segment with OR filter', async () => {
      const filter = {
        or: [{ consent: 'opted_in' }, { consent: 'unknown' }],
      };

      const response = await request(app)
        .post('/segments/preview')
        .send({
          shop: 'test-shop.myshopify.com',
          filter,
          limit: 10,
        })
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.count).toBe(2);
      expect(response.body.sampleIds).toHaveLength(2);
    });

    it('should respect limit parameter', async () => {
      const filter = { tag: 'vip' };

      const response = await request(app)
        .post('/segments/preview')
        .send({
          shop: 'test-shop.myshopify.com',
          filter,
          limit: 1,
        })
        .expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.count).toBe(2);
      expect(response.body.sampleIds).toHaveLength(1);
      expect(response.body.limit).toBe(1);
    });

    it('should handle timeout', async () => {
      const filter = { consent: 'opted_in' };

      const response = await request(app)
        .post('/segments/preview')
        .send({
          shop: 'test-shop.myshopify.com',
          filter,
          timeout: 1, // 1ms timeout
        })
        .expect(408);

      expect(response.body.error).toBe('request_timeout');
    });

    it('should validate required parameters', async () => {
      const response = await request(app).post('/segments/preview').send({}).expect(400);

      expect(response.body.error).toBe('shop_required');
    });

    it('should validate filter parameter', async () => {
      const response = await request(app)
        .post('/segments/preview')
        .send({
          shop: 'test-shop.myshopify.com',
        })
        .expect(400);

      expect(response.body.error).toBe('filter_required');
    });

    it('should handle non-existent shop', async () => {
      const filter = { consent: 'opted_in' };

      const response = await request(app)
        .post('/segments/preview')
        .send({
          shop: 'non-existent-shop.myshopify.com',
          filter,
        })
        .expect(404);

      expect(response.body.error).toBe('shop_not_found');
    });

    it('should enforce maximum limit', async () => {
      const filter = { consent: 'opted_in' };

      const response = await request(app)
        .post('/segments/preview')
        .send({
          shop: 'test-shop.myshopify.com',
          filter,
          limit: 1000, // Exceeds maximum
        })
        .expect(200);

      expect(response.body.limit).toBe(100);
    });

    it('should enforce maximum timeout', async () => {
      const filter = { consent: 'opted_in' };

      const response = await request(app)
        .post('/segments/preview')
        .send({
          shop: 'test-shop.myshopify.com',
          filter,
          timeout: 30000, // Exceeds maximum
        })
        .expect(200);

      // Should be capped at maxTimeout
      expect(response.body.executionTime).toBeLessThan(10000);
    });
  });

  describe('POST /segments/validate', () => {
    it('should validate valid filter', async () => {
      const filter = {
        and: [{ consent: 'opted_in' }, { tag: 'vip' }],
      };

      const response = await request(app).post('/segments/validate').send({ filter }).expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.valid).toBe(true);
      expect(response.body.warnings).toEqual([]);
    });

    it('should validate filter with warnings', async () => {
      const filter = {
        and: [{ consent: 'opted_in' }, { tag: 'vip' }, { unsupported_operator: 'test' }],
      };

      const response = await request(app).post('/segments/validate').send({ filter }).expect(200);

      expect(response.body.ok).toBe(true);
      expect(response.body.valid).toBe(true);
      expect(response.body.warnings.length).toBeGreaterThan(0);
    });

    it('should reject invalid filter', async () => {
      const filter = {
        conditions: 'invalid', // Should be array
      };

      const response = await request(app).post('/segments/validate').send({ filter }).expect(400);

      expect(response.body.error).toBe('invalid_filter');
      expect(response.body.details).toBeDefined();
    });

    it('should reject non-object filter', async () => {
      const filter = 'invalid';

      const response = await request(app).post('/segments/validate').send({ filter }).expect(400);

      expect(response.body.error).toBe('invalid_filter');
    });

    it('should validate required parameters', async () => {
      const response = await request(app).post('/segments/validate').send({}).expect(400);

      expect(response.body.error).toBe('filter_required');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Mock database error
      vi.spyOn(prisma.contact, 'count').mockRejectedValue(new Error('Database error'));

      const filter = { consent: 'opted_in' };

      const response = await request(app)
        .post('/segments/preview')
        .send({
          shop: 'test-shop.myshopify.com',
          filter,
        })
        .expect(500);

      expect(response.body.error).toBe('internal_error');
    });

    it('should handle invalid DSL filter', async () => {
      const filter = {
        invalidField: 'invalid',
      };

      const response = await request(app)
        .post('/segments/preview')
        .send({
          shop: 'test-shop.myshopify.com',
          filter,
        })
        .expect(500);

      expect(response.body.error).toBe('internal_error');
    });
  });
});
