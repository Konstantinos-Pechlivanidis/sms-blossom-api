// src/services/shopify-products.js
// Shopify product resolver for inventory items

import { shopifyGraphql } from './shopify-graphql.js';
import { getOfflineToken } from './shop-secrets.js';

/**
 * Resolve product/variant metadata for a given numeric inventoryItemId.
 * Requires read_inventory (and optionally read_products) scopes.
 * Returns { variantId, variantTitle, productHandle, productTitle } or null.
 */
export async function resolveByInventoryItem({ shopDomain, inventoryItemNumericId }) {
  const id = `gid://shopify/InventoryItem/${inventoryItemNumericId}`;
  const accessToken = await getOfflineToken(shopDomain);
  const QUERY = `
    query($id: ID!) {
      inventoryItem(id: $id) {
        variant {
          id
          title
          product { handle title }
        }
      }
    }
  `;
  const data = await shopifyGraphql({
    shopDomain,
    accessToken,
    query: QUERY,
    variables: { id },
  });
  const variant = data?.inventoryItem?.variant;
  if (!variant) return null;
  return {
    variantId: variant.id,
    variantTitle: variant.title || null,
    productHandle: variant.product?.handle || null,
    productTitle: variant.product?.title || null,
  };
}
