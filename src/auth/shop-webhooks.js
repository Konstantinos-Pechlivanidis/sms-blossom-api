// src/auth/shop-webhooks.js
import { shopifyGraphql as gql } from '../services/shopify-graphql.js';

const TOPICS = [
  'ORDERS_CREATE',
  'ORDERS_PAID',
  'ORDERS_FULFILLED',
  'FULFILLMENTS_CREATE',
  'FULFILLMENTS_UPDATE',
  'CHECKOUTS_CREATE',
  'CHECKOUTS_UPDATE',
  'CUSTOMERS_CREATE',
  'CUSTOMERS_UPDATE',
  'INVENTORY_LEVELS_UPDATE',
  'CUSTOMERS_MARKETING_CONSENT_UPDATE',
  'APP_UNINSTALLED',
  // Sprint A: GDPR mandatory
  'CUSTOMERS_DATA_REQUEST',
  'CUSTOMERS_REDACT',
  'SHOP_REDACT',
];

// Use one shared endpoint that reads the topic from the `X-Shopify-Topic` header
const useSingleEndpoint = true;

function topicToPath(topicEnum) {
  // If you ever want per-topic paths: "ORDERS_CREATE" -> "orders/create"
  return topicEnum.toLowerCase().replace(/_/g, '/');
}

function callbackUrlFor(topic) {
  const base = String(process.env.APP_URL || '').replace(/\/$/, '');
  // Route GDPR topics to GDPR handler
  if (
    topic.startsWith('CUSTOMERS_') &&
    (topic.includes('DATA_REQUEST') || topic.includes('REDACT'))
  ) {
    return `${base}/webhooks/gdpr/${topicToPath(topic)}`;
  }
  if (topic === 'SHOP_REDACT') {
    return `${base}/webhooks/gdpr/shop/redact`;
  }
  return useSingleEndpoint
    ? `${base}/webhooks/shopify`
    : `${base}/webhooks/shopify/${topicToPath(topic)}`;
}

const Q_LIST = `
  query ListWebhooks($first: Int!, $topics: [WebhookSubscriptionTopic!]) {
    webhookSubscriptions(first: $first, topics: $topics) {
      edges { node { id topic callbackUrl } }
    }
  }
`;

const M_CREATE = `
  mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
    webhookSubscriptionCreate(
      topic: $topic,
      webhookSubscription: { callbackUrl: $callbackUrl, format: JSON }
    ) {
      webhookSubscription { id topic callbackUrl }
      userErrors { field message }
    }
  }
`;

const M_UPDATE = `
  mutation UpdateWebhook($id: ID!, $callbackUrl: URL!) {
    webhookSubscriptionUpdate(
      id: $id,
      webhookSubscription: { callbackUrl: $callbackUrl, format: JSON }
    ) {
      webhookSubscription { id topic callbackUrl }
      userErrors { field message }
    }
  }
`;

export async function registerWebhooks({ shopDomain, accessToken }) {
  for (const topic of TOPICS) {
    const callbackUrl = callbackUrlFor(topic);

    // 1) list existing subscriptions for this topic
    const list = await gql({
      shopDomain,
      accessToken,
      query: Q_LIST,
      variables: { first: 50, topics: [topic] },
    });

    const edges = list?.webhookSubscriptions?.edges ?? [];
    const same = edges.find((e) => e.node.callbackUrl === callbackUrl);

    if (same) {
      // already pointing to our URL → skip
      continue;
    }

    if (edges.length > 0) {
      // update the first existing to our current URL
      const id = edges[0].node.id;
      const upd = await gql({
        shopDomain,
        accessToken,
        query: M_UPDATE,
        variables: { id, callbackUrl },
      });
      const ue = upd?.webhookSubscriptionUpdate?.userErrors || [];
      if (ue.length) throw Object.assign(new Error('webhook_update_error'), { details: ue });
      continue;
    }

    // none exist → create
    const crt = await gql({
      shopDomain,
      accessToken,
      query: M_CREATE,
      variables: { topic, callbackUrl },
    });
    const ue = crt?.webhookSubscriptionCreate?.userErrors || [];
    if (ue.length) {
      // If Shopify races/complains "Address for this topic has already been taken" just ignore
      const msg = ue.map((u) => u.message).join('; ');
      if (!/already been taken/i.test(msg)) {
        throw Object.assign(new Error('webhook_create_error'), { details: ue });
      }
    }
  }
}
