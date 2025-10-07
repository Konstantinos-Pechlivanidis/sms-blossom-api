// src/services/campaigns-service.js
// Campaigns service for SMS campaign management

import { logger } from '../lib/logger.js';
import { getPrismaClient } from '../db/prismaClient.js';
import { enqueueJob } from '../queue/queues.js';
import { computeSmsSegments } from '../lib/sms-segments.js';
import { buildApplyUrl } from './discounts.js';

const prisma = getPrismaClient();

/**
 * Create a new campaign
 * @param {Object} params - Campaign creation parameters
 * @param {string} params.shopId - Shop ID
 * @param {string} params.name - Campaign name
 * @param {string} params.segmentId - Target segment ID
 * @param {string} params.templateId - Template ID
 * @param {string} params.templateKey - Template key
 * @param {string} params.bodyText - SMS body text
 * @param {string} params.discountId - Optional discount ID
 * @param {Date} params.scheduleAt - Schedule date
 * @param {number} params.batchSize - Batch size for processing
 * @param {Object} params.utmJson - UTM parameters
 * @returns {Promise<Object>} Created campaign response
 */
export async function createCampaign(params) {
  const {
    shopId,
    name,
    segmentId,
    templateId,
    templateKey,
    bodyText,
    discountId,
    scheduleAt,
    batchSize = 100,
    utmJson = {},
  } = params;

  logger.info({ shopId, name, segmentId }, 'Creating campaign');

  try {
    // Validate segment exists
    if (segmentId) {
      const segment = await prisma.segment.findFirst({
        where: { id: segmentId, shopId },
      });
      if (!segment) {
        throw new Error('Segment not found');
      }
    }

    // Validate discount exists if provided
    if (discountId) {
      const discount = await prisma.discount.findFirst({
        where: { id: discountId, shopId },
      });
      if (!discount) {
        throw new Error('Discount not found');
      }
    }

    const campaign = await prisma.campaign.create({
      data: {
        shopId,
        name,
        segmentId,
        templateId,
        templateKey,
        bodyText,
        discountId,
        scheduleAt,
        batchSize,
        utmJson,
        status: 'draft',
      },
    });

    logger.info({ campaignId: campaign.id, name }, 'Campaign created successfully');

    return {
      ok: true,
      campaign,
    };
  } catch (error) {
    logger.error({ error: error.message, shopId, name }, 'Failed to create campaign');
    throw error;
  }
}

/**
 * Update an existing campaign
 * @param {Object} params - Campaign update parameters
 * @param {string} params.shopId - Shop ID
 * @param {string} params.campaignId - Campaign ID
 * @param {Object} params.updates - Fields to update
 * @returns {Promise<Object>} Updated campaign response
 */
export async function updateCampaign(params) {
  const { shopId, campaignId, updates } = params;

  logger.info({ shopId, campaignId }, 'Updating campaign');

  try {
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        shopId,
      },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Prevent updates to campaigns that are already sending
    if (['sending', 'completed'].includes(campaign.status)) {
      throw new Error('Cannot update campaign that is already sending or completed');
    }

    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        ...updates,
        updatedAt: new Date(),
      },
    });

    logger.info({ campaignId, name: updatedCampaign.name }, 'Campaign updated successfully');

    return {
      ok: true,
      campaign: updatedCampaign,
    };
  } catch (error) {
    logger.error({ error: error.message, shopId, campaignId }, 'Failed to update campaign');
    throw error;
  }
}

/**
 * Get campaign by ID
 * @param {Object} params - Parameters
 * @param {string} params.shopId - Shop ID
 * @param {string} params.campaignId - Campaign ID
 * @returns {Promise<Object>} Campaign details
 */
export async function getCampaign(params) {
  const { shopId, campaignId } = params;

  try {
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        shopId,
      },
      include: {
        shop: true,
      },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    return {
      ok: true,
      campaign,
    };
  } catch (error) {
    logger.error({ error: error.message, shopId, campaignId }, 'Failed to get campaign');
    throw error;
  }
}

/**
 * List campaigns for a shop
 * @param {Object} params - Parameters
 * @param {string} params.shopId - Shop ID
 * @param {number} params.limit - Limit results
 * @param {number} params.offset - Offset for pagination
 * @param {string} params.status - Filter by status
 * @returns {Promise<Object>} Campaigns list
 */
export async function listCampaigns(params) {
  const { shopId, limit = 50, offset = 0, status } = params;

  try {
    const whereClause = { shopId };
    if (status) {
      whereClause.status = status;
    }

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where: whereClause,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        include: {
          shop: true,
        },
      }),
      prisma.campaign.count({
        where: whereClause,
      }),
    ]);

    return {
      ok: true,
      campaigns,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    };
  } catch (error) {
    logger.error({ error: error.message, shopId }, 'Failed to list campaigns');
    throw error;
  }
}

/**
 * Snapshot audience from segment into campaign recipients
 * @param {Object} params - Parameters
 * @param {string} params.shopId - Shop ID
 * @param {string} params.campaignId - Campaign ID
 * @returns {Promise<Object>} Snapshot response
 */
