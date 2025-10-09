import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getPrismaClient } from '../../src/db/prismaClient.js';
import discountPoolingRouter from '../../src/routes/discount-pooling.js';

// Mock Prisma
vi.mock('../../src/db/prismaClient.js', () => ({
  getPrismaClient: vi.fn(() => ({
    shop: {
      findUnique: vi.fn(),
    },
    discount: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    discountCodePool: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    discountCode: {
      create: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    discountCodeReservation: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  })),
}));

// Mock Shopify GraphQL service
vi.mock('../../src/services/shopify-graphql.js', () => ({
  fetchExistingDiscounts: vi.fn(),
  createBasicCode: vi.fn(),
}));

const app = express();
app.use(express.json());
app.use('/discounts', discountPoolingRouter);

const mockShop = {
  id: 'shop_123',
  domain: 'test-shop.myshopify.com',
};

const mockDiscount = {
  id: 'disc_123',
  shopId: 'shop_123',
  code: 'SAVE20',
  type: 'percentage',
  value: 20,
};

const mockPool = {
  id: 'pool_123',
  shopId: 'shop_123',
  discountId: 'disc_123',
  name: 'Test Pool',
  totalCodes: 100,
  reservedCodes: 10,
  usedCodes: 5,
  status: 'active',
};

describe('Discount Pooling Routes', () => {
  let prisma;

  beforeEach(() => {
    prisma = getPrismaClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('POST /discounts/sync-from-shopify', () => {
    it('should sync discounts from Shopify', async () => {
      prisma.shop.findUnique.mockResolvedValue(mockShop);
      prisma.discount.findMany.mockResolvedValue([]);
      
      const { fetchExistingDiscounts } = await import('../../src/services/shopify-graphql.js');
      fetchExistingDiscounts.mockResolvedValue({
        data: {
          codeDiscountNodes: {
            edges: [
              {
                node: {
                  id: 'gid://shopify/DiscountCodeNode/123',
                  codeDiscount: {
                    title: '20% Off',
                    code: 'SAVE20',
                    status: 'ACTIVE',
                  },
                },
              },
            ],
          },
        },
      });

      const response = await request(app)
        .post('/discounts/sync-from-shopify')
        .query({ shop: 'test-shop.myshopify.com' })
        .send({ query: 'status:active' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('imported');
      expect(response.body).toHaveProperty('skipped');
    });

    it('should return 404 for unknown shop', async () => {
      prisma.shop.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/discounts/sync-from-shopify')
        .query({ shop: 'unknown-shop.myshopify.com' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'unknown_shop');
    });
  });

  describe('POST /discounts/:id/pool/import', () => {
    it('should import discount codes to pool', async () => {
      prisma.shop.findUnique.mockResolvedValue(mockShop);
      prisma.discount.findUnique.mockResolvedValue(mockDiscount);
      prisma.discountCodePool.findFirst.mockResolvedValue(mockPool);
      prisma.discountCode.createMany.mockResolvedValue({ count: 3 });

      const response = await request(app)
        .post('/discounts/disc_123/pool/import')
        .query({ shop: 'test-shop.myshopify.com' })
        .send({
          codes: ['SAVE20_001', 'SAVE20_002', 'SAVE20_003'],
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('imported', 3);
      expect(response.body).toHaveProperty('skipped', 0);
    });

    it('should return 404 for unknown discount', async () => {
      prisma.shop.findUnique.mockResolvedValue(mockShop);
      prisma.discount.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/discounts/unknown/pool/import')
        .query({ shop: 'test-shop.myshopify.com' })
        .send({
          codes: ['SAVE20_001'],
        });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'discount_not_found');
    });
  });

  describe('POST /discounts/:id/pool/generate', () => {
    it('should generate discount codes via Shopify API', async () => {
      prisma.shop.findUnique.mockResolvedValue(mockShop);
      prisma.discount.findUnique.mockResolvedValue(mockDiscount);
      prisma.discountCodePool.findFirst.mockResolvedValue(mockPool);
      
      const { createBasicCode } = await import('../../src/services/shopify-graphql.js');
      createBasicCode.mockResolvedValue({
        data: {
          discountCodeBasicCreate: {
            codeDiscountNode: {
              id: 'gid://shopify/DiscountCodeNode/123',
            },
          },
        },
      });

      prisma.discountCode.createMany.mockResolvedValue({ count: 10 });

      const response = await request(app)
        .post('/discounts/disc_123/pool/generate')
        .query({ shop: 'test-shop.myshopify.com' })
        .send({
          quantity: 10,
          prefix: 'SAVE20',
          pattern: 'SAVE20_{NUMBER}',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('generated', 10);
      expect(response.body).toHaveProperty('shopifyGids');
    });
  });

  describe('GET /discounts/:id/pool/status', () => {
    it('should return pool status', async () => {
      prisma.shop.findUnique.mockResolvedValue(mockShop);
      prisma.discount.findUnique.mockResolvedValue(mockDiscount);
      prisma.discountCodePool.findFirst.mockResolvedValue(mockPool);
      prisma.discountCode.count.mockResolvedValue(85);

      const response = await request(app)
        .get('/discounts/disc_123/pool/status')
        .query({ shop: 'test-shop.myshopify.com' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total', 100);
      expect(response.body).toHaveProperty('reserved', 10);
      expect(response.body).toHaveProperty('available', 85);
      expect(response.body).toHaveProperty('used', 5);
    });
  });

  describe('POST /discounts/:id/pool/reserve', () => {
    it('should reserve discount codes for campaign', async () => {
      prisma.shop.findUnique.mockResolvedValue(mockShop);
      prisma.discount.findUnique.mockResolvedValue(mockDiscount);
      prisma.discountCodePool.findFirst.mockResolvedValue(mockPool);
      prisma.discountCode.count.mockResolvedValue(50);
      prisma.discountCodeReservation.create.mockResolvedValue({
        id: 'res_123',
        quantity: 10,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const response = await request(app)
        .post('/discounts/disc_123/pool/reserve')
        .query({ shop: 'test-shop.myshopify.com' })
        .send({
          campaignId: 'camp_123',
          count: 10,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('reservationId');
      expect(response.body).toHaveProperty('reserved', 10);
      expect(response.body).toHaveProperty('expiresAt');
    });

    it('should return 409 if insufficient codes available', async () => {
      prisma.shop.findUnique.mockResolvedValue(mockShop);
      prisma.discount.findUnique.mockResolvedValue(mockDiscount);
      prisma.discountCodePool.findFirst.mockResolvedValue(mockPool);
      prisma.discountCode.count.mockResolvedValue(5); // Only 5 available

      const response = await request(app)
        .post('/discounts/disc_123/pool/reserve')
        .query({ shop: 'test-shop.myshopify.com' })
        .send({
          campaignId: 'camp_123',
          count: 10, // Requesting 10 but only 5 available
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error', 'insufficient_codes');
    });
  });

  describe('DELETE /discounts/:id/pool/reservations/:reservationId', () => {
    it('should delete reservation and release codes', async () => {
      prisma.shop.findUnique.mockResolvedValue(mockShop);
      prisma.discountCodeReservation.findUnique.mockResolvedValue({
        id: 'res_123',
        quantity: 10,
        status: 'active',
      });
      prisma.discountCode.updateMany.mockResolvedValue({ count: 10 });
      prisma.discountCodeReservation.delete.mockResolvedValue({});

      const response = await request(app)
        .delete('/discounts/disc_123/pool/reservations/res_123')
        .query({ shop: 'test-shop.myshopify.com' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('cancelled', true);
      expect(response.body).toHaveProperty('released', 10);
    });

    it('should return 404 for unknown reservation', async () => {
      prisma.shop.findUnique.mockResolvedValue(mockShop);
      prisma.discountCodeReservation.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .delete('/discounts/disc_123/pool/reservations/unknown')
        .query({ shop: 'test-shop.myshopify.com' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'reservation_not_found');
    });
  });
});
