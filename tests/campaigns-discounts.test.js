// tests/campaigns-discounts.test.js
// Integration tests for Campaigns and Discounts services

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getPrismaClient } from '../src/db/prismaClient.js';
import {
  createDiscount,
  buildDiscountApplyUrl,
  checkDiscountConflicts,
} from '../src/services/discounts-service.js';
import {
  createCampaign,
  getCampaign,
  listCampaigns,
  snapshotCampaignAudience,
  estimateCampaign,
  testSendCampaign,
  sendCampaign,
  attachDiscountToCampaign,
  detachDiscountFromCampaign,
  setCampaignUtm,
  getCampaignApplyUrl,
} from '../src/services/campaigns-service.js';

const prisma = getPrismaClient();

describe('Campaigns & Discounts Services', () => {
  let testShop;
  let testSegment;
  let testContact;

  beforeEach(async () => {
    // Create test shop
    testShop = await prisma.shop.create({
      data: {
        domain: 'test-shop.myshopify.com',
        name: 'Test Shop',
      },
    });

    // Create test segment
    testSegment = await prisma.segment.create({
      data: {
        shopId: testShop.id,
        name: 'Test Segment',
        filterJson: {
          consent: 'opted_in',
          tags: { has: 'vip' },
        },
      },
    });

    // Create test contact
    testContact = await prisma.contact.create({
      data: {
        shopId: testShop.id,
        phoneE164: '+1234567890',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        optedOut: false,
        smsConsentState: 'opted_in',
        tagsJson: ['vip'],
      },
    });
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.campaignRecipient.deleteMany({
      where: { shopId: testShop.id },
    });
    await prisma.campaign.deleteMany({
      where: { shopId: testShop.id },
    });
    await prisma.discount.deleteMany({
      where: { shopId: testShop.id },
    });
    await prisma.contact.deleteMany({
      where: { shopId: testShop.id },
    });
    await prisma.segment.deleteMany({
      where: { shopId: testShop.id },
    });
    await prisma.shop.deleteMany({
      where: { id: testShop.id },
    });
  });

  describe('Discounts Service', () => {
    it('should create a discount successfully', async () => {
      const result = await createDiscount({
        shopId: testShop.id,
        code: 'TEST10',
        title: 'Test Discount',
        kind: 'percentage',
        value: 10,
        currencyCode: 'USD',
        redirect: '/checkout',
      });

      expect(result.ok).toBe(true);
      expect(result.code).toBe('TEST10');
      expect(result.title).toBe('Test Discount');
      expect(result.applyUrl).toContain('discount/TEST10');
      expect(result.applyUrl).toContain('utm_source=sms');
    });

    it('should build apply URL for discount', async () => {
      const result = await buildDiscountApplyUrl({
        shopId: testShop.id,
        code: 'TEST10',
        redirect: '/checkout',
        utm: {
          utm_campaign: 'test_campaign',
        },
      });

      expect(result.ok).toBe(true);
      expect(result.url).toContain('discount/TEST10');
      expect(result.url).toContain('utm_source=sms');
      expect(result.url).toContain('utm_campaign=test_campaign');
    });

    it('should check discount conflicts', async () => {
      const result = await checkDiscountConflicts({
        shopId: testShop.id,
      });

      expect(result.ok).toBe(true);
      expect(result.automaticDiscounts).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should prevent duplicate discount codes', async () => {
      // Create first discount
      await createDiscount({
        shopId: testShop.id,
        code: 'DUPLICATE',
        kind: 'percentage',
        value: 10,
      });

      // Try to create duplicate
      await expect(
        createDiscount({
          shopId: testShop.id,
          code: 'DUPLICATE',
          kind: 'percentage',
          value: 15,
        }),
      ).rejects.toThrow("Discount code 'DUPLICATE' already exists");
    });
  });

  describe('Campaigns Service', () => {
    it('should create a campaign successfully', async () => {
      const result = await createCampaign({
        shopId: testShop.id,
        name: 'Test Campaign',
        segmentId: testSegment.id,
        bodyText: 'Test message',
        batchSize: 50,
      });

      expect(result.ok).toBe(true);
      expect(result.campaign.name).toBe('Test Campaign');
      expect(result.campaign.status).toBe('draft');
      expect(result.campaign.segmentId).toBe(testSegment.id);
    });

    it('should get campaign by ID', async () => {
      const campaign = await prisma.campaign.create({
        data: {
          shopId: testShop.id,
          name: 'Test Campaign',
          segmentId: testSegment.id,
          bodyText: 'Test message',
        },
      });

      const result = await getCampaign({
        shopId: testShop.id,
        campaignId: campaign.id,
      });

      expect(result.ok).toBe(true);
      expect(result.campaign.id).toBe(campaign.id);
      expect(result.campaign.name).toBe('Test Campaign');
    });

    it('should list campaigns with pagination', async () => {
      // Create multiple campaigns
      await prisma.campaign.createMany({
        data: [
          {
            shopId: testShop.id,
            name: 'Campaign 1',
            status: 'draft',
          },
          {
            shopId: testShop.id,
            name: 'Campaign 2',
            status: 'scheduled',
          },
        ],
      });

      const result = await listCampaigns({
        shopId: testShop.id,
        limit: 10,
        offset: 0,
      });

      expect(result.ok).toBe(true);
      expect(result.campaigns).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });

    it('should snapshot campaign audience', async () => {
      const campaign = await prisma.campaign.create({
        data: {
          shopId: testShop.id,
          name: 'Test Campaign',
          segmentId: testSegment.id,
          bodyText: 'Test message',
        },
      });

      const result = await snapshotCampaignAudience({
        shopId: testShop.id,
        campaignId: campaign.id,
      });

      expect(result.ok).toBe(true);
      expect(result.recipientCount).toBe(1); // testContact matches segment
    });

    it('should estimate campaign cost', async () => {
      const campaign = await prisma.campaign.create({
        data: {
          shopId: testShop.id,
          name: 'Test Campaign',
          segmentId: testSegment.id,
          bodyText: 'Test message for cost estimation',
        },
      });

      // Create campaign recipients
      await prisma.campaignRecipient.create({
        data: {
          shopId: testShop.id,
          campaignId: campaign.id,
          contactId: testContact.id,
          status: 'pending',
        },
      });

      const result = await estimateCampaign({
        shopId: testShop.id,
        campaignId: campaign.id,
      });

      expect(result.ok).toBe(true);
      expect(result.estimate.recipientCount).toBe(1);
      expect(result.estimate.totalSegments).toBeGreaterThan(0);
      expect(result.estimate.estimatedCost).toBeGreaterThan(0);
    });

    it('should test send campaign to phone number', async () => {
      const campaign = await prisma.campaign.create({
        data: {
          shopId: testShop.id,
          name: 'Test Campaign',
          segmentId: testSegment.id,
          bodyText: 'Test message',
        },
      });

      const result = await testSendCampaign({
        shopId: testShop.id,
        campaignId: campaign.id,
        phoneE164: '+1234567890',
      });

      expect(result.ok).toBe(true);
      expect(result.message).toBe('Test send job enqueued');
      expect(result.contactId).toBe(testContact.id);
    });

    it('should send campaign to audience', async () => {
      const campaign = await prisma.campaign.create({
        data: {
          shopId: testShop.id,
          name: 'Test Campaign',
          segmentId: testSegment.id,
          bodyText: 'Test message',
        },
      });

      const result = await sendCampaign({
        shopId: testShop.id,
        campaignId: campaign.id,
      });

      expect(result.ok).toBe(true);
      expect(result.message).toBe('Campaign send job enqueued');
    });

    it('should attach discount to campaign', async () => {
      const campaign = await prisma.campaign.create({
        data: {
          shopId: testShop.id,
          name: 'Test Campaign',
          bodyText: 'Test message',
        },
      });

      const discount = await prisma.discount.create({
        data: {
          shopId: testShop.id,
          code: 'TEST10',
          type: 'percentage',
          value: 10,
        },
      });

      const result = await attachDiscountToCampaign({
        shopId: testShop.id,
        campaignId: campaign.id,
        discountId: discount.id,
      });

      expect(result.ok).toBe(true);
      expect(result.message).toBe('Discount attached to campaign');
    });

    it('should detach discount from campaign', async () => {
      const discount = await prisma.discount.create({
        data: {
          shopId: testShop.id,
          code: 'TEST10',
          type: 'percentage',
          value: 10,
        },
      });

      const campaign = await prisma.campaign.create({
        data: {
          shopId: testShop.id,
          name: 'Test Campaign',
          bodyText: 'Test message',
          discountId: discount.id,
        },
      });

      const result = await detachDiscountFromCampaign({
        shopId: testShop.id,
        campaignId: campaign.id,
      });

      expect(result.ok).toBe(true);
      expect(result.message).toBe('Discount detached from campaign');
    });

    it('should set UTM parameters for campaign', async () => {
      const campaign = await prisma.campaign.create({
        data: {
          shopId: testShop.id,
          name: 'Test Campaign',
          bodyText: 'Test message',
        },
      });

      const utmJson = {
        utm_campaign: 'test_campaign',
        utm_content: 'sms',
      };

      const result = await setCampaignUtm({
        shopId: testShop.id,
        campaignId: campaign.id,
        utmJson,
      });

      expect(result.ok).toBe(true);
      expect(result.message).toBe('UTM parameters set');
    });

    it('should get campaign apply URL', async () => {
      const discount = await prisma.discount.create({
        data: {
          shopId: testShop.id,
          code: 'TEST10',
          type: 'percentage',
          value: 10,
        },
      });

      const campaign = await prisma.campaign.create({
        data: {
          shopId: testShop.id,
          name: 'Test Campaign',
          bodyText: 'Test message',
          discountId: discount.id,
        },
      });

      const result = await getCampaignApplyUrl({
        shopId: testShop.id,
        campaignId: campaign.id,
      });

      expect(result.ok).toBe(true);
      expect(result.url).toContain('discount/TEST10');
      expect(result.url).toContain('utm_source=sms');
      expect(result.url).toContain('utm_campaign=' + campaign.id);
      expect(result.discountCode).toBe('TEST10');
    });

    it('should handle campaign without discount for apply URL', async () => {
      const campaign = await prisma.campaign.create({
        data: {
          shopId: testShop.id,
          name: 'Test Campaign',
          bodyText: 'Test message',
        },
      });

      await expect(
        getCampaignApplyUrl({
          shopId: testShop.id,
          campaignId: campaign.id,
        }),
      ).rejects.toThrow('Campaign has no discount attached');
    });

    it('should validate segment exists when creating campaign', async () => {
      await expect(
        createCampaign({
          shopId: testShop.id,
          name: 'Test Campaign',
          segmentId: 'nonexistent_segment',
          bodyText: 'Test message',
        }),
      ).rejects.toThrow('Segment not found');
    });

    it('should validate discount exists when creating campaign', async () => {
      await expect(
        createCampaign({
          shopId: testShop.id,
          name: 'Test Campaign',
          bodyText: 'Test message',
          discountId: 'nonexistent_discount',
        }),
      ).rejects.toThrow('Discount not found');
    });
  });

  describe('Queue Integration', () => {
    it('should enqueue test send job', async () => {
      const campaign = await prisma.campaign.create({
        data: {
          shopId: testShop.id,
          name: 'Test Campaign',
          segmentId: testSegment.id,
          bodyText: 'Test message',
        },
      });

      // Mock enqueueJob to verify it's called
      const mockEnqueueJob = vi.fn().mockResolvedValue({ id: 'job_123' });
      vi.doMock('../src/queue/queues.js', () => ({
        enqueueJob: mockEnqueueJob,
      }));

      await testSendCampaign({
        shopId: testShop.id,
        campaignId: campaign.id,
        phoneE164: '+1234567890',
      });

      // Note: In a real test, you'd verify the queue job was enqueued
      // This is a placeholder for queue integration testing
    });
  });
});
