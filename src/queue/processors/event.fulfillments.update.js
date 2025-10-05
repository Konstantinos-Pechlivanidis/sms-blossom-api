// src/queue/processors/event.fulfillments.update.js
// Fulfillment update processor with rules engine

import { getPrismaClient } from '../../db/prismaClient.js';
import { renderGateQueueAndSend } from '../../services/messages.js';

const prisma = getPrismaClient();

export async function processFulfillmentsUpdate({ shopDomain: _shopDomain, shopId, payload }) {
  const orderGid = payload?.order_id || payload?.order?.id || payload?.order?.admin_graphql_api_id;
  const customerId = payload?.order?.customer?.id || payload?.order?.customer_id || null;
  if (!customerId) return;
  const contact = await prisma.contact.findFirst({
    where: { shopId, customerId: String(customerId), optedOut: false },
  });
  if (!contact) return;
  const trackingNumber = payload?.tracking_number || payload?.tracking_numbers?.[0] || '';
  const trackingUrl =
    payload?.tracking_url ||
    payload?.tracking_urls?.[0] ||
    (trackingNumber
      ? `https://www.google.com/search?q=${encodeURIComponent(trackingNumber)}`
      : null);
  const eta = payload?.estimated_delivery_at || payload?.estimated_delivery_at_ms || null;
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  await renderGateQueueAndSend({
    shop,
    contact,
    phoneE164: contact.phoneE164,
    templateKey: 'fulfillment_update',
    vars: {
      order: { id: orderGid },
      tracking: { number: trackingNumber, url: trackingUrl },
      fulfillment: { eta },
    },
    triggerKey: 'fulfillment_update',
    dedupeKey: String(orderGid || '') + ':' + String(trackingNumber || ''),
  });
}
