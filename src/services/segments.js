// src/services/segments.js
// Segments service for CRUD and preview

import { getPrismaClient } from '../db/prismaClient.js';
import { dslToWhere } from './segment-dsl.js';

const prisma = getPrismaClient();

/** Create or update a Segment */
export async function upsertSegment({ shopId, id = null, name, filterJson }) {
  const data = { shopId, name, filterJson };
  if (id) {
    const row = await prisma.segment.update({ where: { id }, data });
    return row;
  }
  const row = await prisma.segment.create({ data });
  return row;
}

/** Preview contacts (count + sample) that match DSL */
export async function previewSegment({ shopId, filterJson, limit = 25 }) {
  const where = { shopId, ...dslToWhere(filterJson) };
  // Always exclude opted-out unless explicitly requested by DSL
  if (!filterJson?.consent) {
    where.smsConsentState = 'opted_in';
    where.optedOut = false;
  }
  const count = await prisma.contact.count({ where });
  const results = await prisma.contact.findMany({
    where,
    take: Math.min(100, Math.max(1, limit)),
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      phoneE164: true,
      locale: true,
      smsConsentState: true,
      tagsJson: true,
    },
  });
  return { count, sample: results };
}

/** Snapshot segment into CampaignRecipient (idempotent per contact) */
export async function snapshotSegmentToCampaign({ shopId, campaignId, filterJson }) {
  const where = { shopId, ...dslToWhere(filterJson) };
  if (!filterJson?.consent) {
    where.smsConsentState = 'opted_in';
    where.optedOut = false;
  }
  const ids = await prisma.contact.findMany({ where, select: { id: true } });
  let created = 0;
  for (const c of ids) {
    try {
      await prisma.campaignRecipient.create({
        data: { shopId, campaignId, contactId: c.id },
      });
      created++;
    } catch {
      /* unique */
    }
  }
  return { total: ids.length, inserted: created };
}
