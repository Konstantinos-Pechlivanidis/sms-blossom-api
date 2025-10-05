// src/services/discounts.js
// Production-ready Discounts service (Shopify Admin GraphQL 2025-10)
// - Defaults to customerSelection: { all: true } (fixes "Context can't be blank")
// - Optional segment targeting via `context.customerSegments.add`
// - Percentage normalization (10 -> 0.10)

import { shopifyGraphql } from './shopify-graphql.js';
import { getOfflineToken } from './shop-secrets.js';
import { getPrismaClient } from '../db/prismaClient.js';
import { appendUtm } from './utm.js';
import { createShortlink } from './shortlinks.js';

const prisma = getPrismaClient();

function normalizePercentage(v) {
  // Allow "10" or 10 => 0.10; if already 0.xx keep it
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error('invalid_percentage');
  return n > 1 ? n / 100 : n;
}

export function buildApplyUrl({ shopDomain, code, redirect = '/cart' }) {
  const safeCode = encodeURIComponent(String(code).trim());
  const safeRedirect = String(redirect || '/cart').startsWith('/') ? redirect : `/${redirect}`;
  return `https://${shopDomain}/discount/${safeCode}?redirect=${encodeURIComponent(safeRedirect)}`;
}

const MUTATION = `
mutation CreateDiscountCode($basicCodeDiscount: DiscountCodeBasicInput!) {
  discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
    codeDiscountNode {
      id
      codeDiscount {
        __typename
        ... on DiscountCodeBasic {
          title
          startsAt
          endsAt
          codes(first: 10) { nodes { code } }
        }
      }
    }
    userErrors { field message }
  }
}`;

/**
 * Create a basic code discount.
 *
 * @param {Object} params
 * @param {string} params.shopDomain - <store>.myshopify.com
 * @param {string} params.code
 * @param {string} [params.title]
 * @param {'percentage'|'amount'} params.kind
 * @param {number|string} params.value - percentage accepts 10 or 0.10; amount accepts number/string
 * @param {string} [params.currencyCode] - required when kind='amount'
 * @param {string} [params.startsAt] - ISO string
 * @param {string|null} [params.endsAt] - ISO string or null
 * @param {boolean} [params.appliesOncePerCustomer=true]
 * @param {number|null} [params.usageLimit=null]
 * @param {{all?: boolean, customers?: string[]}} [params.customerSelection] - optional; defaults to { all: true }
 * @param {string[]} [params.segments] - optional list of Segment GIDs; if provided, we use context.customerSegments.add
 */
