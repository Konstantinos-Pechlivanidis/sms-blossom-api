// src/services/discounts-service.js
// Discounts service for Shopify Admin GraphQL integration

import { logger } from '../lib/logger.js';
import { getPrismaClient } from '../db/prismaClient.js';
import { buildApplyUrl } from './discounts.js';

const prisma = getPrismaClient();

/**
 * Create a discount code via Shopify Admin GraphQL
 * @param {Object} params - Discount creation parameters
 * @param {string} params.shopId - Shop ID
 * @param {string} params.code - Discount code
 * @param {string} params.title - Discount title
 * @param {string} params.kind - Discount type (percentage|amount)
 * @param {number} params.value - Discount value
 * @param {string} params.currencyCode - Currency code
 * @param {Date} params.startsAt - Start date
 * @param {Date} params.endsAt - End date
 * @param {boolean} params.appliesOncePerCustomer - Once per customer flag
 * @param {number} params.usageLimit - Usage limit
 * @param {string} params.redirect - Redirect URL
 * @param {Array<string>} params.segments - Target segments
 * @returns {Promise<Object>} Created discount response
 */
export async function createDiscount(params) {
  const {
    shopId,
    code,
    title: _title,
    kind,
    value,
    currencyCode,
    startsAt,
    endsAt,
    appliesOncePerCustomer = true,
    usageLimit,
    redirect = '/checkout',
    segments = [],
  } = params;

  logger.info({ shopId, code, kind, value }, 'Creating discount code');

  try {
    // Check for existing discount with same code
    const existingDiscount = await prisma.discount.findFirst({
      where: {
        shopId,
        code,
      },
    });

    if (existingDiscount) {
      throw new Error(`Discount code '${code}' already exists`);
    }

    // TODO: In Sprint 5, integrate with Shopify Admin GraphQL
    // For now, create local discount record
    const discount = await prisma.discount.create({
      data: {
        shopId,
        code,
        type: kind,
        value: value,
        currencyCode,
        startsAt,
        endsAt,
        usageLimit,
        oncePerCustomer: appliesOncePerCustomer,
        status: 'active',
        utmJson: {
          utm_source: 'sms',
          utm_medium: 'sms',
          segments,
        },
      },
    });

    // Build apply URL with UTM parameters
    const applyUrl = buildApplyUrl({
      shopDomain: shopId,
      code,
      redirect,
      utm: {
        utm_source: 'sms',
        utm_medium: 'sms',
      },
    });

    // Update discount with apply URL
    await prisma.discount.update({
      where: { id: discount.id },
      data: { applyUrl },
    });

    logger.info({ discountId: discount.id, code, applyUrl }, 'Discount created successfully');

    return {
      ok: true,
      code: discount.code,
      title: discount.title,
      id: discount.id,
      startsAt: discount.startsAt,
      endsAt: discount.endsAt,
      applyUrl,
    };
  } catch (error) {
    logger.error({ error: error.message, shopId, code }, 'Failed to create discount');
    throw error;
  }
}

/**
 * Update an existing discount
 * @param {Object} params - Discount update parameters
 * @param {string} params.shopId - Shop ID
 * @param {string} params.discountId - Discount ID
 * @param {Object} params.updates - Fields to update
 * @returns {Promise<Object>} Updated discount response
 */
export async function updateDiscount(params) {
  const { shopId, discountId, updates } = params;

  logger.info({ shopId, discountId }, 'Updating discount');

  try {
    const discount = await prisma.discount.findFirst({
      where: {
        id: discountId,
        shopId,
      },
    });

    if (!discount) {
      throw new Error('Discount not found');
    }

    // Update discount fields
    const updatedDiscount = await prisma.discount.update({
      where: { id: discountId },
      data: {
        ...updates,
        updatedAt: new Date(),
      },
    });

    logger.info({ discountId, code: updatedDiscount.code }, 'Discount updated successfully');

    return {
      ok: true,
      discount: updatedDiscount,
    };
  } catch (error) {
    logger.error({ error: error.message, shopId, discountId }, 'Failed to update discount');
    throw error;
  }
}

/**
 * Get discount by ID
 * @param {Object} params - Parameters
 * @param {string} params.shopId - Shop ID
 * @param {string} params.discountId - Discount ID
 * @returns {Promise<Object>} Discount details
 */
export async function getDiscount(params) {
  const { shopId, discountId } = params;

  try {
    const discount = await prisma.discount.findFirst({
      where: {
        id: discountId,
        shopId,
      },
    });

    if (!discount) {
      throw new Error('Discount not found');
    }

    return {
      ok: true,
      discount,
    };
  } catch (error) {
    logger.error({ error: error.message, shopId, discountId }, 'Failed to get discount');
    throw error;
  }
}

/**
 * List discounts for a shop
 * @param {Object} params - Parameters
 * @param {string} params.shopId - Shop ID
 * @param {number} params.limit - Limit results
 * @param {number} params.offset - Offset for pagination
 * @returns {Promise<Object>} Discounts list
 */
export async function listDiscounts(params) {
  const { shopId, limit = 50, offset = 0 } = params;

  try {
    const [discounts, total] = await Promise.all([
      prisma.discount.findMany({
        where: { shopId },
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.discount.count({
        where: { shopId },
      }),
    ]);

    return {
      ok: true,
      discounts,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    };
  } catch (error) {
    logger.error({ error: error.message, shopId }, 'Failed to list discounts');
    throw error;
  }
}

/**
 * Check for discount conflicts with automatic discounts
 * @param {Object} params - Parameters
 * @param {string} params.shopId - Shop ID
 * @returns {Promise<Object>} Conflicts analysis
 */
export async function checkDiscountConflicts(params) {
  const { shopId } = params;

  logger.info({ shopId }, 'Checking discount conflicts');

  try {
    // TODO: In Sprint 5, query Shopify for active automatic discounts
    // For now, return empty conflicts
    const automaticDiscounts = [];

    return {
      ok: true,
      automaticDiscounts,
      warnings:
        automaticDiscounts.length > 0
          ? ['Active automatic discounts may conflict with manual discount codes']
          : [],
    };
  } catch (error) {
    logger.error({ error: error.message, shopId }, 'Failed to check discount conflicts');
    throw error;
  }
}

/**
 * Build apply URL for a discount code
 * @param {Object} params - Parameters
 * @param {string} params.shopId - Shop ID
 * @param {string} params.code - Discount code
 * @param {string} params.redirect - Redirect URL
 * @param {Object} params.utm - UTM parameters
 * @returns {Promise<Object>} Apply URL response
 */
export async function buildDiscountApplyUrl(params) {
  const { shopId, code, redirect = '/checkout', utm = {} } = params;

  try {
    const applyUrl = buildApplyUrl({
      shopDomain: shopId,
      code,
      redirect,
      utm: {
        utm_source: 'sms',
        utm_medium: 'sms',
        ...utm,
      },
    });

    return {
      ok: true,
      url: applyUrl,
    };
  } catch (error) {
    logger.error({ error: error.message, shopId, code }, 'Failed to build apply URL');
    throw error;
  }
}
