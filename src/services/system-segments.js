// src/services/system-segments.js
// System segments service for creating and managing standard segments

import { getPrismaClient } from '../db/prismaClient.js';
import { logger } from '../lib/logger.js';

const prisma = getPrismaClient();

// System segments configuration
const SYSTEM_SEGMENTS = [
  // Gender segments
  {
    slug: 'male',
    name: 'Male Customers',
    filterJson: { gender: 'male' },
  },
  {
    slug: 'female',
    name: 'Female Customers',
    filterJson: { gender: 'female' },
  },
  
  // Age band segments
  {
    slug: 'age_18_24',
    name: 'Age 18-24',
    filterJson: { ageYears: { gte: 18, lte: 24 } },
  },
  {
    slug: 'age_25_34',
    name: 'Age 25-34',
    filterJson: { ageYears: { gte: 25, lte: 34 } },
  },
  {
    slug: 'age_35_44',
    name: 'Age 35-44',
    filterJson: { ageYears: { gte: 35, lte: 44 } },
  },
  {
    slug: 'age_45_54',
    name: 'Age 45-54',
    filterJson: { ageYears: { gte: 45, lte: 54 } },
  },
  {
    slug: 'age_55_plus',
    name: 'Age 55+',
    filterJson: { ageYears: { gte: 55 } },
  },
  
  // Conversion segments
  {
    slug: 'converted_last_90d',
    name: 'Converted Last 90 Days',
    filterJson: { conversion: { lastNDays: 90, minCount: 1 } },
  },
  {
    slug: 'converted_lifetime',
    name: 'Converted Lifetime',
    filterJson: { conversion: { minCount: 1 } },
  },
];

/**
 * Create or update system segments for a shop
 * @param {string} shopId - Shop ID
 * @returns {Promise<Object>} Results
 */
export async function createSystemSegments(shopId) {
  const startTime = Date.now();
  let created = 0;
  let updated = 0;
  let errors = 0;
  const errorDetails = [];

  try {
    logger.info({ shopId }, 'Creating system segments');

    for (const segmentConfig of SYSTEM_SEGMENTS) {
      try {
        const result = await upsertSystemSegment(shopId, segmentConfig);
        
        if (result.created) created++;
        if (result.updated) updated++;
      } catch (error) {
        errors++;
        errorDetails.push({
          slug: segmentConfig.slug,
          error: error.message,
        });
        logger.error(
          { error: error.message, shopId, slug: segmentConfig.slug },
          'Failed to create system segment',
        );
      }
    }

    const executionTime = Date.now() - startTime;

    logger.info(
      {
        shopId,
        created,
        updated,
        errors,
        executionTime,
      },
      'System segments creation completed',
    );

    return {
      created,
      updated,
      errors,
      errorDetails: errorDetails.slice(0, 10), // Limit error details
      executionTime,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    logger.error(
      {
        error: error.message,
        shopId,
        created,
        updated,
        errors,
        executionTime,
      },
      'System segments creation failed',
    );

    throw error;
  }
}

/**
 * Upsert a single system segment
 * @param {string} shopId - Shop ID
 * @param {Object} segmentConfig - Segment configuration
 * @returns {Promise<Object>} Result
 */
async function upsertSystemSegment(shopId, segmentConfig) {
  const { slug, name, filterJson } = segmentConfig;

  // Check if segment already exists
  const existingSegment = await prisma.segment.findFirst({
    where: {
      shopId,
      slug,
    },
  });

  if (existingSegment) {
    // Update existing segment
    await prisma.segment.update({
      where: { id: existingSegment.id },
      data: {
        name,
        filterJson,
        isSystem: true,
      },
    });

    return { created: false, updated: true };
  } else {
    // Create new segment
    await prisma.segment.create({
      data: {
        shopId,
        name,
        filterJson,
        isSystem: true,
        slug,
      },
    });

    return { created: true, updated: false };
  }
}

/**
 * Get system segments for a shop
 * @param {string} shopId - Shop ID
 * @returns {Promise<Array>} System segments
 */
export async function getSystemSegments(shopId) {
  try {
    const segments = await prisma.segment.findMany({
      where: {
        shopId,
        isSystem: true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        filterJson: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: 'asc' },
    });

    return segments;
  } catch (error) {
    logger.error(
      { error: error.message, shopId },
      'Failed to get system segments',
    );
    throw error;
  }
}

/**
 * Delete system segments for a shop
 * @param {string} shopId - Shop ID
 * @returns {Promise<number>} Number of deleted segments
 */
export async function deleteSystemSegments(shopId) {
  try {
    const result = await prisma.segment.deleteMany({
      where: {
        shopId,
        isSystem: true,
      },
    });

    logger.info(
      { shopId, deletedCount: result.count },
      'Deleted system segments',
    );

    return result.count;
  } catch (error) {
    logger.error(
      { error: error.message, shopId },
      'Failed to delete system segments',
    );
    throw error;
  }
}
