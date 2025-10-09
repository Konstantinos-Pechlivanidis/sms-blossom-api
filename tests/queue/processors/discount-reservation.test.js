import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPrismaClient } from '../../../src/db/prismaClient.js';
import {
  processDiscountReservation,
  processDiscountCodeAssignment,
  processDiscountCodeRelease,
} from '../../../src/queue/processors/discount-reservation.js';

// Mock Prisma
vi.mock('../../../src/db/prismaClient.js', () => ({
  getPrismaClient: vi.fn(() => ({
    campaign: {
      findUnique: vi.fn(),
    },
    discountCodePool: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    discountCode: {
      count: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    discountCodeReservation: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    campaignRecipient: {
      findUnique: vi.fn(),
    },
  })),
}));

describe('Discount Reservation Processors', () => {
  let prisma;

  beforeEach(() => {
    prisma = getPrismaClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('processDiscountReservation', () => {
    const mockJob = {
      id: 'job_123',
      payload: {
        campaignId: 'camp_123',
        poolId: 'pool_123',
        quantity: 50,
        batchSize: 10,
      },
    };

    const mockCampaign = {
      id: 'camp_123',
      shopId: 'shop_123',
      name: 'Test Campaign',
    };

    const mockPool = {
      id: 'pool_123',
      shopId: 'shop_123',
      discountId: 'disc_123',
      totalCodes: 1000,
      reservedCodes: 100,
      usedCodes: 50,
    };

    it('should process discount reservation successfully', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);
      prisma.discountCodePool.findUnique.mockResolvedValue(mockPool);
      prisma.discountCode.count.mockResolvedValue(100); // 100 available codes
      prisma.discountCodeReservation.create.mockResolvedValue({
        id: 'res_123',
        quantity: 50,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      prisma.discountCode.findMany.mockResolvedValue(
        Array.from({ length: 50 }, (_, i) => ({ id: `code_${i}`, status: 'available' }))
      );
      prisma.discountCode.updateMany.mockResolvedValue({ count: 50 });
      prisma.discountCodePool.update.mockResolvedValue({});

      await processDiscountReservation(mockJob);

      expect(prisma.campaign.findUnique).toHaveBeenCalledWith({
        where: { id: 'camp_123' },
      });
      expect(prisma.discountCodePool.findUnique).toHaveBeenCalledWith({
        where: { id: 'pool_123' },
      });
      expect(prisma.discountCodeReservation.create).toHaveBeenCalled();
      expect(prisma.discountCode.updateMany).toHaveBeenCalled();
      expect(prisma.discountCodePool.update).toHaveBeenCalled();
    });

    it('should handle campaign not found', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);

      await processDiscountReservation(mockJob);

      expect(prisma.campaign.findUnique).toHaveBeenCalledWith({
        where: { id: 'camp_123' },
      });
      expect(prisma.discountCodePool.findUnique).not.toHaveBeenCalled();
    });

    it('should handle pool not found', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);
      prisma.discountCodePool.findUnique.mockResolvedValue(null);

      await processDiscountReservation(mockJob);

      expect(prisma.campaign.findUnique).toHaveBeenCalledWith({
        where: { id: 'camp_123' },
      });
      expect(prisma.discountCodePool.findUnique).toHaveBeenCalledWith({
        where: { id: 'pool_123' },
      });
      expect(prisma.discountCodeReservation.create).not.toHaveBeenCalled();
    });

    it('should handle insufficient available codes', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);
      prisma.discountCodePool.findUnique.mockResolvedValue(mockPool);
      prisma.discountCode.count.mockResolvedValue(30); // Only 30 available, need 50

      await processDiscountReservation(mockJob);

      expect(prisma.campaign.findUnique).toHaveBeenCalledWith({
        where: { id: 'camp_123' },
      });
      expect(prisma.discountCodePool.findUnique).toHaveBeenCalledWith({
        where: { id: 'pool_123' },
      });
      expect(prisma.discountCodeReservation.create).not.toHaveBeenCalled();
    });

    it('should handle batch processing', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);
      prisma.discountCodePool.findUnique.mockResolvedValue(mockPool);
      prisma.discountCode.count.mockResolvedValue(100);
      prisma.discountCodeReservation.create.mockResolvedValue({
        id: 'res_123',
        quantity: 50,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      // Mock multiple batches
      prisma.discountCode.findMany
        .mockResolvedValueOnce(Array.from({ length: 10 }, (_, i) => ({ id: `code_${i}` })))
        .mockResolvedValueOnce(Array.from({ length: 10 }, (_, i) => ({ id: `code_${i + 10}` })))
        .mockResolvedValueOnce(Array.from({ length: 10 }, (_, i) => ({ id: `code_${i + 20}` })))
        .mockResolvedValueOnce(Array.from({ length: 10 }, (_, i) => ({ id: `code_${i + 30}` })))
        .mockResolvedValueOnce(Array.from({ length: 10 }, (_, i) => ({ id: `code_${i + 40}` })));

      prisma.discountCode.updateMany.mockResolvedValue({ count: 10 });
      prisma.discountCodePool.update.mockResolvedValue({});

      await processDiscountReservation(mockJob);

      expect(prisma.discountCode.findMany).toHaveBeenCalledTimes(5);
      expect(prisma.discountCode.updateMany).toHaveBeenCalledTimes(5);
    });
  });

  describe('processDiscountCodeAssignment', () => {
    const mockJob = {
      id: 'job_123',
      payload: {
        campaignId: 'camp_123',
        recipientId: 'recipient_123',
        discountCodeId: 'code_123',
      },
    };

    const mockDiscountCode = {
      id: 'code_123',
      code: 'SAVE20_001',
      status: 'reserved',
      reservationId: 'res_123',
    };

    const mockRecipient = {
      id: 'recipient_123',
      campaignId: 'camp_123',
      contactId: 'contact_123',
    };

    it('should assign discount code to recipient', async () => {
      prisma.discountCode.findUnique.mockResolvedValue(mockDiscountCode);
      prisma.campaignRecipient.findUnique.mockResolvedValue(mockRecipient);
      prisma.discountCode.update.mockResolvedValue({});

      await processDiscountCodeAssignment(mockJob);

      expect(prisma.discountCode.findUnique).toHaveBeenCalledWith({
        where: { id: 'code_123' },
      });
      expect(prisma.campaignRecipient.findUnique).toHaveBeenCalledWith({
        where: { id: 'recipient_123' },
      });
      expect(prisma.discountCode.update).toHaveBeenCalledWith({
        where: { id: 'code_123' },
        data: {
          status: 'assigned',
          assignedTo: 'recipient_123',
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should handle discount code not found', async () => {
      prisma.discountCode.findUnique.mockResolvedValue(null);

      await processDiscountCodeAssignment(mockJob);

      expect(prisma.discountCode.findUnique).toHaveBeenCalledWith({
        where: { id: 'code_123' },
      });
      expect(prisma.discountCode.update).not.toHaveBeenCalled();
    });

    it('should handle recipient not found', async () => {
      prisma.discountCode.findUnique.mockResolvedValue(mockDiscountCode);
      prisma.campaignRecipient.findUnique.mockResolvedValue(null);

      await processDiscountCodeAssignment(mockJob);

      expect(prisma.discountCode.findUnique).toHaveBeenCalledWith({
        where: { id: 'code_123' },
      });
      expect(prisma.campaignRecipient.findUnique).toHaveBeenCalledWith({
        where: { id: 'recipient_123' },
      });
      expect(prisma.discountCode.update).not.toHaveBeenCalled();
    });

    it('should handle discount code not reserved', async () => {
      const availableCode = {
        ...mockDiscountCode,
        status: 'available',
      };

      prisma.discountCode.findUnique.mockResolvedValue(availableCode);

      await processDiscountCodeAssignment(mockJob);

      expect(prisma.discountCode.findUnique).toHaveBeenCalledWith({
        where: { id: 'code_123' },
      });
      expect(prisma.discountCode.update).not.toHaveBeenCalled();
    });
  });

  describe('processDiscountCodeRelease', () => {
    const mockJob = {
      id: 'job_123',
      payload: {
        reservationId: 'res_123',
        reason: 'unused',
      },
    };

    const mockReservation = {
      id: 'res_123',
      shopId: 'shop_123',
      poolId: 'pool_123',
      campaignId: 'camp_123',
      quantity: 50,
      status: 'active',
    };

    it('should release discount codes from reservation', async () => {
      prisma.discountCodeReservation.findUnique.mockResolvedValue(mockReservation);
      prisma.discountCode.updateMany.mockResolvedValue({ count: 50 });
      prisma.discountCodePool.update.mockResolvedValue({});
      prisma.discountCodeReservation.update.mockResolvedValue({});

      await processDiscountCodeRelease(mockJob);

      expect(prisma.discountCodeReservation.findUnique).toHaveBeenCalledWith({
        where: { id: 'res_123' },
      });
      expect(prisma.discountCode.updateMany).toHaveBeenCalledWith({
        where: {
          reservationId: 'res_123',
          status: 'reserved',
        },
        data: {
          status: 'available',
          reservedAt: null,
          reservationId: null,
          updatedAt: expect.any(Date),
        },
      });
      expect(prisma.discountCodePool.update).toHaveBeenCalledWith({
        where: { id: 'pool_123' },
        data: {
          reservedCodes: {
            decrement: 50,
          },
        },
      });
      expect(prisma.discountCodeReservation.update).toHaveBeenCalledWith({
        where: { id: 'res_123' },
        data: {
          status: 'released',
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should handle reservation not found', async () => {
      prisma.discountCodeReservation.findUnique.mockResolvedValue(null);

      await processDiscountCodeRelease(mockJob);

      expect(prisma.discountCodeReservation.findUnique).toHaveBeenCalledWith({
        where: { id: 'res_123' },
      });
      expect(prisma.discountCode.updateMany).not.toHaveBeenCalled();
    });

    it('should handle no codes to release', async () => {
      prisma.discountCodeReservation.findUnique.mockResolvedValue(mockReservation);
      prisma.discountCode.updateMany.mockResolvedValue({ count: 0 }); // No codes to release
      prisma.discountCodePool.update.mockResolvedValue({});
      prisma.discountCodeReservation.update.mockResolvedValue({});

      await processDiscountCodeRelease(mockJob);

      expect(prisma.discountCodeReservation.findUnique).toHaveBeenCalledWith({
        where: { id: 'res_123' },
      });
      expect(prisma.discountCode.updateMany).toHaveBeenCalled();
      expect(prisma.discountCodePool.update).toHaveBeenCalledWith({
        where: { id: 'pool_123' },
        data: {
          reservedCodes: {
            decrement: 0,
          },
        },
      });
    });
  });
});
