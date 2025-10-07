// src/config/env.js
// Environment configuration with legacy aliasing

/**
 * Get webhook HMAC secret with legacy alias support
 * @returns {string} The webhook HMAC secret
 * @throws {Error} If neither WEBHOOK_HMAC_SECRET nor WEBHOOK_SECRET is set
 */
export function getWebhookHmacSecret() {
  // Prefer canonical name
  const canonical = process.env.WEBHOOK_HMAC_SECRET;
  if (canonical) {
    return canonical;
  }

  // Fall back to legacy name
  const legacy = process.env.WEBHOOK_SECRET;
  if (legacy) {
    console.warn('Using legacy WEBHOOK_SECRET environment variable. Please migrate to WEBHOOK_HMAC_SECRET.');
    return legacy;
  }

  // Neither is set
  throw new Error('WEBHOOK_HMAC_SECRET environment variable is required (or legacy WEBHOOK_SECRET)');
}

/**
 * Get Redis URL with fallback
 * @returns {string} The Redis URL
 */
export function getRedisUrl() {
  return process.env.REDIS_URL || 'redis://localhost:6379';
}

/**
 * Get Mitto API key
 * @returns {string} The Mitto API key
 */
export function getMittoApiKey() {
  const key = process.env.MITTO_API_KEY;
  if (!key) {
    throw new Error('MITTO_API_KEY environment variable is required');
  }
  return key;
}

/**
 * Get Mitto API URL
 * @returns {string} The Mitto API URL
 */
export function getMittoApiUrl() {
  return process.env.MITTO_API_URL || 'https://api.mitto.com';
}

/**
 * Get Mitto callback URL
 * @returns {string} The Mitto callback URL
 */
export function getMittoCallbackUrl() {
  return process.env.MITTO_CALLBACK_URL || process.env.APP_URL + '/webhooks/mitto';
}

/**
 * Get Mitto HMAC secret
 * @returns {string} The Mitto HMAC secret
 */
export function getMittoHmacSecret() {
  const secret = process.env.MITTO_HMAC_SECRET;
  if (!secret) {
    throw new Error('MITTO_HMAC_SECRET environment variable is required');
  }
  return secret;
}

/**
 * Get JWT secret
 * @returns {string} The JWT secret
 */
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
}

/**
 * Get encryption key
 * @returns {string} The encryption key
 */
export function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }
  return key;
}

/**
 * Get hash pepper
 * @returns {string} The hash pepper
 */
export function getHashPepper() {
  const pepper = process.env.HASH_PEPPER;
  if (!pepper) {
    throw new Error('HASH_PEPPER environment variable is required');
  }
  return pepper;
}
