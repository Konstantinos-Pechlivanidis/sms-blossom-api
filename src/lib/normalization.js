// src/lib/normalization.js
// Phone and email normalization utilities

/**
 * Normalize phone number to E.164 format
 * @param {string} phone - Raw phone number
 * @returns {string|null} - Normalized E.164 phone or null if invalid
 */
export function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // Handle different formats
  if (digits.length === 10 && digits.startsWith('3')) {
    // Greek mobile: 3XXXXXXXXX -> +30XXXXXXXXX
    return `+30${digits}`;
  }
  
  if (digits.length === 11 && digits.startsWith('30')) {
    // Greek with country code: 30XXXXXXXXX -> +30XXXXXXXXX
    return `+${digits}`;
  }
  
  if (digits.length >= 10 && digits.startsWith('+')) {
    // Already has + prefix
    return phone;
  }
  
  if (digits.length >= 10) {
    // Add + prefix
    return `+${digits}`;
  }
  
  return null;
}

/**
 * Normalize email address
 * @param {string} email - Raw email address
 * @returns {string|null} - Normalized email or null if invalid
 */
export function normalizeEmail(email) {
  if (!email || typeof email !== 'string') {
    return null;
  }

  const trimmed = email.trim().toLowerCase();
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return null;
  }
  
  return trimmed;
}

/**
 * Validate E.164 phone number format
 * @param {string} phoneE164 - E.164 phone number
 * @returns {boolean} - True if valid E.164 format
 */
export function isValidE164(phoneE164) {
  if (!phoneE164 || typeof phoneE164 !== 'string') {
    return false;
  }
  
  // E.164 format: +[country code][number], 7-15 digits total
  const e164Regex = /^\+[1-9]\d{6,14}$/;
  return e164Regex.test(phoneE164);
}

/**
 * Validate email format
 * @param {string} email - Email address
 * @returns {boolean} - True if valid email format
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}
