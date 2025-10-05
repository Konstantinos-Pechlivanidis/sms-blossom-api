// src/workers/runGDPRCustomerRedact.js
// GDPR customer redaction worker

import { redactCustomer } from '../services/gdpr.js';

export async function runGDPRCustomerRedact(job) {
  const p = job.payload || {};
  if (!p.shopId) return;
  await redactCustomer({
    shopId: p.shopId,
    customerId: p.customerId || null,
    email: p.email || null,
    phone: p.phone || null,
  });
}
