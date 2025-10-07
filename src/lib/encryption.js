// src/lib/encryption.js
// PII encryption utilities for phone numbers and email addresses

import crypto from 'node:crypto';
import { logger } from './logger.js';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const HASH_PEPPER = process.env.HASH_PEPPER;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 44) {
  throw new Error('ENCRYPTION_KEY must be 32 bytes base64 encoded (44 characters)');
}

if (!HASH_PEPPER || HASH_PEPPER.length < 16) {
  throw new Error('HASH_PEPPER must be at least 16 characters');
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const TAG_LENGTH = 16; // 128 bits

/**
 * Encrypt sensitive text using AES-256-GCM
 * @param {string} text - Plain text to encrypt
 * @returns {object} - {ciphertext, iv, tag} as base64 strings
 */
export function encrypt(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text to encrypt must be a non-empty string');
  }

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipher(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'base64'));
    cipher.setAAD(Buffer.from('sms-blossom-pii', 'utf8')); // Additional authenticated data

    let ciphertext = cipher.update(text, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

    const tag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
    };
  } catch (error) {
    logger.error({ error }, 'Encryption failed');
    throw new Error('Encryption failed');
  }
}

/**
 * Decrypt sensitive text using AES-256-GCM
 * @param {object} encrypted - {ciphertext, iv, tag} as base64 strings
 * @returns {string} - Decrypted plain text
 */
export function decrypt(encrypted) {
  if (!encrypted || !encrypted.ciphertext || !encrypted.iv || !encrypted.tag) {
    throw new Error('Invalid encrypted data structure');
  }

  try {
    const decipher = crypto.createDecipher(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'base64'));
    decipher.setAAD(Buffer.from('sms-blossom-pii', 'utf8'));
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));

    let decrypted = decipher.update(encrypted.ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    logger.error({ error }, 'Decryption failed');
    throw new Error('Decryption failed');
  }
}

/**
 * Generate deterministic hash for lookup purposes
 * @param {string} text - Text to hash
 * @param {string} pepper - Hash pepper for additional security
 * @returns {string} - SHA-256 hash as hex string
 */
export function hashDeterministic(text, pepper = HASH_PEPPER) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text to hash must be a non-empty string');
  }

  const normalized = text.toLowerCase().trim();
  const combined = `${normalized}:${pepper}`;
  return crypto.createHash('sha256').update(combined).digest('hex');
}

/**
 * Extract last 4 digits from phone number for UX/debugging
 * @param {string} phoneE164 - E.164 phone number
 * @returns {string} - Last 4 digits
 */
export function extractLast4(phoneE164) {
  if (!phoneE164 || typeof phoneE164 !== 'string') {
    return '';
  }

  const digits = phoneE164.replace(/\D/g, '');
  return digits.slice(-4);
}

/**
 * Encrypt and hash PII data for storage
 * @param {string} phoneE164 - E.164 phone number
 * @param {string} email - Email address (optional)
 * @returns {object} - Encrypted data structure
 */
export function encryptPII(phoneE164, email = null) {
  const result = {
    phone_hash: hashDeterministic(phoneE164),
    phone_ciphertext: encrypt(phoneE164),
    phone_last4: extractLast4(phoneE164),
  };

  if (email) {
    result.email_hash = hashDeterministic(email);
    result.email_ciphertext = encrypt(email);
  }

  return result;
}

/**
 * Decrypt PII data from storage
 * @param {object} encryptedData - Encrypted data structure
 * @returns {object} - Decrypted PII data
 */
export function decryptPII(encryptedData) {
  const result = {};

  if (encryptedData.phone_ciphertext) {
    result.phoneE164 = decrypt(encryptedData.phone_ciphertext);
  }

  if (encryptedData.email_ciphertext) {
    result.email = decrypt(encryptedData.email_ciphertext);
  }

  return result;
}
