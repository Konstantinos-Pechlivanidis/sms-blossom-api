// src/workers/runGDPRShopRedact.js
// GDPR shop redaction worker

import { purgeShop } from '../services/gdpr.js';

export async function runGDPRShopRedact(job) {
  const p = job.payload || {};
  if (!p.shopId) return;
  await purgeShop({ shopId: p.shopId });
}
