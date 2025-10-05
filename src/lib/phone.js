// Simple E.164 normalization stub: assumes US if 10 digits; else pass-through.
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function toE164(maybePhone, defaultCountry = 'US') {
  if (!maybePhone) return null;
  const digits = String(maybePhone).replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10 && defaultCountry === 'US') return `+1${digits}`;
  if (digits.startsWith('+')) return digits;
  return `+${digits}`;
}

export function toE164Loose(input, defaultRegion = 'GR') {
  if (!input) return null;
  const raw = String(input).trim();
  if (raw.startsWith('+')) {
    const pn = parsePhoneNumberFromString(raw);
    return pn && pn.isValid() ? pn.number : null;
  }
  const digits = raw.replace(/\D+/g, '');
  if (digits.startsWith('00')) {
    const pn = parsePhoneNumberFromString('+' + digits.slice(2));
    return pn && pn.isValid() ? pn.number : null;
  }
  if (digits.length === 10) {
    const pn = parsePhoneNumberFromString('+30' + digits);
    return pn && pn.isValid() ? pn.number : null;
  }
  if (digits.startsWith('30')) {
    const pn = parsePhoneNumberFromString('+' + digits);
    return pn && pn.isValid() ? pn.number : null;
  }
  const pn = parsePhoneNumberFromString(digits, defaultRegion);
  return pn && pn.isValid() ? pn.number : null;
}
