// src/services/campaigns-sender.js
// Campaign sender with batching and throttling

import { getPrismaClient } from '../db/prismaClient.js';
import { renderGateQueueAndSend } from './messages.js';
import { buildCampaignApplyUrl } from './discounts.js';

const prisma = getPrismaClient();

const BATCH_SIZE = Number(process.env.CAMPAIGN_BATCH_SIZE || '500');
const THROTTLE_MS = Number(process.env.CAMPAIGN_THROTTLE_MS || '1000'); // time between batches

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Sends a campaign to its snapshotted audience (CampaignRecipient rows).
 * Honors rules via renderGateQueueAndSend(kind='campaign', triggerKey='campaign:<id>').
 * Returns {sent, failed, skipped}.
 */
export async function sendCampaignBatched({ shop, campaign }) {
  let sent = 0,
    failed = 0,
    skipped = 0;

  while (true) {
    const recips = await prisma.campaignRecipient.findMany({
      where: { shopId: shop.id, campaignId: campaign.id, status: 'pending' },
      take: BATCH_SIZE,
      orderBy: { createdAt: 'asc' },
      include: { contact: true },
    });
    if (!recips.length) break;

    for (const r of recips) {
      const c = r.contact;
      if (!c || c.optedOut || c.smsConsentState !== 'opted_in') {
        await prisma.campaignRecipient.update({
          where: { id: r.id },
          data: { status: 'skipped', reason: 'no_consent' },
        });
        skipped++;
        continue;
      }
      try {
        // Discount injection (if campaign has discount)
        let discountVars = null;
        if (campaign.discountId) {
          const disc = await prisma.discount.findFirst({
            where: { id: campaign.discountId, shopId: shop.id },
          });
          if (disc?.code) {
            const { url } = await buildCampaignApplyUrl({
              shopId: shop.id,
              shopDomain: shop.domain,
              code: disc.code,
              redirect: '/checkout',
              utm: campaign.utmJson || {},
              campaignId: campaign.id,
            });
            discountVars = { code: disc.code, apply_url: url };
          }
        }

        const result = await renderGateQueueAndSend({
          shop,
          contact: c,
          phoneE164: c.phoneE164,
          templateKey: campaign.templateKey || 'campaign',
          vars: {
            campaign: { id: campaign.id, name: campaign.name || 'Campaign' },
            ...(discountVars ? { discount: discountVars } : {}),
          },
          kind: 'campaign',
          triggerKey: `campaign:${campaign.id}`,
          dedupeKey: `${campaign.id}:${c.id}`,
          metadata: { type: 'campaign', campaignId: campaign.id, ...(discountVars || {}) },
        });

        if (result.sent) {
          sent++;
          await prisma.campaignRecipient.update({
            where: { id: r.id },
            data: { status: 'sent', messageId: result.messageId, reason: null },
          });
        } else {
          skipped++;
          await prisma.campaignRecipient.update({
            where: { id: r.id },
            data: { status: 'skipped', reason: result.reason || 'gated' },
          });
        }
      } catch (e) {
        failed++;
        await prisma.campaignRecipient.update({
          where: { id: r.id },
          data: { status: 'failed', reason: String(e?.message || e) },
        });
      }
    }

    await sleep(THROTTLE_MS);
  }

  return { sent, failed, skipped };
}
