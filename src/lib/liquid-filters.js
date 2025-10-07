// src/lib/liquid-filters.js
// Custom Liquid filters for SMS Blossom

/**
 * Money filter - format currency values
 * @param {number|string} value - Amount to format
 * @param {string} currency - Currency code (default: USD)
 * @param {string} locale - Locale for formatting (default: en-US)
 * @returns {string} Formatted currency
 */
export function money(value, currency = 'USD', locale = 'en-US') {
  if (value === null || value === undefined) return '';

  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return '';

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(numValue);
  } catch {
    return `${currency} ${numValue.toFixed(2)}`;
  }
}

/**
 * Date filter - format dates with timezone awareness
 * @param {string|Date} value - Date to format
 * @param {string} format - Date format (default: 'short')
 * @param {string} timezone - Timezone (default: 'UTC')
 * @param {string} locale - Locale for formatting (default: en-US)
 * @returns {string} Formatted date
 */
export function date(value, format = 'short', timezone = 'UTC', locale = 'en-US') {
  if (!value) return '';

  let dateValue;
  if (typeof value === 'string') {
    dateValue = new Date(value);
  } else if (value instanceof Date) {
    dateValue = value;
  } else {
    return '';
  }

  if (isNaN(dateValue.getTime())) return '';

  try {
    const options = getDateOptions(format);
    return new Intl.DateTimeFormat(locale, {
      ...options,
      timeZone: timezone,
    }).format(dateValue);
  } catch {
    return dateValue.toISOString();
  }
}

/**
 * Shortlink filter - create short URLs
 * @param {string} url - URL to shorten
 * @param {string} campaignId - Campaign ID for tracking
 * @returns {string} Shortened URL
 */
export function shortlink(url, campaignId = null) {
  if (!url) return '';

  // In a real implementation, this would create a shortlink via the shortlink service
  // For now, return the original URL with UTM parameters
  const baseUrl = process.env.APP_URL || 'https://sms-blossom.com';
  const shortSlug = generateShortSlug();

  if (campaignId) {
    return `${baseUrl}/s/${shortSlug}?utm_campaign=${campaignId}`;
  }

  return `${baseUrl}/s/${shortSlug}`;
}

/**
 * Default filter - provide default value
 * @param {any} value - Value to check
 * @param {any} defaultValue - Default value
 * @returns {any} Value or default
 */
export function defaultFilter(value, defaultValue) {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }
  return value;
}

/**
 * Titlecase filter - convert to title case
 * @param {string} value - String to convert
 * @returns {string} Title case string
 */
export function titlecase(value) {
  if (!value || typeof value !== 'string') return '';

  return value.toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
}

/**
 * Truncate filter - truncate string to length
 * @param {string} value - String to truncate
 * @param {number} length - Maximum length
 * @param {string} suffix - Suffix to add (default: '...')
 * @returns {string} Truncated string
 */
export function truncate(value, length = 50, suffix = '...') {
  if (!value || typeof value !== 'string') return '';

  if (value.length <= length) return value;

  return value.substring(0, length - suffix.length) + suffix;
}

/**
 * Upper filter - convert to uppercase
 * @param {string} value - String to convert
 * @returns {string} Uppercase string
 */
export function upper(value) {
  if (!value || typeof value !== 'string') return '';
  return value.toUpperCase();
}

/**
 * Lower filter - convert to lowercase
 * @param {string} value - String to convert
 * @returns {string} Lowercase string
 */
export function lower(value) {
  if (!value || typeof value !== 'string') return '';
  return value.toLowerCase();
}

// Helper functions

/**
 * Get date formatting options based on format string
 * @param {string} format - Format string
 * @returns {Object} Intl.DateTimeFormat options
 */
function getDateOptions(format) {
  const formatMap = {
    short: { dateStyle: 'short' },
    long: { dateStyle: 'long' },
    time: { timeStyle: 'short' },
    datetime: { dateStyle: 'short', timeStyle: 'short' },
    iso: { dateStyle: 'short', timeStyle: 'short' },
  };

  return formatMap[format] || { dateStyle: 'short' };
}

/**
 * Generate a short slug for URLs
 * @returns {string} Short slug
 */
function generateShortSlug() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