export async function snapshotCampaignAudience(params) {
  const { shopId, campaignId } = params;

  logger.info({ shopId, campaignId }, 'Snapshotting campaign audience');

  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, shopId },
      include: { shop: true },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (!campaign.segmentId) {
      throw new Error('Campaign has no segment assigned');
    }

    // Get contacts from segment
    const contacts = await getSegmentContacts(campaign.segment, shopId);

    // Create campaign recipients
    const recipients = await Promise.all(
      contacts.map((contact) =>
        prisma.campaignRecipient.upsert({
          where: {
            campaignId_contactId: {
              campaignId,
              contactId: contact.id,
            },
          },
          update: {
            status: 'pending',
            reason: null,
          },
          create: {
            shopId,
            campaignId,
            contactId: contact.id,
            status: 'pending',
          },
        }),
      ),
    );

    // Update campaign status
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'scheduled' },
    });

    logger.info({ campaignId, recipientCount: recipients.length }, 'Campaign audience snapshotted');

    return {
      ok: true,
      recipientCount: recipients.length,
      campaignId,
    };
  } catch (error) {
    logger.error(
      { error: error.message, shopId, campaignId },
      'Failed to snapshot campaign audience',
    );
    throw error;
  }
}

/**
 * Estimate campaign cost and recipient count
 * @param {Object} params - Parameters
 * @param {string} params.shopId - Shop ID
 * @param {string} params.campaignId - Campaign ID
 * @returns {Promise<Object>} Estimate response
 */
export async function estimateCampaign(params) {
  const { shopId, campaignId } = params;

  logger.info({ shopId, campaignId }, 'Estimating campaign');

  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, shopId },
      include: { shop: true },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Get recipient count
    const recipientCount = await prisma.campaignRecipient.count({
      where: {
        campaignId,
        status: 'pending',
      },
    });

    // Calculate SMS segments and cost
    let totalSegments = 0;
    let totalCost = 0;

    if (campaign.bodyText) {
      const segments = computeSmsSegments(campaign.bodyText);
      totalSegments = segments.parts;
      totalCost = segments.parts * 0.05; // $0.05 per segment (placeholder)
    }

    const estimate = {
      recipientCount,
      totalSegments,
      estimatedCost: totalCost,
      currency: 'USD',
      breakdown: {
        recipients: recipientCount,
        segmentsPerMessage: totalSegments,
        costPerSegment: 0.05,
        totalCost,
      },
    };

    logger.info({ campaignId, ...estimate }, 'Campaign estimate calculated');

    return {
      ok: true,
      estimate,
    };
  } catch (error) {
    logger.error({ error: error.message, shopId, campaignId }, 'Failed to estimate campaign');
    throw error;
  }
}

/**
 * Test send campaign to a specific phone number
 * @param {Object} params - Parameters
 * @param {string} params.shopId - Shop ID
 * @param {string} params.campaignId - Campaign ID
 * @param {string} params.phoneE164 - Test phone number
 * @returns {Promise<Object>} Test send response
 */
export async function testSendCampaign(params) {
  const { shopId, campaignId, phoneE164 } = params;

  logger.info({ shopId, campaignId, phoneE164 }, 'Test sending campaign');

  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, shopId },
      include: { shop: true },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Find or create test contact
    const contact = await prisma.contact.upsert({
      where: {
        shopId_phoneE164: {
          shopId,
          phoneE164,
        },
      },
      update: {},
      create: {
        shopId,
        phoneE164,
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        optedOut: false,
      },
    });

    // Enqueue test delivery job
    await enqueueJob('delivery', 'send', {
      shopId,
      campaignId,
      contactId: contact.id,
      recipient: phoneE164,
      template: campaign.bodyText,
      context: {
        customer_name: 'Test User',
        customer_phone: phoneE164,
        shop_name: shopId,
      },
      isTest: true,
      requestId: `test_${campaignId}_${Date.now()}`,
    });

    logger.info({ campaignId, contactId: contact.id, phoneE164 }, 'Test send job enqueued');

    return {
      ok: true,
      message: 'Test send job enqueued',
      contactId: contact.id,
    };
  } catch (error) {
    logger.error(
      { error: error.message, shopId, campaignId, phoneE164 },
      'Failed to test send campaign',
    );
    throw error;
  }
}

/**
 * Send campaign to snapshotted audience
 * @param {Object} params - Parameters
 * @param {string} params.shopId - Shop ID
 * @param {string} params.campaignId - Campaign ID
 * @returns {Promise<Object>} Send response
 */
export async function sendCampaign(params) {
  const { shopId, campaignId } = params;

  logger.info({ shopId, campaignId }, 'Sending campaign');

  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, shopId },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    // Update campaign status
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'sending' },
    });

    // Enqueue campaign batch job
    await enqueueJob('campaigns', 'batch', {
      campaignId,
      shopId,
      batchSize: campaign.batchSize || 100,
      requestId: `campaign_${campaignId}_${Date.now()}`,
    });

    logger.info({ campaignId }, 'Campaign send job enqueued');

    return {
      ok: true,
      message: 'Campaign send job enqueued',
      campaignId,
    };
  } catch (error) {
    logger.error({ error: error.message, shopId, campaignId }, 'Failed to send campaign');
    throw error;
  }
}

