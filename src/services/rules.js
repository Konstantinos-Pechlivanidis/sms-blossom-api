// src/services/rules.js
// Production-grade rules engine for consent, quiet hours, frequency caps, and dedupe

import { getPrismaClient } from '../db/prismaClient.js';

const prisma = getPrismaClient();

/**
 * Default automations config per trigger.
 * All values are safe defaults and can be overridden via Admin /automations.
 */
export function defaultAutomationRules() {
  return {
    order_paid: {
      enabled: true,
      rules: {
        quietHours: { enabled: true, start: 22, end: 8, zone: null }, // local shop tz by default
        frequencyCap: { enabled: true, per: 'day', max: 2 },
        dedupeWindowMin: 120,
      },
    },
    order_created: {
      enabled: false,
      rules: {
        quietHours: { enabled: true, start: 22, end: 8, zone: null },
        frequencyCap: { enabled: true, per: 'day', max: 2 },
        dedupeWindowMin: 120,
      },
    },
    abandoned_checkout: {
      enabled: true,
      delayMinutes: 30,
      rules: {
        quietHours: { enabled: true, start: 22, end: 8, zone: null },
        frequencyCap: { enabled: true, per: 'day', max: 2 },
        dedupeWindowMin: 240,
      },
    },
    fulfillment_update: {
      enabled: true,
      rules: {
        quietHours: { enabled: false, start: 22, end: 8, zone: null },
        frequencyCap: { enabled: true, per: 'hour', max: 3 },
        dedupeWindowMin: 60,
      },
    },
    welcome: {
      enabled: true,
      rules: {
        quietHours: { enabled: false, start: 22, end: 8, zone: null },
        frequencyCap: { enabled: true, per: 'day', max: 1 },
        dedupeWindowMin: 1440,
      },
    },
    back_in_stock: {
      enabled: true,
      rules: {
        quietHours: { enabled: true, start: 9, end: 21, zone: null },
        frequencyCap: { enabled: true, per: 'day', max: 1 },
        dedupeWindowMin: 720,
      },
    },
  };
}

export function defaultSettings() {
  return { automations: defaultAutomationRules() };
}

export function getShopTimezone(shop) {
  return shop?.timezone || 'UTC';
}

export function hourInTz(date, tz) {
  return Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: tz }).format(date),
  );
}

/**
 * Quiet hours window: if start < end → [start, end), else wraps midnight.
 */
export function isQuietHours(now, { enabled, start, end, zone }, tzFallback) {
  if (!enabled) return false;
  const tz = zone || tzFallback || 'UTC';
  const h = hourInTz(now, tz);
  return start < end ? h >= start && h < end : h >= start || h < end;
}

/**
 * Count messages in a time window for caps & dedupe.
 */
async function countMessages({ shopId, contactId, triggerKey, since }) {
  return prisma.message.count({
    where: {
      shopId,
      contactId,
      triggerKey,
      createdAt: { gt: since },
    },
  });
}

function windowStart(now, per) {
  const d = new Date(now);
  if (per === 'hour') d.setHours(d.getHours() - 1);
  else if (per === 'day') d.setDate(d.getDate() - 1);
  else if (per === 'week') d.setDate(d.getDate() - 7);
  else d.setDate(d.getDate() - 1);
  return d;
}

/**
 * Dedupe: check recent messages for same triggerKey AND same dedupeKey in metadata within window.
 * We avoid JSON path filters for portability and filter in JS on a small sample.
 */
async function existsDedupe({ shopId, contactId, triggerKey, dedupeKey, since }) {
  const recent = await prisma.message.findMany({
    where: { shopId, contactId, triggerKey, createdAt: { gt: since } },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return recent.some((m) => (m.metadata && m.metadata.dedupeKey) === dedupeKey);
}

/**
 * Resolve effective rules for a trigger by merging defaults with shop.settingsJson.
 */
function mergeRules(shop, triggerKey) {
  const base = defaultAutomationRules();
  const cfg = (shop?.settingsJson && shop.settingsJson.automations) || {};
  const merged = { ...base[triggerKey], ...(cfg[triggerKey] || {}) };
  // ensure shape
  merged.rules = { ...base[triggerKey].rules, ...(merged.rules || {}) };
  return merged;
}

/**
 * Main guard.
 * Returns { allowed: boolean, reason?: string }
 */
export async function canSend({ shop, contact, triggerKey, dedupeKey = null, now = new Date() }) {
  // Consent gate (local only; do not read PCD)
  if (
    !contact ||
    contact.optedOut ||
    contact.smsConsentState === 'opted_out' ||
    contact.smsConsentState === 'unknown'
  ) {
    return { allowed: false, reason: 'no_consent' };
  }

  const rules = mergeRules(shop, triggerKey);
  if (!rules.enabled) return { allowed: false, reason: 'automation_disabled' };

  // Quiet hours
  const tz = getShopTimezone(shop);
  if (isQuietHours(now, rules.rules.quietHours, tz)) {
    return { allowed: false, reason: 'quiet_hours' };
  }

  // Frequency cap per trigger
  if (rules.rules.frequencyCap?.enabled) {
    const since = windowStart(now, rules.rules.frequencyCap.per || 'day');
    const count = await countMessages({
      shopId: shop.id,
      contactId: contact.id,
      triggerKey,
      since,
    });
    if (count >= (rules.rules.frequencyCap.max ?? 1)) {
      return { allowed: false, reason: 'frequency_capped' };
    }
  }

  // Dedupe per trigger/object
  if (dedupeKey && rules.rules.dedupeWindowMin) {
    const since = new Date(now.getTime() - rules.rules.dedupeWindowMin * 60 * 1000);
    const dup = await existsDedupe({
      shopId: shop.id,
      contactId: contact.id,
      triggerKey,
      dedupeKey,
      since,
    });
    if (dup) return { allowed: false, reason: 'deduped' };
  }

  return { allowed: true };
}
