// src/queue/processors/event.checkouts.update.js
// Abandoned checkout processor with scheduling

import { getPrismaClient } from '../../db/prismaClient.js';
import {
  upsertAbandonedCheckoutJob,
  cancelAbandonedCheckoutJobs,
} from '../../services/scheduler.js';
import { buildRecoveryUrl } from '../../services/recovery-url.js';

const prisma = getPrismaClient();

export async function processCheckoutsUpdate({ shopDomain, shopId, payload }) {
  const checkoutId = payload?.id || payload?.admin_graphql_api_id || null;
  const customerId = payload?.customer?.id || payload?.customer_id || null;
  if (!customerId) return;
  const contact = await prisma.contact.findFirst({
    where: { shopId, customerId: String(customerId), optedOut: false },
  });
  if (!contact) return;
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });

  // If checkout completed or has order → cancel pending job
  const completedAt = payload?.completed_at || payload?.completedAt || null;
  if (completedAt) {
    await cancelAbandonedCheckoutJobs({ shopId, checkoutId: String(checkoutId) });
    return;
  }

  // Determine inactivity window (delay) from automations settings
  const delayMin = Number(shop?.settingsJson?.automations?.abandoned?.delayMinutes ?? 30);
  const runAt = new Date(Date.now() + Math.max(5, delayMin) * 60 * 1000);

  // Build recovery URL (with discount + UTM if configured)
  const discountCode = shop?.settingsJson?.automations?.abandoned?.discountCode || null;
  const utm = { utm_source: 'sms', utm_medium: 'sms', utm_campaign: 'abandoned_checkout' };
  const recoveryUrl = await buildRecoveryUrl({ shopId, shopDomain, payload, discountCode, utm });

  // Upsert (snooze) a job keyed by checkoutId (inactivity window restarts on activity)
  await upsertAbandonedCheckoutJob({
    shop,
    contact,
    phoneE164: contact.phoneE164,
    checkoutId: String(checkoutId || ''),
    runAt,
    recoveryUrl,
  });
}
