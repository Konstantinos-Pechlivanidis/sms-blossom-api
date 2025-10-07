// src/routes/segments-preview.js
// Segment preview endpoint with DSL filtering

import { Router } from 'express';
import { logger } from '../lib/logger.js';
import { getPrismaClient } from '../db/prismaClient.js';
import { evaluateSegmentFilter } from '../services/segment-dsl.js';

const router = Router();
const prisma = getPrismaClient();

/**
 * POST /segments/preview
 * Preview segment with DSL filter and return count + sample IDs
 */
router.post('/preview', async (req, res) => {
  const { shopId, filter, limit = 10, timeout = 5000 } = req.body;

  if (!shopId) {
    return res.status(400).json({ error: 'missing_shop_id' });
  }

  if (!filter) {
    return res.status(400).json({ error: 'missing_filter' });
  }

  if (limit > 100) {
    return res.status(400).json({ error: 'limit_too_high', maxLimit: 100 });
  }

  try {
    // Set timeout for the operation
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Segment preview timeout')), timeout);
    });

    const previewPromise = async () => {
      // Get all contacts for the shop
      const contacts = await prisma.contact.findMany({
        where: { shopId },
        select: {
          id: true,
          phoneE164: true,
          firstName: true,
          lastName: true,
          email: true,
          optedOut: true,
          tagsJson: true,
          createdAt: true,
          lastOrderAt: true,
          totalSpent: true,
        },
      });

      logger.info(
        { shopId, totalContacts: contacts.length, filter },
        'Starting segment preview evaluation',
      );

      // Evaluate filter against contacts
      const matchingContacts = [];
      const errors = [];

      for (const contact of contacts) {
        try {
          const matches = await evaluateSegmentFilter(contact, filter);
          if (matches) {
            matchingContacts.push({
              id: contact.id,
              phoneE164: contact.phoneE164,
              firstName: contact.firstName,
              lastName: contact.lastName,
              email: contact.email,
            });
          }
        } catch (error) {
          errors.push({
            contactId: contact.id,
            error: error.message,
          });
        }

        // Stop if we have enough samples
        if (matchingContacts.length >= limit) {
          break;
        }
      }

      return {
        totalMatches: matchingContacts.length,
        sampleIds: matchingContacts.slice(0, limit).map((c) => c.id),
        sampleContacts: matchingContacts.slice(0, limit),
        errors: errors.slice(0, 10), // Limit error reporting
        evaluated: contacts.length,
      };
    };

    const result = await Promise.race([previewPromise(), timeoutPromise]);

    logger.info(
      {
        shopId,
        totalMatches: result.totalMatches,
        sampleCount: result.sampleContacts.length,
        evaluated: result.evaluated,
        errors: result.errors.length,
      },
      'Segment preview completed',
    );

    res.json({
      ok: true,
      shopId,
      filter,
      ...result,
      metadata: {
        limit,
        timeout,
        evaluated: result.evaluated,
        errorCount: result.errors.length,
      },
    });
  } catch (error) {
    if (error.message === 'Segment preview timeout') {
      logger.warn({ shopId, timeout, filter }, 'Segment preview timed out');
      return res.status(408).json({
        error: 'timeout',
        message: 'Segment preview timed out',
        timeout,
      });
    }

    logger.error({ error: error.message, shopId, filter }, 'Failed to preview segment');

    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to evaluate segment filter',
    });
  }
});

/**
 * POST /segments/preview/count
 * Get only the count of matching contacts (faster for large segments)
 */
router.post('/preview/count', async (req, res) => {
  const { shopId, filter, timeout = 10000 } = req.body;

  if (!shopId) {
    return res.status(400).json({ error: 'missing_shop_id' });
  }

  if (!filter) {
    return res.status(400).json({ error: 'missing_filter' });
  }

  try {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Segment count timeout')), timeout);
    });

    const countPromise = async () => {
      const contacts = await prisma.contact.findMany({
        where: { shopId },
        select: {
          id: true,
          phoneE164: true,
          firstName: true,
          lastName: true,
          email: true,
          optedOut: true,
          tagsJson: true,
          createdAt: true,
          lastOrderAt: true,
          totalSpent: true,
        },
      });

      let matchCount = 0;
      const errors = [];

      for (const contact of contacts) {
        try {
          const matches = await evaluateSegmentFilter(contact, filter);
          if (matches) {
            matchCount++;
          }
        } catch (error) {
          errors.push({
            contactId: contact.id,
            error: error.message,
          });
        }
      }

      return {
        totalMatches: matchCount,
        totalContacts: contacts.length,
        errors: errors.slice(0, 5), // Limit error reporting
      };
    };

    const result = await Promise.race([countPromise(), timeoutPromise]);

    logger.info(
      {
        shopId,
        totalMatches: result.totalMatches,
        totalContacts: result.totalContacts,
        errors: result.errors.length,
      },
      'Segment count completed',
    );

    res.json({
      ok: true,
      shopId,
      filter,
      count: result.totalMatches,
      totalContacts: result.totalContacts,
      errorCount: result.errors.length,
      metadata: {
        timeout,
        evaluated: result.totalContacts,
      },
    });
  } catch (error) {
    if (error.message === 'Segment count timeout') {
      logger.warn({ shopId, timeout, filter }, 'Segment count timed out');
      return res.status(408).json({
        error: 'timeout',
        message: 'Segment count timed out',
        timeout,
      });
    }

    logger.error({ error: error.message, shopId, filter }, 'Failed to count segment');

    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to count segment matches',
    });
  }
});

export default router;
