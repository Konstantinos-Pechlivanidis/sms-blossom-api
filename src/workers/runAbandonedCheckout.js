// src/workers/runAbandonedCheckout.js
// Abandoned checkout worker execution

import { getPrismaClient } from '../db/prismaClient.js';
import { renderGateQueueAndSend } from '../services/messages.js';

const prisma = getPrismaClient();

/**
 * payload shape (suggested):
 * {
 *   shopDomain: "<store>.myshopify.com",
 *   checkoutToken: "<token>",
 *   customerId: "gid://shopify/Customer/123" | "123" | null,
 *   email: "user@example.com" | null,
 *   recoveryUrl: "https://.../checkouts/.../recover?key=..."
 * }
 */
export async function runAbandonedCheckout(job) {
  const payload = job.payload || {};
  const shopDomain = payload.shopDomain;
  const shop = await prisma.shop.findFirst({ where: { domain: shopDomain } });
  if (!shop) return;

  // Resolve Contact: prefer by customerId, else by email
  let contact = null;
  if (payload.customerId) {
    contact = await prisma.contact.findFirst({
      where: { shopId: shop.id, customerId: String(payload.customerId), optedOut: false },
    });
  }
  if (!contact && payload.email) {
    contact = await prisma.contact.findFirst({
      where: { shopId: shop.id, email: payload.email, optedOut: false },
    });
  }
  if (!contact) return; // nothing to send to

  const url = payload.recoveryUrl || payload.abandoned_checkout_url || payload.recovery_url;
  if (!url) return; // no valid recovery link

  await renderGateQueueAndSend({
    shop,
    contact,
    phoneE164: contact.phoneE164,
    templateKey: 'abandoned_checkout',
    vars: { recoveryUrl: url },
    triggerKey: 'abandoned_checkout',
    dedupeKey: String(payload.checkoutToken || ''),
  });
}
