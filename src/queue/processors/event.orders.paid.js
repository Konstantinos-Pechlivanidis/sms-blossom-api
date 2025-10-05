// src/queue/processors/event.orders.paid.js
// Orders paid → thank-you SMS

import { getPrismaClient } from '../../db/prismaClient.js';
import { renderGateQueueAndSend } from '../../services/messages.js';
import { cancelAbandonedCheckoutJobs } from '../../services/scheduler.js';

const prisma = getPrismaClient();

/**
 * Orders paid → thank-you SMS.
 * PCD-safe: we never request protected data here; we rely on our local Contact.
 * Strategy:
 *  - identify Contact by (shopId, customerId) if webhook payload provides it (GraphQL gid or numeric id).
 *  - if not found, exit silently (we don't try to read phone from payload).
 */
export async function processOrderPaid({ shopDomain: _shopDomain, shopId, payload }) {
  const orderId = payload?.id || payload?.admin_graphql_api_id || null;
  const customerId = payload?.customer?.id || payload?.customer_id || null;
  if (!customerId) return;
  const contact = await prisma.contact.findFirst({
    where: { shopId, customerId: String(customerId), optedOut: false },
  });
  if (!contact) return;
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });

  // Cancel abandoned job if linked checkout exists
  const checkoutId = payload?.checkout_id || payload?.checkoutId || null;
  if (checkoutId) {
    await cancelAbandonedCheckoutJobs({ shopId, checkoutId: String(checkoutId) });
  }

  await renderGateQueueAndSend({
    shop,
    contact,
    phoneE164: contact.phoneE164,
    templateKey: 'order_paid',
    vars: { order: { id: orderId } },
    triggerKey: 'order_paid',
    dedupeKey: String(orderId || ''),
  });
}
