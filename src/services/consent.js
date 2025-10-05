// src/services/consent.js
// PCD-safe customer lookup + consent update.
// If PCD_APPROVED=true, we try to create customers with { email, phone }.
// If Shopify denies due to Protected Customer Data, we gracefully fall back to { email } only.

import { shopifyGraphql } from './shopify-graphql.js';
import { getOfflineToken } from './shop-secrets.js';

const QUERY_CUSTOMER_BY_PHONE = `
query FindCustomerByPhone($q: String!, $first: Int!) {
  customers(first: $first, query: $q) {
    nodes { id }
  }
}`;

const CREATE_CUSTOMER = `
mutation customerCreate($input: CustomerInput!) {
  customerCreate(input: $input) {
    customer { id }
    userErrors { field message }
  }
}`;

const MUTATE_SMS = `
mutation customerSmsMarketingConsentUpdate($input: CustomerSmsMarketingConsentUpdateInput!) {
  customerSmsMarketingConsentUpdate(input: $input) {
    userErrors { field message }
    customer {
      id
      smsMarketingConsent {
        marketingState
        marketingOptInLevel
        consentUpdatedAt
        consentCollectedFrom
      }
    }
  }
}`;

// Helper: detect Protected Customer Data denial
function isPCDAccessError(err) {
  const txt = JSON.stringify(err?.details || err?.message || err || '');
  return /Protected customer data|ACCESS_DENIED|phone field/i.test(txt);
}

/**
 * Find customer by phone (allowed via query string).
 * If not found and email provided:
 *  - before PCD approval: create with { email }
 *  - after  PCD approval: try { email, phone }, and if Shopify denies → fallback to { email }
 */
export async function ensureCustomerIdByPhone({ shopDomain, phoneE164, emailIfCreate }) {
  const accessToken = await getOfflineToken(shopDomain);

  // Search by phone (do not select `phone`)
  const q = `phone:${JSON.stringify(phoneE164)}`;
  const found = await shopifyGraphql({
    shopDomain,
    accessToken,
    query: QUERY_CUSTOMER_BY_PHONE,
    variables: { q, first: 1 },
  });
  const existing = found?.customers?.nodes?.[0];
  if (existing?.id) return existing.id;

  if (!emailIfCreate) return null;

  const pcdApproved = process.env.PCD_APPROVED === 'true';
  const primaryInput = pcdApproved
    ? { email: emailIfCreate, phone: phoneE164 }
    : { email: emailIfCreate };

  // Try create (with phone only if approved)
  try {
    const created = await shopifyGraphql({
      shopDomain,
      accessToken,
      query: CREATE_CUSTOMER,
      variables: { input: primaryInput },
    });
    return created?.customerCreate?.customer?.id || null;
  } catch (err) {
    // If phone was included and Shopify blocks it, fallback to email-only
    if (pcdApproved && isPCDAccessError(err)) {
      const created = await shopifyGraphql({
        shopDomain,
        accessToken,
        query: CREATE_CUSTOMER,
        variables: { input: { email: emailIfCreate } },
      });
      return created?.customerCreate?.customer?.id || null;
    }
    throw err;
  }
}

/**
 * Push SMS consent to Shopify. Caller should catch PCD denial and degrade gracefully.
 */
export async function updateSmsConsent({
  shopDomain,
  customerId,
  marketingState,
  marketingOptInLevel,
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

  return data?.customerSmsMarketingConsentUpdate?.customer || null;
}
