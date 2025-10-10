// src/services/contacts-denormalize.js
// Contact denormalization service for age updates

import { getPrismaClient } from '../db/prismaClient.js';
import { deriveAgeYears } from '../lib/age-utils.js';
import { logger } from '../lib/logger.js';

const prisma = getPrismaClient();

/**
 * Update ageYears for contacts with birthdate but no age
 * This handles birthday updates and initial age calculation
 */
export async function denormalizeContactAges({ shopId = null, batchSize = 1000 } = {}) {
  const startTime = Date.now();
  let processed = 0;
  let updated = 0;
  let errors = 0;

  try {
    logger.info({ shopId, batchSize }, 'Starting contact age denormalization');

    const whereClause = {
      birthdate: { not: null },
      ageYears: null, // Only update contacts without age
    };

    if (shopId) {
      whereClause.shopId = shopId;
    }

    // Process in batches
    let hasMore = true;
    let cursor = null;

    while (hasMore) {
      const contacts = await prisma.contact.findMany({
        where: {
          ...whereClause,
          ...(cursor && { id: { gt: cursor } }),
        },
        select: {
          id: true,
          birthdate: true,
          ageYears: true,
        },
        take: batchSize,
        orderBy: { id: 'asc' },
      });

      if (contacts.length === 0) {
        hasMore = false;
        break;
      }

      // Update each contact
      for (const contact of contacts) {
        try {
          const ageYears = deriveAgeYears(contact.birthdate);
          
          if (ageYears !== null) {
            await prisma.contact.update({
              where: { id: contact.id },
              data: { ageYears },
            });
            updated++;
          }
          
          processed++;
        } catch (error) {
          logger.error(
            { error: error.message, contactId: contact.id },
            'Failed to update contact age',
          );
          errors++;
        }
      }

      cursor = contacts[contacts.length - 1].id;
    }

    const executionTime = Date.now() - startTime;

    logger.info(
      {
        shopId,
        processed,
        updated,
        errors,
        executionTime,
      },
      'Contact age denormalization completed',
    );

    return {
      processed,
      updated,
      errors,
      executionTime,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    logger.error(
      {
        error: error.message,
        shopId,
        processed,
        updated,
        errors,
        executionTime,
      },
      'Contact age denormalization failed',
    );

    throw error;
  }
}

/**
 * Update conversion tracking for a contact
 * @param {string} contactId - Contact ID
 * @param {number} orderSubtotalCents - Order subtotal in cents
 */
export async function updateContactConversion(contactId, orderSubtotalCents = 0) {
  try {
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        conversionCount: { increment: 1 },
        lastConvertedAt: new Date(),
        conversionLtvCents: { increment: orderSubtotalCents },
      },
    });

    logger.info(
      { contactId, orderSubtotalCents },
      'Updated contact conversion tracking',
    );
  } catch (error) {
    logger.error(
      { error: error.message, contactId, orderSubtotalCents },
      'Failed to update contact conversion tracking',
    );
    throw error;
  }
}
