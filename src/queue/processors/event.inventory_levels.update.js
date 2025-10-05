// src/queue/processors/event.inventory_levels.update.js
// Inventory levels update processor for back-in-stock notifications

import { getPrismaClient } from '../../db/prismaClient.js';
import { resolveByInventoryItem } from '../../services/shopify-products.js';
import { notifyInterestsForInventory } from '../../services/back-in-stock.js';

const prisma = getPrismaClient();

export async function processInventoryLevelsUpdate({ shopDomain, shopId, payload }) {
  const invItemId = payload?.inventory_item_id || payload?.inventoryItemId || null;
  const available =
    typeof payload?.available === 'number'
      ? payload.available
      : (payload?.available_quantity ?? null);
  if (!invItemId || available == null) return;

  // We only care about restock events (from 0 → >0). If payload doesn't include previous qty, best-effort notify on >0
  // Optional: maintain last seen qty in DB to be precise (future improvement).
  const productMeta = await resolveByInventoryItem({
    shopDomain,
    inventoryItemNumericId: String(invItemId),
  }).catch(() => null);
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) return;

  await notifyInterestsForInventory({
    shop,
    shopDomain,
    inventoryItemNumericId: String(invItemId),
    available: Number(available),
    productMeta,
  });
}
