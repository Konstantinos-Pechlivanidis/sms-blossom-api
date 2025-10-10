// src/lib/age-utils.js
// Age derivation utilities

import { logger } from './logger.js';

/**
 * Derive age in years from birthdate
 * @param {Date|string} birthdate - Birthdate
 * @returns {number|null} Age in years, or null if invalid
 */
export function deriveAgeYears(birthdate) {
  if (!birthdate) return null;

  try {
    const birth = new Date(birthdate);
    const now = new Date();
    
    // Check if birthdate is valid
    if (isNaN(birth.getTime())) {
      logger.warn({ birthdate }, 'Invalid birthdate provided');
      return null;
    }

    // Check if birthdate is in the future
    if (birth > now) {
      logger.warn({ birthdate }, 'Birthdate is in the future');
      return null;
    }

    // Check if birthdate is too old (over 150 years)
    const maxAge = 150;
    const minBirthYear = now.getFullYear() - maxAge;
    if (birth.getFullYear() < minBirthYear) {
      logger.warn({ birthdate, maxAge }, 'Birthdate is too old');
      return null;
    }

    // Calculate age
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
      age--;
    }

    // Ensure age is reasonable
    if (age < 0 || age > maxAge) {
      logger.warn({ birthdate, age, maxAge }, 'Calculated age is out of reasonable range');
      return null;
    }

    return age;
  } catch (error) {
    logger.error({ error: error.message, birthdate }, 'Failed to derive age from birthdate');
    return null;
  }
}

/**
 * Normalize gender string to enum value
 * @param {string} genderStr - Gender string from metafields
 * @returns {string} Normalized gender: 'male', 'female', or 'unknown'
 */
export function normalizeGender(genderStr) {
  if (!genderStr || typeof genderStr !== 'string') {
    return 'unknown';
  }

  const normalized = genderStr.toLowerCase().trim();
  
  // Handle common variations
  if (normalized === 'm' || normalized === 'male' || normalized === 'man') {
    return 'male';
  }
  
  if (normalized === 'f' || normalized === 'female' || normalized === 'woman') {
    return 'female';
  }

  return 'unknown';
}

/**
 * Parse birthdate from various formats
 * @param {string} birthdateStr - Birthdate string
 * @returns {Date|null} Parsed date or null if invalid
 */
export function parseBirthdate(birthdateStr) {
  if (!birthdateStr || typeof birthdateStr !== 'string') {
    return null;
  }

  try {
    // Try ISO format first
    const isoDate = new Date(birthdateStr);
    if (!isNaN(isoDate.getTime())) {
      return isoDate;
    }

    // Try common formats
    const formats = [
      /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
      /^(\d{2})\/(\d{2})\/(\d{4})$/, // MM/DD/YYYY
      /^(\d{2})-(\d{2})-(\d{4})$/, // MM-DD-YYYY
      /^(\d{4})\/(\d{2})\/(\d{2})$/, // YYYY/MM/DD
    ];

    for (const format of formats) {
      const match = birthdateStr.match(format);
      if (match) {
        let year, month, day;
        
        if (format === formats[0] || format === formats[3]) {
          // YYYY-MM-DD or YYYY/MM/DD
          [, year, month, day] = match;
        } else {
          // MM/DD/YYYY or MM-DD-YYYY
          [, month, day, year] = match;
        }

        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    logger.warn({ birthdateStr }, 'Could not parse birthdate format');
    return null;
  } catch (error) {
    logger.error({ error: error.message, birthdateStr }, 'Failed to parse birthdate');
    return null;
  }
}
