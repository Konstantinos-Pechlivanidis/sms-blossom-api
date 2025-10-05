// src/services/segment-dsl.js
// Minimal, safe DSL → Prisma.where translator for Contact

/**
 * Minimal, safe DSL → Prisma.where translator for Contact.
 * Supported:
 *  { consent: 'opted_in'|'opted_out'|'unknown' }
 *  { tag: 'vip' } or { tags: { has: 'vip' } }  (expects Contact.tagsJson = string[])
 *  { locale: 'el' } / { locale: { in: ['el','en'] } }
 *  { not: {...} }, { and:[...]} , { or:[...] }
 */
export function dslToWhere(dsl) {
  if (!dsl || typeof dsl !== 'object') return {};
  if (Array.isArray(dsl)) return { AND: dsl.map(dslToWhere) };

  const out = {};
  const AND = [];
  const OR = [];

  for (const [k, v] of Object.entries(dsl)) {
    if (k === 'and' && Array.isArray(v)) AND.push(...v.map(dslToWhere));
    else if (k === 'or' && Array.isArray(v)) OR.push(...v.map(dslToWhere));
    else if (k === 'not' && typeof v === 'object') AND.push({ NOT: dslToWhere(v) });
    else if (k === 'consent') {
      AND.push({ smsConsentState: String(v) });
    } else if (k === 'tag') {
      AND.push({ tagsJson: { array_contains: [String(v)] } });
    } else if (k === 'tags' && v && typeof v === 'object' && v.has) {
      AND.push({ tagsJson: { array_contains: [String(v.has)] } });
    } else if (k === 'locale') {
      if (typeof v === 'object' && Array.isArray(v.in)) AND.push({ locale: { in: v.in } });
      else AND.push({ locale: String(v) });
    } else if (k === 'optedOut') {
      AND.push({ optedOut: !!v });
    } else if (k === 'phoneStartsWith') {
      AND.push({ phoneE164: { startsWith: String(v) } });
    }
  }

  if (AND.length) out.AND = AND;
  if (OR.length) out.OR = OR;
  return out;
}