export async function createBasicCodeDiscount({
  shopDomain,
  code,
  title,
  kind, // 'percentage' | 'amount'
  value, // number; percentage accepts 10 or 0.10; amount expects a money value string/number
  currencyCode, // required for amount
  startsAt, // ISO string
  endsAt, // ISO or null
  appliesOncePerCustomer = true,
  usageLimit = null,
  customerSelection,
  segments,
}) {
  const accessToken = await getOfflineToken(shopDomain);

  // Customer gets (percentage or amount)
  let customerGets;
  if (kind === 'percentage') {
    customerGets = { value: { percentage: normalizePercentage(value) }, items: { all: true } };
  } else if (kind === 'amount') {
    if (!currencyCode) throw new Error('currency_required_for_amount');
    const amountStr = typeof value === 'number' ? value.toFixed(2) : String(value);
    customerGets = {
      value: {
        discountAmount: {
          amount: { amount: amountStr, currencyCode },
          appliesOnEachItem: false,
        },
      },
      items: { all: true },
    };
  } else {
    throw new Error('invalid_kind');
  }

  // Either provide context (segments) OR customerSelection
  // If segments present, use context.customerSegments.add
  // Else default to customerSelection: { all: true }
  const hasSegments = Array.isArray(segments) && segments.length > 0;

  const input = {
    title: title || code,
    code,
    startsAt: startsAt || new Date().toISOString(),
    endsAt: endsAt ?? null,
    appliesOncePerCustomer,
    usageLimit: usageLimit ?? null,
    customerGets,
    ...(hasSegments
      ? { context: { customerSegments: { add: segments } } }
      : { customerSelection: customerSelection || { all: true } }),
    // You can add minimumRequirement/combinesWith later as needed.
  };

  const data = await shopifyGraphql({
    shopDomain,
    accessToken,
    query: MUTATION,
    variables: { basicCodeDiscount: input },
  });

  const node = data?.discountCodeBasicCreate?.codeDiscountNode;
  const errs = data?.discountCodeBasicCreate?.userErrors || [];
  if (errs.length) {
    const e = new Error('discount_user_errors');
    e.details = errs;
    throw e;
  }

  // Extract the actual code returned (Shopify may normalize casing)
  const codes = node?.codeDiscount?.codes?.nodes || [];
  const codeOut = codes[0]?.code || code;

  // Persist to DB (upsert)
  const shopRow = await prisma.shop.findFirst({ where: { domain: shopDomain } });
  if (shopRow) {
    await prisma.discount.upsert({
      where: { shopId_code: { shopId: shopRow.id, code: codeOut } },
      create: {
        shopId: shopRow.id,
        code: codeOut,
        title: node?.codeDiscount?.title || title || code,
        startsAt: node?.codeDiscount?.startsAt ? new Date(node?.codeDiscount?.startsAt) : null,
        endsAt: node?.codeDiscount?.endsAt ? new Date(node?.codeDiscount?.endsAt) : null,
      },
      update: {
        title: node?.codeDiscount?.title || title || code,
        startsAt: node?.codeDiscount?.startsAt ? new Date(node?.codeDiscount?.startsAt) : null,
        endsAt: node?.codeDiscount?.endsAt ? new Date(node?.codeDiscount?.endsAt) : null,
      },
    });
  }

  return {
    id: node?.id || null,
    code: codeOut,
    title: node?.codeDiscount?.title || title || code,
    startsAt: node?.codeDiscount?.startsAt,
    endsAt: node?.codeDiscount?.endsAt,
  };
}

/**
 * Build campaign-friendly URL: add utm and optional shortlink.
 */
export async function buildCampaignApplyUrl({
  shopId = null,
  shopDomain,
  code,
  redirect = '/cart',
  utm = {},
  short = !!process.env.SHORTLINKS_ENABLED,
  campaignId = null,
}) {
  let url = buildApplyUrl({ shopDomain, code, redirect });
  url = appendUtm(url, {
    ...utm,
    utm_campaign: utm?.utm_campaign || (campaignId ? String(campaignId) : undefined),
  });
  if (!short) return { url, short: null };
  const s = await createShortlink({ shopId, url, campaignId }).catch(() => null);
  return { url: s?.url || url, short: s?.slug || null };
}

/**
 * Best-effort conflict scan: returns active Automatic discounts that might not combine.
 * Uses discountNodes (graphql) and surfaces __typename + combinesWith flags.
 */
export async function scanAutomaticDiscountConflicts({ shopDomain }) {
  const accessToken = await getOfflineToken(shopDomain);
  const QUERY = `
    query DiscountConflicts {
      discountNodes(first: 50, query: "status:active") {
        nodes {
          id
          discount {
            __typename
            ... on DiscountAutomaticBasic {
              title
              status
              startsAt
              endsAt
              combinesWith { orderDiscounts productDiscounts shippingDiscounts }
            }
            ... on DiscountAutomaticBxgy {
              title
              status
              startsAt
              endsAt
              combinesWith { orderDiscounts productDiscounts shippingDiscounts }
            }
          }
        }
      }
    }
  `;
  const data = await shopifyGraphql({
    shopDomain,
    accessToken,
    query: QUERY,
    variables: {},
  }).catch(() => null);
  const nodes = data?.discountNodes?.nodes || [];
  const autos = nodes
    .map((n) => ({
      id: n.id,
      type: n.discount?.__typename,
      title: n.discount?.title,
      combinesWith: n.discount?.combinesWith,
    }))
    .filter((x) => x.type && x.type.startsWith('DiscountAutomatic'));
  return autos;
}
