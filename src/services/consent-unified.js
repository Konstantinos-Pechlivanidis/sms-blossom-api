// src/services/consent-unified.js
// Unified consent service with Shopify integration and PCD safety

import { getPrismaClient } from '../db/prismaClient.js';
import { shopifyGraphql } from './shopify-graphql.js';
import { getOfflineToken } from './shop-secrets.js';
import { logAudit } from './audit.js';
import { renderGateQueueAndSend } from './messages.js';

const prisma = getPrismaClient();

const MUTATE_SMS = `
mutation customerSmsMarketingConsentUpdate($input: CustomerSmsMarketingConsentUpdateInput!) {
  customerSmsMarketingConsentUpdate(input: $input) {
    userErrors { field message }
    customer { id }
  }
}`;

export async function pushShopifySmsConsent({
  shopDomain,
  customerId,
  marketingState,
  marketingOptInLevel = 'SINGLE_OPT_IN',
  consentUpdatedAt,
}) {
  const accessToken = await getOfflineToken(shopDomain);
  const input = {
    customerId,
    smsMarketingConsent: {
      marketingState, // "SUBSCRIBED" | "UNSUBSCRIBED"
      marketingOptInLevel, // "SINGLE_OPT_IN" | "CONFIRMED_OPT_IN"
      ...(consentUpdatedAt ? { consentUpdatedAt } : {}),
    },
  };
  const data = await shopifyGraphql({
    shopDomain,
    accessToken,
    query: MUTATE_SMS,
    variables: { input },
  });
  const userErrors = data?.customerSmsMarketingConsentUpdate?.userErrors || [];
  if (userErrors.length) {
    const err = new Error('shopify_user_errors');
    err.details = userErrors;
    throw err;
  }
  return true;
}

/**
 * Update local contact consent atomically and optionally push to Shopify.
 * This function is safe if PCD is not approved (Shopify push may fail; we swallow or surface per caller).
 */
export async function updateLocalAndRemoteConsent({
  shop,
  contact, // Contact row (must belong to shop)
  nextState, // "opted_in" | "opted_out"
  source = 'manual',
  pushToShopify = true,
  now = new Date(),
  reqMeta = {},
}) {
  const before = {
    smsConsentState: contact.smsConsentState,
    optedOut: contact.optedOut,
    smsConsentAt: contact.smsConsentAt,
    unsubscribedAt: contact.unsubscribedAt,
  };

  // Local update first (never read protected fields)
  const updated = await prisma.contact.update({
    where: { id: contact.id },
    data: {
      smsConsentState: nextState,
      smsConsentSource: source,
      smsConsentAt: nextState === 'opted_in' ? now : contact.smsConsentAt,
      unsubscribedAt: nextState === 'opted_out' ? now : contact.unsubscribedAt,
      optedOut: nextState === 'opted_out',
    },
  });

  await logAudit({
    shopId: shop.id,
    actor: reqMeta.actor || 'system',
    action: `consent.update`,
    entity: 'contact',
    entityId: contact.id,
    ip: reqMeta.ip || null,
    ua: reqMeta.ua || null,
    diff: {
      before,
      after: { smsConsentState: updated.smsConsentState, optedOut: updated.optedOut },
    },
  });

  // Optional Shopify push (best-effort)
  if (pushToShopify && (contact.customerId || contact.customerIdShopify)) {
    const customerId = contact.customerId || contact.customerIdShopify;
    const marketingState = nextState === 'opted_in' ? 'SUBSCRIBED' : 'UNSUBSCRIBED';
    try {
      await pushShopifySmsConsent({
        shopDomain: shop.domain || shop.shopDomain,
        customerId,
        marketingState,
        marketingOptInLevel: 'SINGLE_OPT_IN',
        consentUpdatedAt: now.toISOString(),
      });
    } catch (e) {
      // If PCD blocks or userErrors, keep local state; surface info via logs or audits if needed
      await logAudit({
        shopId: shop.id,
        actor: 'system',
        action: 'consent.shopify_push_failed',
        entity: 'contact',
        entityId: contact.id,
        diff: { error: String(e?.message || e), details: e?.details || null },
      });
    }
  }

  // Sprint D: Welcome once (PCD-safe). Only when transitioning to opted_in and not welcomed before.
  try {
    if (nextState === 'opted_in' && !contact.welcomedAt) {
      const sent = await renderGateQueueAndSend({
        shop,
        contact: { ...contact, smsConsentState: 'opted_in', optedOut: false }, // ensure gate sees new state
        phoneE164: contact.phoneE164,
        templateKey: 'welcome',
        vars: {
          shop: { domain: shop.domain || shop.shopDomain, name: shop.name || 'Το κατάστημα' },
        },
        triggerKey: 'welcome',
        dedupeKey: contact.id,
      });
      if (sent?.sent) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: { welcomedAt: new Date() },
        });
      }
    }
  } catch {
    // swallow welcome errors
  }

  return updated;
}
