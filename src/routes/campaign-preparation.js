import { Router } from 'express';
import { getPrismaClient } from '../db/prismaClient.js';
import { createLinkBuilder } from '../services/link-builder.js';
import { logger } from '../lib/logger.js';

const prisma = getPrismaClient();
const router = Router();

// POST /campaigns/:id/prepare
router.post('/:id/prepare', async (req, res) => {
  try {
    const { id } = req.params;
    const { shop } = req.query;
    
    if (!shop) {
      return res.status(400).json({ error: 'missing_shop' });
    }

    // Get campaign with discount config
    const campaign = await prisma.campaign.findFirst({
      where: { id, shopId: shop },
      include: {
        recipients: {
          include: {
            contact: true
          }
        }
      }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'campaign_not_found' });
    }

    if (campaign.status !== 'draft') {
      return res.status(400).json({ error: 'campaign_not_draft' });
    }

    const discountConfig = campaign.discountConfig || {};
    const linkBuilder = createLinkBuilder(shop);

    let codesNeeded = 0;
    let poolAvailable = 0;
    let canProceed = true;
    let discountCodes = [];

    // Check if campaign needs discount codes
    if (discountConfig.mode === 'pool' && discountConfig.discountId) {
      // Get pool status
      const pool = await prisma.discountCodePool.findFirst({
        where: {
          discountId: discountConfig.discountId,
          shopId: shop
        }
      });

      if (!pool) {
        return res.status(404).json({ error: 'discount_pool_not_found' });
      }

      // Count available codes
      const availableCount = await prisma.discountCode.count({
        where: {
          poolId: pool.id,
          status: 'available'
        }
      });

      codesNeeded = campaign.recipients.length;
      poolAvailable = availableCount;
      canProceed = availableCount >= codesNeeded;

      if (!canProceed) {
        return res.status(409).json({
          error: 'insufficient_discount_codes',
          codesNeeded,
          poolAvailable,
          canProceed: false,
        });
      }

      // Reserve codes for campaign
      const reservation = await prisma.discountCodeReservation.create({
        data: {
          shopId: shop,
          poolId: pool.id,
          campaignId: id,
          quantity: codesNeeded,
          status: 'active',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        }
      });

      // Get available codes
      const availableCodes = await prisma.discountCode.findMany({
        where: {
          poolId: pool.id,
          status: 'available'
        },
        take: codesNeeded,
        orderBy: {
          createdAt: 'asc'
        }
      });

      // Reserve codes
      await prisma.discountCode.updateMany({
        where: {
          id: {
            in: availableCodes.map(c => c.id)
          }
        },
        data: {
          status: 'reserved',
          reservedAt: new Date(),
          reservationId: reservation.id,
        }
      });

      discountCodes = availableCodes.map(code => ({
        id: code.id,
        code: code.code,
        reservationId: reservation.id,
      }));

      // Update pool statistics
      await prisma.discountCodePool.update({
        where: { id: pool.id },
        data: {
          reservedCodes: {
            increment: codesNeeded
          }
        }
      });

      logger.info({
        shop,
        campaignId: id,
        poolId: pool.id,
        reservationId: reservation.id,
        reservedCount: codesNeeded,
      }, 'Reserved discount codes for campaign');
    }

    // Pre-assign discount codes to recipients
    const updatedRecipients = [];
    for (let i = 0; i < campaign.recipients.length; i++) {
      const recipient = campaign.recipients[i];
      const discountCode = discountCodes[i] || null;

      // Create shortlink if discount code exists
      let shortlink = null;
      if (discountCode && discountConfig.redirectPath) {
        const discountUrl = linkBuilder.buildDiscountUrl(
          discountCode.code,
          discountConfig.redirectPath,
          campaign.utmJson || {}
        );

        const shortlinkData = await linkBuilder.createShortlink(
          discountUrl,
          id,
          {
            recipientId: recipient.id,
            contactId: recipient.contactId,
            expiresAt: campaign.scheduleAt ? new Date(campaign.scheduleAt.getTime() + 30 * 24 * 60 * 60 * 1000) : null, // 30 days from schedule
          }
        );

        shortlink = {
          slug: shortlinkData.slug,
          shortUrl: shortlinkData.shortUrl,
          originalUrl: shortlinkData.originalUrl,
        };

        logger.info({
          shop,
          campaignId: id,
          recipientId: recipient.id,
          shortlinkSlug: shortlinkData.slug,
        }, 'Created shortlink for campaign recipient');
      }

      // Update recipient with discount code and shortlink
      const updatedRecipient = await prisma.campaignRecipient.update({
        where: { id: recipient.id },
        data: {
          // Store discount code and shortlink info in metadata
          // This would require extending the CampaignRecipient model
        }
      });

      updatedRecipients.push({
        id: updatedRecipient.id,
        contactId: updatedRecipient.contactId,
        discountCode: discountCode?.code,
        shortlink: shortlink,
      });
    }

    // Update campaign status
    await prisma.campaign.update({
      where: { id },
      data: {
        status: 'prepared',
        updatedAt: new Date(),
      }
    });

    logger.info({
      shop,
      campaignId: id,
      recipientsCount: campaign.recipients.length,
      codesAssigned: discountCodes.length,
      shortlinksCreated: updatedRecipients.filter(r => r.shortlink).length,
    }, 'Campaign prepared successfully');

    res.json({
      success: true,
      campaignId: id,
      status: 'prepared',
      recipientsCount: campaign.recipients.length,
      codesNeeded,
      poolAvailable,
      canProceed,
      codesAssigned: discountCodes.length,
      shortlinksCreated: updatedRecipients.filter(r => r.shortlink).length,
      recipients: updatedRecipients,
    });
  } catch (error) {
    logger.error({
      error: error.message,
      shop: req.query.shop,
      campaignId: req.params.id,
    }, 'Failed to prepare campaign');
    
    res.status(500).json({
      error: 'preparation_failed',
      message: error.message,
    });
  }
});

export default router;