/**
 * Attach discount to campaign
 * @param {Object} params - Parameters
 * @param {string} params.shopId - Shop ID
 * @param {string} params.campaignId - Campaign ID
 * @param {string} params.discountId - Discount ID
 * @returns {Promise<Object>} Attach response
 */
export async function attachDiscountToCampaign(params) {
  const { shopId, campaignId, discountId } = params;

  logger.info({ shopId, campaignId, discountId }, 'Attaching discount to campaign');

  try {
    // Validate discount exists
    const discount = await prisma.discount.findFirst({
      where: { id: discountId, shopId },
    });

    if (!discount) {
      throw new Error('Discount not found');
    }

    // Update campaign with discount
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { discountId },
    });

    logger.info({ campaignId, discountId }, 'Discount attached to campaign');

    return {
      ok: true,
      message: 'Discount attached to campaign',
    };
  } catch (error) {
    logger.error(
      { error: error.message, shopId, campaignId, discountId },
      'Failed to attach discount to campaign',
    );
    throw error;
  }
}

/**
 * Detach discount from campaign
 * @param {Object} params - Parameters
 * @param {string} params.shopId - Shop ID
 * @param {string} params.campaignId - Campaign ID
 * @returns {Promise<Object>} Detach response
 */
export async function detachDiscountFromCampaign(params) {
  const { shopId, campaignId } = params;

  logger.info({ shopId, campaignId }, 'Detaching discount from campaign');

  try {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { discountId: null },
    });

    logger.info({ campaignId }, 'Discount detached from campaign');

    return {
      ok: true,
      message: 'Discount detached from campaign',
    };
  } catch (error) {
    logger.error(
      { error: error.message, shopId, campaignId },
      'Failed to detach discount from campaign',
    );
    throw error;
  }
}

/**
 * Set UTM parameters for campaign
 * @param {Object} params - Parameters
 * @param {string} params.shopId - Shop ID
 * @param {string} params.campaignId - Campaign ID
 * @param {Object} params.utmJson - UTM parameters
 * @returns {Promise<Object>} UTM response
 */
export async function setCampaignUtm(params) {
  const { shopId, campaignId, utmJson } = params;

  logger.info({ shopId, campaignId, utmJson }, 'Setting campaign UTM parameters');

  try {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { utmJson },
    });

    logger.info({ campaignId, utmJson }, 'Campaign UTM parameters set');

    return {
      ok: true,
      message: 'UTM parameters set',
    };
  } catch (error) {
    logger.error(
      { error: error.message, shopId, campaignId },
      'Failed to set campaign UTM parameters',
    );
    throw error;
  }
}

/**
 * Get campaign apply URL preview
 * @param {Object} params - Parameters
 * @param {string} params.shopId - Shop ID
 * @param {string} params.campaignId - Campaign ID
 * @returns {Promise<Object>} Apply URL response
 */
export async function getCampaignApplyUrl(params) {
  const { shopId, campaignId } = params;

  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, shopId },
      include: { shop: true },
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (!campaign.discountId || !campaign.discount) {
      throw new Error('Campaign has no discount attached');
    }

    const applyUrl = buildApplyUrl({
      shopDomain: shopId,
      code: campaign.discount.code,
      redirect: '/checkout',
      utm: {
        utm_source: 'sms',
        utm_medium: 'sms',
        utm_campaign: campaignId,
        ...campaign.utmJson,
      },
    });

    return {
      ok: true,
      url: applyUrl,
      campaignId,
      discountCode: campaign.discount.code,
    };
  } catch (error) {
    logger.error({ error: error.message, shopId, campaignId }, 'Failed to get campaign apply URL');
    throw error;
  }
}

/**
 * Get contacts from segment
 * @param {Object} segment - Segment configuration
 * @param {string} shopId - Shop ID
 * @returns {Promise<Array>} Contacts array
 */
async function getSegmentContacts(segment, shopId) {
  try {
    // Simple segment filtering - can be extended with DSL
    const whereClause = {
      shopId,
      optedOut: false, // Only opted-in contacts
    };

    if (segment.filterJson) {
      const filter = JSON.parse(segment.filterJson);

      if (filter.consent === 'opted_in') {
        whereClause.smsConsentState = 'opted_in';
      }

      if (filter.tags && filter.tags.has) {
        whereClause.tagsJson = {
          array_contains: [filter.tags.has],
        };
      }
    }

    return await prisma.contact.findMany({
      where: whereClause,
      take: 1000, // Limit for performance
    });
  } catch (error) {
    logger.error(
      { error: error.message, segmentId: segment.id, shopId },
      'Failed to get segment contacts',
    );
    return [];
  }
}
