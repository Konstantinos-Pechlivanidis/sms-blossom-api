import { getPrismaClient } from '../../db/prismaClient.js';
import { logger } from '../../lib/logger.js';

const prisma = getPrismaClient();

/**
 * Process discount code reservation job for large segments
 */
export async function processDiscountReservation(job) {
  const { campaignId, poolId, quantity, batchSize = 100 } = job.payload;
  
  try {
    logger.info({
      jobId: job.id,
      campaignId,
      poolId,
      quantity,
    }, 'Processing discount code reservation');

    // Get campaign
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      logger.error({
        campaignId,
      }, 'Campaign not found for discount reservation');
      return;
    }

    // Get pool
    const pool = await prisma.discountCodePool.findUnique({
      where: { id: poolId }
    });

    if (!pool) {
      logger.error({
        poolId,
      }, 'Discount code pool not found');
      return;
    }

    // Check available codes
    const availableCount = await prisma.discountCode.count({
      where: {
        poolId: pool.id,
        status: 'available'
      }
    });

    if (availableCount < quantity) {
      logger.error({
        poolId,
        availableCount,
        requestedQuantity: quantity,
      }, 'Insufficient discount codes available');
      return;
    }

    // Create reservation
    const reservation = await prisma.discountCodeReservation.create({
      data: {
        shopId: campaign.shopId,
        poolId: pool.id,
        campaignId: campaign.id,
        quantity,
        status: 'active',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      }
    });

    // Reserve codes in batches
    let reservedCount = 0;
    let offset = 0;

    while (reservedCount < quantity) {
      const batchSizeToReserve = Math.min(batchSize, quantity - reservedCount);
      
      // Get available codes for this batch
      const availableCodes = await prisma.discountCode.findMany({
        where: {
          poolId: pool.id,
          status: 'available'
        },
        take: batchSizeToReserve,
        skip: offset,
        orderBy: {
          createdAt: 'asc'
        }
      });

      if (availableCodes.length === 0) {
        logger.error({
          poolId,
          reservedCount,
          requestedQuantity: quantity,
        }, 'No more available codes to reserve');
        break;
      }

      // Reserve this batch
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

      reservedCount += availableCodes.length;
      offset += availableCodes.length;

      logger.info({
        poolId,
        batchSize: availableCodes.length,
        reservedCount,
        totalQuantity: quantity,
      }, 'Reserved batch of discount codes');

      // Small delay to prevent overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Update pool statistics
    await prisma.discountCodePool.update({
      where: { id: pool.id },
      data: {
        reservedCodes: {
          increment: reservedCount
        }
      }
    });

    logger.info({
      campaignId,
      poolId,
      reservationId: reservation.id,
      reservedCount,
      requestedQuantity: quantity,
    }, 'Discount code reservation completed');

  } catch (error) {
    logger.error({
      error: error.message,
      jobId: job.id,
      campaignId,
      poolId,
    }, 'Failed to process discount code reservation');
    throw error;
  }
}

/**
 * Process discount code assignment job
 */
export async function processDiscountCodeAssignment(job) {
  const { campaignId, recipientId, discountCodeId } = job.payload;
  
  try {
    logger.info({
      jobId: job.id,
      campaignId,
      recipientId,
      discountCodeId,
    }, 'Processing discount code assignment');

    // Get the discount code
    const discountCode = await prisma.discountCode.findUnique({
      where: { id: discountCodeId }
    });

    if (!discountCode) {
      logger.error({
        discountCodeId,
      }, 'Discount code not found');
      return;
    }

    if (discountCode.status !== 'reserved') {
      logger.error({
        discountCodeId,
        status: discountCode.status,
      }, 'Discount code is not reserved');
      return;
    }

    // Get the campaign recipient
    const recipient = await prisma.campaignRecipient.findUnique({
      where: { id: recipientId }
    });

    if (!recipient) {
      logger.error({
        recipientId,
      }, 'Campaign recipient not found');
      return;
    }

    // Assign the discount code to the recipient
    await prisma.discountCode.update({
      where: { id: discountCodeId },
      data: {
        status: 'assigned',
        assignedTo: recipientId,
        updatedAt: new Date(),
      }
    });

    logger.info({
      campaignId,
      recipientId,
      discountCodeId,
      code: discountCode.code,
    }, 'Discount code assigned to recipient');

  } catch (error) {
    logger.error({
      error: error.message,
      jobId: job.id,
      campaignId,
      recipientId,
      discountCodeId,
    }, 'Failed to process discount code assignment');
    throw error;
  }
}

/**
 * Process discount code release job (for unused codes)
 */
export async function processDiscountCodeRelease(job) {
  const { reservationId, reason = 'unused' } = job.payload;
  
  try {
    logger.info({
      jobId: job.id,
      reservationId,
      reason,
    }, 'Processing discount code release');

    // Get the reservation
    const reservation = await prisma.discountCodeReservation.findUnique({
      where: { id: reservationId }
    });

    if (!reservation) {
      logger.error({
        reservationId,
      }, 'Discount code reservation not found');
      return;
    }

    // Release all codes in this reservation
    const releasedCount = await prisma.discountCode.updateMany({
      where: {
        reservationId: reservationId,
        status: 'reserved'
      },
      data: {
        status: 'available',
        reservedAt: null,
        reservationId: null,
        updatedAt: new Date(),
      }
    });

    // Update pool statistics
    await prisma.discountCodePool.update({
      where: { id: reservation.poolId },
      data: {
        reservedCodes: {
          decrement: releasedCount.count
        }
      }
    });

    // Update reservation status
    await prisma.discountCodeReservation.update({
      where: { id: reservationId },
      data: {
        status: 'released',
        updatedAt: new Date(),
      }
    });

    logger.info({
      reservationId,
      poolId: reservation.poolId,
      releasedCount: releasedCount.count,
      reason,
    }, 'Released discount codes from reservation');

  } catch (error) {
    logger.error({
      error: error.message,
      jobId: job.id,
      reservationId,
    }, 'Failed to process discount code release');
    throw error;
  }
}
