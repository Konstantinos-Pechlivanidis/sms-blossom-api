// src/services/back-in-stock.js
// Back-in-stock interest collection and notification service

import { getPrismaClient } from '../db/prismaClient.js';
import { resolveByInventoryItem } from './shopify-products.js';
import { renderGateQueueAndSend } from './messages.js';

const prisma = getPrismaClient();

/**
 * Store/refresh customer's interest for an InventoryItem.
 */
export async function upsertInterest({ shop, contact, inventoryItemId, productMeta }) {
  const data = {
    shopId: shop.id,
    contactId: contact.id,
    inventoryItemId: String(inventoryItemId),
    ...(productMeta?.variantId ? { variantId: productMeta.variantId } : {}),
    ...(productMeta?.productHandle ? { productHandle: productMeta.productHandle } : {}),
  };
  const existing = await prisma.backInStockInterest.findFirst({
    where: {
      shopId: shop.id,
      contactId: contact.id,
      inventoryItemId: String(inventoryItemId),
    },
  });
  if (existing) {
    await prisma.backInStockInterest.update({ where: { id: existing.id }, data });
    return existing.id;
  }
  const row = await prisma.backInStockInterest.create({ data });
  return row.id;
}

/**
 * When inventory goes 0 -> >0, notify all interested opted-in contacts once (per restock).
 */
export async function notifyInterestsForInventory({
  shop,
  shopDomain,
  inventoryItemNumericId,
  available,
  productMeta,
}) {
  if (!available || available <= 0) return 0;
  const interests = await prisma.backInStockInterest.findMany({
    where: { shopId: shop.id, inventoryItemId: String(inventoryItemNumericId) },
  });
  let sent = 0;
  for (const bi of interests) {
    const contact = await prisma.contact.findUnique({ where: { id: bi.contactId } });
    if (!contact || contact.optedOut || contact.smsConsentState !== 'opted_in') continue;

    // Ensure product meta
    let meta = productMeta;
    if (!meta || !meta.productHandle) {
      meta = await resolveByInventoryItem({
        shopDomain,
        inventoryItemNumericId,
      }).catch(() => null);
    }

    // Build product URL (no PCD)
    const productUrl = meta?.productHandle
      ? `https://${shopDomain}/products/${meta.productHandle}`
      : `https://${shopDomain}`;
    const vars = {
      product: {
        title: meta?.productTitle || 'Το προϊόν',
        url: productUrl,
      },
      variant: {
        id: meta?.variantId || null,
        title: meta?.variantTitle || null,
      },
    };

    const result = await renderGateQueueAndSend({
      shop,
      contact,
      phoneE164: contact.phoneE164,
      templateKey: 'back_in_stock',
      vars,
      triggerKey: 'back_in_stock',
      dedupeKey: String(inventoryItemNumericId),
    });

    if (result.sent) {
      sent++;
      await prisma.backInStockInterest.update({
        where: { id: bi.id },
        data: { lastNotifiedAt: new Date() },
      });
    }
  }
  return sent;
}
