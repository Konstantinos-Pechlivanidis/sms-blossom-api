// src/queue/processors/campaigns.js
// Campaign batching processor

import { logger } from '../../lib/logger.js';
import { enqueueJob } from '../queues.js';
import { getPrismaClient } from '../../db/prismaClient.js';

const prisma = getPrismaClient();

/**
 * Process campaign batching
 * @param {Object} job - BullMQ job
 * @returns {Promise<void>}
 */
export async function processCampaignBatch(job) {
  const { data } = job;
  const { campaignId, shopId, batchSize = 100, requestId } = data;

  logger.info(
    {
      jobId: job.id,
      campaignId,
      shopId,
      batchSize,
      requestId,
    },
    'Processing campaign batch',
  );

  try {
    // Get campaign details
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        segment: true,
        template: true,
      },
    });

    if (!campaign) {
      logger.warn({ campaignId, shopId }, 'Campaign not found, skipping batch');
      return;
    }

    if (!campaign.isActive) {
      logger.warn({ campaignId, shopId }, 'Campaign is not active, skipping batch');
      return;
    }

    // Get audience from segment
    const audience = await getCampaignAudience(campaign.segment, shopId, batchSize);

    if (audience.length === 0) {
      logger.info({ campaignId, shopId }, 'No audience found for campaign batch');
      return;
    }

    // Enqueue delivery jobs for each recipient
    for (const contact of audience) {
      await enqueueJob('delivery', 'send', {
        campaignId,
        shopId,
        contactId: contact.id,
        template: campaign.template,
        recipient: contact.phoneE164,
        context: {
          customer_name: contact.firstName || 'Customer',
          customer_email: contact.email,
          shop_name: campaign.shop?.name || shopId,
        },
        requestId,
      });
    }

    logger.info(
      {
        campaignId,
        shopId,
        audienceCount: audience.length,
        requestId,
      },
      'Campaign batch processed',
    );
  } catch (error) {
    logger.error(
      {
        error: error.message,
        jobId: job.id,
        campaignId,
        shopId,
        requestId,
      },
      'Failed to process campaign batch',
    );
    throw error;
  }
}

/**
 * Get campaign audience from segment
 * @param {Object} segment - Segment configuration
 * @param {string} shopId - Shop ID
 * @param {number} limit - Batch size limit
 * @returns {Promise<Array>} Audience contacts
 */
async function getCampaignAudience(segment, shopId, limit) {
  try {
    // Build audience query based on segment criteria
    const whereClause = {
      shopId,
      optedOut: false, // Only opted-in contacts
    };

    // Add segment filters
    if (segment.criteria) {
      const criteria = JSON.parse(segment.criteria);

      if (criteria.hasPhone) {
        whereClause.phoneE164 = { not: null };
      }

      if (criteria.hasEmail) {
        whereClause.email = { not: null };
      }

      if (criteria.tags && criteria.tags.length > 0) {
        whereClause.tags = { hasSome: criteria.tags };
      }

      if (criteria.lastOrderDate) {
        whereClause.lastOrderAt = {
          gte: new Date(criteria.lastOrderDate),
        };
      }
    }

    // Get audience with pagination
    const audience = await prisma.contact.findMany({
      where: whereClause,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    return audience;
  } catch (error) {
    logger.error(
      { error: error.message, segmentId: segment.id, shopId },
      'Failed to get campaign audience',
    );
    return [];
  }
}
