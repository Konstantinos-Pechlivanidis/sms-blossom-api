import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getPrismaClient } from '../../src/db/prismaClient.js';
import campaignPreparationRouter from '../../src/routes/campaign-preparation.js';

// Mock Prisma
vi.mock('../../src/db/prismaClient.js', () => ({
  getPrismaClient: vi.fn(() => ({
    shop: {
      findUnique: vi.fn(),
    },
    campaign: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    campaignRecipient: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    discountCode: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    shortlink: {
      create: vi.fn(),
    },
  })),
}));

// Mock LinkBuilder service
vi.mock('../../src/services/link-builder.js', () => ({
  buildDiscountUrl: vi.fn(),
}));

const app = express();
app.use(express.json());
app.use('/campaigns', campaignPreparationRouter);

const mockShop = {
  id: 'shop_123',
  domain: 'test-shop.myshopify.com',
};

const mockCampaign = {
  id: 'camp_123',
  shopId: 'shop_123',
  name: 'Test Campaign',
  discountConfig: {
    mode: 'pool',
    discountId: 'disc_123',
    codeStrategy: 'unique',
    redirectPath: '/checkout',
  },
};

const mockRecipients = [
  {
    id: 'recipient_1',
    campaignId: 'camp_123',
    contactId: 'contact_1',
    phone: '+1234567890',
  },
  {
    id: 'recipient_2',
    campaignId: 'camp_123',
    contactId: 'contact_2',
    phone: '+1234567891',
  },
];

const mockDiscountCodes = [
  {
    id: 'code_1',
    code: 'SAVE20_001',
    status: 'reserved',
    reservationId: 'res_123',
  },
  {
    id: 'code_2',
    code: 'SAVE20_002',
    status: 'reserved',
    reservationId: 'res_123',
  },
];

describe('Campaign Preparation Routes', () => {
  let prisma;

  beforeEach(() => {
    prisma = getPrismaClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('POST /campaigns/:id/prepare', () => {
    it('should prepare campaign with discount codes and shortlinks', async () => {
      prisma.shop.findUnique.mockResolvedValue(mockShop);
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);
      prisma.campaignRecipient.findMany.mockResolvedValue(mockRecipients);
      prisma.discountCode.findMany.mockResolvedValue(mockDiscountCodes);
      prisma.campaignRecipient.updateMany.mockResolvedValue({ count: 2 });
      prisma.discountCode.updateMany.mockResolvedValue({ count: 2 });
      prisma.shortlink.create.mockResolvedValue({ id: 'shortlink_123' });

      const { buildDiscountUrl } = await import('../../src/services/link-builder.js');
      buildDiscountUrl.mockReturnValue('https://test-shop.myshopify.com/discount/SAVE20_001?redirect=%2Fcheckout');

      const response = await request(app)
        .post('/campaigns/camp_123/prepare')
        .query({ shop: 'test-shop.myshopify.com' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('prepared', true);
      expect(response.body).toHaveProperty('codesAssigned', 2);
      expect(response.body).toHaveProperty('shortlinksBuilt', 2);
    });

    it('should handle campaign without discount configuration', async () => {
      const campaignWithoutDiscount = {
        ...mockCampaign,
        discountConfig: null,
      };

      prisma.shop.findUnique.mockResolvedValue(mockShop);
      prisma.campaign.findUnique.mockResolvedValue(campaignWithoutDiscount);
      prisma.campaignRecipient.findMany.mockResolvedValue(mockRecipients);

      const response = await request(app)
        .post('/campaigns/camp_123/prepare')
        .query({ shop: 'test-shop.myshopify.com' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('prepared', true);
      expect(response.body).toHaveProperty('codesAssigned', 0);
      expect(response.body).toHaveProperty('shortlinksBuilt', 0);
    });

    it('should handle campaign with shared discount strategy', async () => {
      const campaignWithSharedDiscount = {
        ...mockCampaign,
        discountConfig: {
          mode: 'shared',
          discountId: 'disc_123',
          codeStrategy: 'shared',
          redirectPath: '/checkout',
        },
      };

      prisma.shop.findUnique.mockResolvedValue(mockShop);
      prisma.campaign.findUnique.mockResolvedValue(campaignWithSharedDiscount);
      prisma.campaignRecipient.findMany.mockResolvedValue(mockRecipients);
      prisma.shortlink.create.mockResolvedValue({ id: 'shortlink_123' });

      const { buildDiscountUrl } = await import('../../src/services/link-builder.js');
      buildDiscountUrl.mockReturnValue('https://test-shop.myshopify.com/discount/SAVE20?redirect=%2Fcheckout');

      const response = await request(app)
        .post('/campaigns/camp_123/prepare')
        .query({ shop: 'test-shop.myshopify.com' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('prepared', true);
      expect(response.body).toHaveProperty('codesAssigned', 0);
      expect(response.body).toHaveProperty('shortlinksBuilt', 2);
    });

    it('should return 404 for unknown campaign', async () => {
      prisma.shop.findUnique.mockResolvedValue(mockShop);
      prisma.campaign.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/campaigns/unknown/prepare')
        .query({ shop: 'test-shop.myshopify.com' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'campaign_not_found');
    });

    it('should return 404 for unknown shop', async () => {
      prisma.shop.findUnique.mockResolvedValue(null);

      const response = await request(app)
        .post('/campaigns/camp_123/prepare')
        .query({ shop: 'unknown-shop.myshopify.com' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'unknown_shop');
    });

    it('should handle insufficient discount codes', async () => {
      prisma.shop.findUnique.mockResolvedValue(mockShop);
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);
      prisma.campaignRecipient.findMany.mockResolvedValue(mockRecipients);
      prisma.discountCode.findMany.mockResolvedValue([mockDiscountCodes[0]]); // Only 1 code available

      const response = await request(app)
        .post('/campaigns/camp_123/prepare')
        .query({ shop: 'test-shop.myshopify.com' });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error', 'insufficient_codes');
      expect(response.body).toHaveProperty('available', 1);
      expect(response.body).toHaveProperty('needed', 2);
    });

    it('should handle error during preparation', async () => {
      prisma.shop.findUnique.mockResolvedValue(mockShop);
      prisma.campaign.findUnique.mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .post('/campaigns/camp_123/prepare')
        .query({ shop: 'test-shop.myshopify.com' });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'preparation_error');
    });
  });
});
