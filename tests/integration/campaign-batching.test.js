import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { MockMittoServer } from '../mocks/mock-mitto.js';

/**
 * Integration tests for campaign batching and job queuing
 * Tests campaign audience materialization and job distribution
 */
describe('Campaign Batching Integration', () => {
  let mockMitto;
  let mockPrisma;
  let mockEnqueueJob;

  beforeAll(async () => {
    mockMitto = new MockMittoServer(3002);
    await mockMitto.start();
  });

  afterAll(async () => {
    await mockMitto.stop();
  });

  beforeEach(() => {
    // Reset mocks
    mockPrisma = {
      campaign: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      contact: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
      segment: {
        findFirst: vi.fn(),
      },
      template: {
        findFirst: vi.fn(),
      },
      discount: {
        findFirst: vi.fn(),
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

  describe('Campaign Audience Snapshot', () => {
    it('should snapshot campaign audience and enqueue jobs', async () => {
      const campaignId = 'campaign-123';
      const shopId = 'shop-123';
      const batchSize = 100;

      // Mock campaign data
      mockPrisma.campaign.findFirst.mockResolvedValue({
        id: campaignId,
        shopId,
        name: 'Test Campaign',
        status: 'scheduled',
        batchSize,
        segmentId: 'segment-123',
        templateId: 'template-123',
        discountId: 'discount-123',
      });

      // Mock segment data
      mockPrisma.segment.findFirst.mockResolvedValue({
        id: 'segment-123',
        name: 'Test Segment',
        filterJson: {
          operator: 'and',
          conditions: [
            {
              field: 'smsConsentState',
              operator: 'equals',
              value: 'opted_in',
            },
          ],
        },
      });

      // Mock contacts data
      const mockContacts = Array.from({ length: 250 }, (_, i) => ({
        id: `contact-${i}`,
        phoneE164: `+123456789${i.toString().padStart(2, '0')}`,
        firstName: `Contact${i}`,
        lastName: `Last${i}`,
        email: `contact${i}@example.com`,
      }));

      mockPrisma.contact.findMany.mockResolvedValue(mockContacts);
      mockPrisma.contact.count.mockResolvedValue(250);

      // Mock template data
      mockPrisma.template.findFirst.mockResolvedValue({
        id: 'template-123',
        trigger: 'welcome',
        body: 'Hello {{ customer.first_name }}! Welcome to {{ shop.name }}.',
        isActive: true,
      });

      // Mock discount data
      mockPrisma.discount.findFirst.mockResolvedValue({
        id: 'discount-123',
        code: 'WELCOME10',
        type: 'percentage',
        value: 10,
        applyUrl: 'https://test-shop.myshopify.com/discount/WELCOME10',
      });

      // Import and test the function
      const { snapshotCampaignAudience } = await import('../../src/services/campaigns-service.js');

      const result = await snapshotCampaignAudience({
        shopId,
        campaignId,
      });

      // Verify campaign was found
      expect(mockPrisma.campaign.findFirst).toHaveBeenCalledWith({
        where: { id: campaignId, shopId },
        include: { segment: true },
      });

      // Verify contacts were queried
      expect(mockPrisma.contact.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          shopId,
          smsConsentState: 'opted_in',
        }),
        select: expect.objectContaining({
          id: true,
          phoneE164: true,
          firstName: true,
          lastName: true,
          email: true,
        }),
      });

      // Verify jobs were enqueued (250 contacts / 100 batch size = 3 batches)
      expect(mockEnqueueJob).toHaveBeenCalledTimes(3);

      // Verify first batch job
      expect(mockEnqueueJob).toHaveBeenNthCalledWith(1, 'campaignsQueue', 'batch', {
        campaignId,
        shopId,
        batchIndex: 0,
        batchSize: 100,
        contactIds: expect.arrayContaining([
          'contact-0',
          'contact-1',
          'contact-2', // First 100 contacts
        ]),
      });

      // Verify second batch job
      expect(mockEnqueueJob).toHaveBeenNthCalledWith(2, 'campaignsQueue', 'batch', {
        campaignId,
        shopId,
        batchIndex: 1,
        batchSize: 100,
        contactIds: expect.arrayContaining([
          'contact-100',
          'contact-101',
          'contact-102', // Next 100 contacts
        ]),
      });

      // Verify third batch job (remaining 50 contacts)
      expect(mockEnqueueJob).toHaveBeenNthCalledWith(3, 'campaignsQueue', 'batch', {
        campaignId,
        shopId,
        batchIndex: 2,
        batchSize: 50,
        contactIds: expect.arrayContaining([
          'contact-200',
          'contact-201',
          'contact-202', // Remaining contacts
        ]),
      });

      expect(result).toEqual({
        success: true,
        totalContacts: 250,
        batches: 3,
        message: 'Campaign audience snapshot completed',
      });
    });

    it('should handle empty audience gracefully', async () => {
      const campaignId = 'campaign-123';
      const shopId = 'shop-123';

      mockPrisma.campaign.findFirst.mockResolvedValue({
        id: campaignId,
        shopId,
        name: 'Test Campaign',
        status: 'scheduled',
        batchSize: 100,
        segmentId: 'segment-123',
      });

      mockPrisma.segment.findFirst.mockResolvedValue({
        id: 'segment-123',
        name: 'Test Segment',
        filterJson: {
          operator: 'and',
          conditions: [
            {
              field: 'smsConsentState',
              operator: 'equals',
              value: 'opted_in',
            },
          ],
        },
      });

      // Mock empty contacts
      mockPrisma.contact.findMany.mockResolvedValue([]);
      mockPrisma.contact.count.mockResolvedValue(0);

      const { snapshotCampaignAudience } = await import('../../src/services/campaigns-service.js');

      const result = await snapshotCampaignAudience({
        shopId,
        campaignId,
      });

      // Should not enqueue any jobs
      expect(mockEnqueueJob).not.toHaveBeenCalled();

      expect(result).toEqual({
        success: true,
        totalContacts: 0,
        batches: 0,
        message: 'Campaign audience snapshot completed',
      });
    });

    it('should handle campaign not found', async () => {
      const campaignId = 'nonexistent-campaign';
      const shopId = 'shop-123';

      mockPrisma.campaign.findFirst.mockResolvedValue(null);

      const { snapshotCampaignAudience } = await import('../../src/services/campaigns-service.js');

      const result = await snapshotCampaignAudience({
        shopId,
        campaignId,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('campaign_not_found');
    });

    it('should handle segment not found', async () => {
      const campaignId = 'campaign-123';
      const shopId = 'shop-123';

      mockPrisma.campaign.findFirst.mockResolvedValue({
        id: campaignId,
        shopId,
        name: 'Test Campaign',
        status: 'scheduled',
        batchSize: 100,
        segmentId: 'segment-123',
      });

      mockPrisma.segment.findFirst.mockResolvedValue(null);

      const { snapshotCampaignAudience } = await import('../../src/services/campaigns-service.js');

      const result = await snapshotCampaignAudience({
        shopId,
        campaignId,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('segment_not_found');
    });
  });

  describe('Campaign Batch Processing', () => {
    it('should process campaign batch and enqueue delivery jobs', async () => {
      const campaignId = 'campaign-123';
      const shopId = 'shop-123';
      const batchIndex = 0;
      const batchSize = 100;
      const contactIds = Array.from({ length: 100 }, (_, i) => `contact-${i}`);

      // Mock campaign data
      mockPrisma.campaign.findFirst.mockResolvedValue({
        id: campaignId,
        shopId,
        name: 'Test Campaign',
        status: 'sending',
        templateId: 'template-123',
        discountId: 'discount-123',
        utmJson: {
          utm_source: 'sms',
          utm_medium: 'sms',
          utm_campaign: 'test_campaign',
        },
      });

      // Mock template data
      mockPrisma.template.findFirst.mockResolvedValue({
        id: 'template-123',
        trigger: 'welcome',
        body: 'Hello {{ customer.first_name }}! Welcome to {{ shop.name }}.',
        isActive: true,
      });

      // Mock discount data
      mockPrisma.discount.findFirst.mockResolvedValue({
        id: 'discount-123',
        code: 'WELCOME10',
        type: 'percentage',
        value: 10,
        applyUrl: 'https://test-shop.myshopify.com/discount/WELCOME10',
      });

      // Mock contacts data
      const mockContacts = contactIds.map((id, i) => ({
        id,
        phoneE164: `+123456789${i.toString().padStart(2, '0')}`,
        firstName: `Contact${i}`,
        lastName: `Last${i}`,
        email: `contact${i}@example.com`,
      }));

      mockPrisma.contact.findMany.mockResolvedValue(mockContacts);

      // Import and test the function
      const { batchCampaignAudience } = await import('../../src/queue/processors/campaigns.js');

      const result = await batchCampaignAudience({
        campaignId,
        shopId,
        batchIndex,
        batchSize,
        contactIds,
      });

      // Verify campaign was found
      expect(mockPrisma.campaign.findFirst).toHaveBeenCalledWith({
        where: { id: campaignId, shopId },
        include: { template: true, discount: true },
      });

      // Verify contacts were queried
      expect(mockPrisma.contact.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: contactIds },
          shopId,
        },
        select: expect.objectContaining({
          id: true,
          phoneE164: true,
          firstName: true,
          lastName: true,
          email: true,
        }),
      });

      // Verify delivery jobs were enqueued (one per contact)
      expect(mockEnqueueJob).toHaveBeenCalledTimes(100);

      // Verify first delivery job
      expect(mockEnqueueJob).toHaveBeenNthCalledWith(1, 'deliveryQueue', 'send', {
        campaignId,
        shopId,
        contactId: 'contact-0',
        phoneE164: '+12345678900',
        templateId: 'template-123',
        discountId: 'discount-123',
        utmParams: {
          utm_source: 'sms',
          utm_medium: 'sms',
          utm_campaign: 'test_campaign',
        },
      });

      expect(result).toEqual({
        success: true,
        processedContacts: 100,
        message: 'Campaign batch processed successfully',
      });
    });

    it('should handle batch processing errors gracefully', async () => {
      const campaignId = 'campaign-123';
      const shopId = 'shop-123';
      const batchIndex = 0;
      const batchSize = 100;
      const contactIds = ['contact-0', 'contact-1'];

      mockPrisma.campaign.findFirst.mockRejectedValue(new Error('Database connection failed'));

      const { batchCampaignAudience } = await import('../../src/queue/processors/campaigns.js');

      const result = await batchCampaignAudience({
        campaignId,
        shopId,
        batchIndex,
        batchSize,
        contactIds,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('database_error');
    });
  });

  describe('Campaign Status Updates', () => {
    it('should update campaign status to sending', async () => {
      const campaignId = 'campaign-123';
      const shopId = 'shop-123';

      mockPrisma.campaign.findFirst.mockResolvedValue({
        id: campaignId,
        shopId,
        name: 'Test Campaign',
        status: 'scheduled',
      });

      mockPrisma.campaign.update.mockResolvedValue({
        id: campaignId,
        shopId,
        status: 'sending',
        updatedAt: new Date(),
      });

      const { sendCampaign } = await import('../../src/services/campaigns-service.js');

      const result = await sendCampaign({
        shopId,
        campaignId,
      });

      // Verify campaign status was updated
      expect(mockPrisma.campaign.update).toHaveBeenCalledWith({
        where: { id: campaignId, shopId },
        data: { status: 'sending' },
      });

      expect(result.success).toBe(true);
    });

    it('should update campaign status to completed', async () => {
      const campaignId = 'campaign-123';
      const shopId = 'shop-123';

      mockPrisma.campaign.findFirst.mockResolvedValue({
        id: campaignId,
        shopId,
        name: 'Test Campaign',
        status: 'sending',
      });

      mockPrisma.campaign.update.mockResolvedValue({
        id: campaignId,
        shopId,
        status: 'completed',
        updatedAt: new Date(),
      });

      const { completeCampaign } = await import('../../src/services/campaigns-service.js');

      const result = await completeCampaign({
        shopId,
        campaignId,
      });

      // Verify campaign status was updated
      expect(mockPrisma.campaign.update).toHaveBeenCalledWith({
        where: { id: campaignId, shopId },
        data: { status: 'completed' },
      });

      expect(result.success).toBe(true);
    });
  });
});


