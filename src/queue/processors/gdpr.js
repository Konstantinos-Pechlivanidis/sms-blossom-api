// src/queue/processors/gdpr.js
// GDPR webhook processors

import {
  handleCustomerDataRequest,
  handleCustomerRedact,
  handleShopRedact,
} from '../../services/gdpr.js';

export async function processGdprDataRequest({ shopDomain: _shopDomain, shopId, payload }) {
  await handleCustomerDataRequest({ shopId, payload });
}

export async function processGdprCustomerRedact({ shopDomain: _shopDomain, shopId, payload }) {
  await handleCustomerRedact({ shopId, payload });
}

export async function processGdprShopRedact({ shopDomain: _shopDomain, shopId, payload }) {
  await handleShopRedact({ shopId, payload });
}
