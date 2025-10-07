import { getPrismaClient } from '../db/prismaClient.js';
import { encryptPII, decryptPII } from '../lib/encryption.js';
import { normalizePhone, normalizeEmail } from '../lib/normalization.js';

export async function upsertContact({ shopId, phoneE164, data }) {
  const prisma = getPrismaClient();
  return prisma.contact.upsert({
    where: { shopId_phoneE164: { shopId, phoneE164 } },
    update: data,
    create: { shopId, phoneE164, ...data },
  });
}

export async function upsertContactByPhone({
  shopId,
  phoneE164,
  customerId,
  state,
  source: _source,
  email = null,
}) {
  const prisma = getPrismaClient();

  // Normalize and encrypt PII data
  const normalizedPhone = normalizePhone(phoneE164);
  const normalizedEmail = email ? normalizeEmail(email) : null;

  if (!normalizedPhone) {
    throw new Error('Invalid phone number format');
  }

  const encryptedData = encryptPII(normalizedPhone, normalizedEmail);

  return prisma.contact.upsert({
    where: { shopId_phoneE164: { shopId, phoneE164 } },
    create: {
      shopId,
      phoneE164, // Keep for backward compatibility during transition
      ...encryptedData,
      // Map to existing schema fields: optedOut boolean
      optedOut: state !== 'SUBSCRIBED',
      customerId: customerId || null,
    },
    update: {
      ...encryptedData,
      optedOut: state !== 'SUBSCRIBED',
      customerId: customerId || undefined,
    },
  });
}

export async function findShopByDomain(shopDomain) {
  const prisma = getPrismaClient();
  return prisma.shop.findUnique({ where: { domain: shopDomain } });
}

/**
 * Find contact by phone hash (encrypted lookup)
 * @param {string} shopId - Shop ID
 * @param {string} phoneE164 - E.164 phone number
 * @returns {object|null} - Contact or null
 */
export async function findContactByPhoneHash(shopId, phoneE164) {
  const prisma = getPrismaClient();
  const normalizedPhone = normalizePhone(phoneE164);

  if (!normalizedPhone) {
    return null;
  }

  // Generate hash for lookup
  const phoneHash = require('../lib/encryption.js').hashDeterministic(normalizedPhone);

  return prisma.contact.findFirst({
    where: {
      shopId,
      phone_hash: phoneHash,
    },
  });
}

/**
 * Decrypt contact PII data
 * @param {object} contact - Contact with encrypted fields
 * @returns {object} - Contact with decrypted PII
 */
export function decryptContactPII(contact) {
  if (!contact) return contact;

  const decrypted = {
    ...contact,
  };

  try {
    if (contact.phone_ciphertext) {
      const phoneData = decryptPII({ phone_ciphertext: contact.phone_ciphertext });
      decrypted.phoneE164 = phoneData.phoneE164;
    }

    if (contact.email_ciphertext) {
      const emailData = decryptPII({ email_ciphertext: contact.email_ciphertext });
      decrypted.email = emailData.email;
    }
  } catch (error) {
    // Log error but don't fail - return contact with encrypted data
    console.warn('Failed to decrypt contact PII:', error.message);
  }

  return decrypted;
}
