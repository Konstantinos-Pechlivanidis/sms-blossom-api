// tests/pii-encryption.test.js
// Tests for PII encryption functionality

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { encrypt, decrypt, hashDeterministic, encryptPII, decryptPII, extractLast4 } from '../src/lib/encryption.js';
import { normalizePhone, normalizeEmail } from '../src/lib/normalization.js';

// Mock environment variables
vi.mock('process', () => ({
  env: {
    ENCRYPTION_KEY: 'a'.repeat(44), // 32 bytes base64
    HASH_PEPPER: 'test-pepper-123'
  }
}));

// Mock logger
vi.mock('../src/lib/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('PII Encryption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt text successfully', () => {
      const originalText = '+306912345678';
      const encrypted = encrypt(originalText);
      
      expect(encrypted).toHaveProperty('ciphertext');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('tag');
      expect(encrypted.ciphertext).not.toBe(originalText);
      
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(originalText);
    });

    it('should handle different phone number formats', () => {
      const phoneNumbers = [
        '+306912345678',
        '306912345678',
        '6912345678',
        '+1234567890'
      ];

      phoneNumbers.forEach(phone => {
        const encrypted = encrypt(phone);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(phone);
      });
    });

    it('should handle email addresses', () => {
      const email = 'test@example.com';
      const encrypted = encrypt(email);
      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(email);
    });

    it('should throw error for invalid input', () => {
      expect(() => encrypt('')).toThrow();
      expect(() => encrypt(null)).toThrow();
      expect(() => encrypt(undefined)).toThrow();
    });

    it('should throw error for invalid encrypted data', () => {
      expect(() => decrypt({})).toThrow();
      expect(() => decrypt({ ciphertext: 'test' })).toThrow();
    });
  });

  describe('hashDeterministic', () => {
    it('should generate consistent hashes', () => {
      const phone = '+306912345678';
      const hash1 = hashDeterministic(phone);
      const hash2 = hashDeterministic(phone);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex
    });

    it('should generate different hashes for different inputs', () => {
      const phone1 = '+306912345678';
      const phone2 = '+306912345679';
      
      const hash1 = hashDeterministic(phone1);
      const hash2 = hashDeterministic(phone2);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should normalize input', () => {
      const phone1 = '+306912345678';
      const phone2 = ' +306912345678 ';
      const phone3 = '+306912345678';
      
      const hash1 = hashDeterministic(phone1);
      const hash2 = hashDeterministic(phone2);
      const hash3 = hashDeterministic(phone3);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toBe(hash3);
    });
  });

  describe('extractLast4', () => {
    it('should extract last 4 digits from phone numbers', () => {
      expect(extractLast4('+306912345678')).toBe('5678');
      expect(extractLast4('306912345678')).toBe('5678');
      expect(extractLast4('6912345678')).toBe('5678');
    });

    it('should handle short numbers', () => {
      expect(extractLast4('123')).toBe('123');
      expect(extractLast4('12')).toBe('12');
      expect(extractLast4('1')).toBe('1');
    });

    it('should handle invalid input', () => {
      expect(extractLast4('')).toBe('');
      expect(extractLast4(null)).toBe('');
      expect(extractLast4(undefined)).toBe('');
    });
  });

  describe('encryptPII/decryptPII', () => {
    it('should encrypt phone and email', () => {
      const phone = '+306912345678';
      const email = 'test@example.com';
      
      const encrypted = encryptPII(phone, email);
      
      expect(encrypted).toHaveProperty('phone_hash');
      expect(encrypted).toHaveProperty('phone_ciphertext');
      expect(encrypted).toHaveProperty('phone_last4');
      expect(encrypted).toHaveProperty('email_hash');
      expect(encrypted).toHaveProperty('email_ciphertext');
      
      const decrypted = decryptPII(encrypted);
      expect(decrypted.phoneE164).toBe(phone);
      expect(decrypted.email).toBe(email);
    });

    it('should encrypt phone only', () => {
      const phone = '+306912345678';
      
      const encrypted = encryptPII(phone);
      
      expect(encrypted).toHaveProperty('phone_hash');
      expect(encrypted).toHaveProperty('phone_ciphertext');
      expect(encrypted).toHaveProperty('phone_last4');
      expect(encrypted).not.toHaveProperty('email_hash');
      expect(encrypted).not.toHaveProperty('email_ciphertext');
      
      const decrypted = decryptPII(encrypted);
      expect(decrypted.phoneE164).toBe(phone);
      expect(decrypted.email).toBeUndefined();
    });

    it('should handle null email', () => {
      const phone = '+306912345678';
      
      const encrypted = encryptPII(phone, null);
      
      expect(encrypted).toHaveProperty('phone_hash');
      expect(encrypted).not.toHaveProperty('email_hash');
      
      const decrypted = decryptPII(encrypted);
      expect(decrypted.phoneE164).toBe(phone);
      expect(decrypted.email).toBeUndefined();
    });
  });

  describe('normalization', () => {
    it('should normalize phone numbers', () => {
      expect(normalizePhone('6912345678')).toBe('+306912345678');
      expect(normalizePhone('306912345678')).toBe('+306912345678');
      expect(normalizePhone('+306912345678')).toBe('+306912345678');
    });

    it('should normalize email addresses', () => {
      expect(normalizeEmail('TEST@EXAMPLE.COM')).toBe('test@example.com');
      expect(normalizeEmail(' test@example.com ')).toBe('test@example.com');
    });

    it('should validate phone numbers', () => {
      expect(normalizePhone('invalid')).toBeNull();
      expect(normalizePhone('')).toBeNull();
      expect(normalizePhone(null)).toBeNull();
    });

    it('should validate email addresses', () => {
      expect(normalizeEmail('invalid-email')).toBeNull();
      expect(normalizeEmail('')).toBeNull();
      expect(normalizeEmail(null)).toBeNull();
    });
  });
});
