// src/queue/processors/event.orders.create.js
// Order created processor - cancels abandoned checkout jobs

import { getPrismaClient } from '../../db/prismaClient.js';
import { renderGateQueueAndSend } from '../../services/messages.js';
import { cancelAbandonedCheckoutJobs } from '../../services/scheduler.js';

const prisma = getPrismaClient();

export async function processOrderCreated({ shopDomain: _shopDomain, shopId, payload }) {
  const orderId = payload?.id || payload?.admin_graphql_api_id || null;
  const customerId = payload?.customer?.id || payload?.customer_id || null;
  if (!customerId) return;
  const contact = await prisma.contact.findFirst({
    where: { shopId, customerId: String(customerId), optedOut: false },
  });
  if (!contact) return;
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });

  // Cancel any pending abandoned job for this checkout (if Shopify provides link)
  const checkoutId = payload?.checkout_id || payload?.checkoutId || null;
  if (checkoutId) {
    await cancelAbandonedCheckoutJobs({ shopId, checkoutId: String(checkoutId) });
  }

  await renderGateQueueAndSend({
    shop,
    contact,
    phoneE164: contact.phoneE164,
    templateKey: 'order_created',
    vars: { order: { id: orderId } },
    triggerKey: 'order_created',
    dedupeKey: String(orderId || ''),
  });
}
