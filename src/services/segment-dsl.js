// src/services/segment-dsl.js
// Minimal, safe DSL → Prisma.where translator for Contact

import { getPrismaClient } from '../db/prismaClient.js';
import { logger } from '../lib/logger.js';

const prisma = getPrismaClient();

/**
 * Minimal, safe DSL → Prisma.where translator for Contact.
 * Supported:
 *  { consent: 'opted_in'|'opted_out'|'unknown' }
 *  { tag: 'vip' } or { tags: { has: 'vip' } }  (expects Contact.tagsJson = string[])
 *  { locale: 'el' } / { locale: { in: ['el','en'] } }
 *  { not: {...} }, { and:[...]} , { or:[...] }
 */
export function dslToWhere(dsl) {
  if (!dsl || typeof dsl !== 'object') return {};
  if (Array.isArray(dsl)) return { AND: dsl.map(dslToWhere) };

  const out = {};
  const AND = [];
  const OR = [];

  for (const [k, v] of Object.entries(dsl)) {
    if (k === 'and' && Array.isArray(v)) AND.push(...v.map(dslToWhere));
    else if (k === 'or' && Array.isArray(v)) OR.push(...v.map(dslToWhere));
    else if (k === 'not' && typeof v === 'object') AND.push({ NOT: dslToWhere(v) });
    else if (k === 'consent') {
      AND.push({ smsConsentState: String(v) });
    } else if (k === 'tag') {
      AND.push({ tagsJson: { array_contains: [String(v)] } });
    } else if (k === 'tags' && v && typeof v === 'object' && v.has) {
      AND.push({ tagsJson: { array_contains: [String(v.has)] } });
    } else if (k === 'locale') {
      if (typeof v === 'object' && Array.isArray(v.in)) AND.push({ locale: { in: v.in } });
      else AND.push({ locale: String(v) });
    } else if (k === 'optedOut') {
      AND.push({ optedOut: !!v });
    } else if (k === 'phoneStartsWith') {
      AND.push({ phoneE164: { startsWith: String(v) } });
    }
  }

  if (AND.length) out.AND = AND;
  if (OR.length) out.OR = OR;
  return out;
}

/**
 * Evaluate a single contact against a segment filter
 */
export async function evaluateSegmentFilter(contact, filter) {
  if (!filter || typeof filter !== 'object') return false;

  try {
    // Convert DSL to Prisma where clause
    const whereClause = dslToWhere(filter);

    // For single contact evaluation, we need to check if the contact matches the criteria
    // This is a simplified version - in practice, you might want more sophisticated matching

    // Check basic fields
    if (whereClause.AND) {
      for (const condition of whereClause.AND) {
        if (condition.smsConsentState && contact.smsConsentState !== condition.smsConsentState) {
          return false;
        }
        if (condition.optedOut !== undefined && contact.optedOut !== condition.optedOut) {
          return false;
        }
        if (condition.tagsJson && condition.tagsJson.array_contains) {
          const contactTags = contact.tagsJson || [];
          if (!contactTags.includes(condition.tagsJson.array_contains[0])) {
            return false;
          }
        }
        if (condition.phoneE164 && condition.phoneE164.startsWith) {
          if (!contact.phoneE164?.startsWith(condition.phoneE164.startsWith)) {
            return false;
          }
        }
      }
    }

    if (whereClause.OR) {
      let orMatch = false;
      for (const condition of whereClause.OR) {
        if (condition.smsConsentState && contact.smsConsentState === condition.smsConsentState) {
          orMatch = true;
          break;
        }
        if (condition.optedOut !== undefined && contact.optedOut === condition.optedOut) {
          orMatch = true;
          break;
        }
      }
      if (!orMatch) return false;
    }

    return true;
  } catch (error) {
    logger.error(
      { error: error.message, contactId: contact.id, filter },
      'Failed to evaluate segment filter for contact',
    );
    return false;
  }
}

/**
 * Evaluate segment DSL filter and return count + sample IDs
 */
export async function evaluateSegmentDSL({ shopId, filter, limit = 10 }) {
  const startTime = Date.now();

  try {
    // Convert DSL to Prisma where clause
    const whereClause = dslToWhere(filter);

    // Add shop scoping
    const where = {
      ...whereClause,
      shopId,
    };

    logger.info(
      {
        shopId,
        filter,
        whereClause,
        limit,
      },
      'Evaluating segment DSL',
    );

    // Get total count
    const count = await prisma.contact.count({ where });

    // Get sample IDs
    const sampleContacts = await prisma.contact.findMany({
      where,
      select: { id: true },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const sampleIds = sampleContacts.map((contact) => contact.id);

    const executionTime = Date.now() - startTime;

    logger.info(
      {
        shopId,
        count,
        sampleCount: sampleIds.length,
        executionTime,
      },
      'Segment DSL evaluation completed',
    );

    return {
      count,
      sampleIds,
      executionTime,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;

    logger.error(
      {
        error: error.message,
        shopId,
        filter,
        executionTime,
      },
      'Failed to evaluate segment DSL',
    );

    throw error;
  }
}
