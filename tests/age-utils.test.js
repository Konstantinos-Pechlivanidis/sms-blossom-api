// tests/age-utils.test.js
// Tests for age derivation utilities

import { describe, it, expect } from 'vitest';
import { deriveAgeYears, normalizeGender, parseBirthdate } from '../src/lib/age-utils.js';

describe('deriveAgeYears', () => {
  it('should calculate age correctly for valid birthdate', () => {
    const birthdate = new Date('1990-01-15');
    const age = deriveAgeYears(birthdate);
    expect(age).toBeGreaterThan(30);
    expect(age).toBeLessThan(40);
  });

  it('should return null for invalid birthdate', () => {
    expect(deriveAgeYears('invalid')).toBeNull();
    expect(deriveAgeYears(null)).toBeNull();
    expect(deriveAgeYears(undefined)).toBeNull();
  });

  it('should return null for future birthdate', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    expect(deriveAgeYears(futureDate)).toBeNull();
  });

  it('should return null for too old birthdate', () => {
    const oldDate = new Date('1800-01-01');
    expect(deriveAgeYears(oldDate)).toBeNull();
  });
});

describe('normalizeGender', () => {
  it('should normalize male variations', () => {
    expect(normalizeGender('male')).toBe('male');
    expect(normalizeGender('M')).toBe('male');
    expect(normalizeGender('Male')).toBe('male');
    expect(normalizeGender('man')).toBe('male');
  });

  it('should normalize female variations', () => {
    expect(normalizeGender('female')).toBe('female');
    expect(normalizeGender('F')).toBe('female');
    expect(normalizeGender('Female')).toBe('female');
    expect(normalizeGender('woman')).toBe('female');
  });

  it('should return unknown for invalid values', () => {
    expect(normalizeGender('invalid')).toBe('unknown');
    expect(normalizeGender('')).toBe('unknown');
    expect(normalizeGender(null)).toBe('unknown');
    expect(normalizeGender(undefined)).toBe('unknown');
  });
});

describe('parseBirthdate', () => {
  it('should parse ISO format', () => {
    const date = parseBirthdate('1990-01-15');
    expect(date).toBeInstanceOf(Date);
    expect(date.getFullYear()).toBe(1990);
    expect(date.getMonth()).toBe(0); // January
    expect(date.getDate()).toBe(15);
  });

  it('should parse MM/DD/YYYY format', () => {
    const date = parseBirthdate('01/15/1990');
    expect(date).toBeInstanceOf(Date);
    expect(date.getFullYear()).toBe(1990);
    expect(date.getMonth()).toBe(0); // January
    expect(date.getDate()).toBe(15);
  });

  it('should parse MM-DD-YYYY format', () => {
    const date = parseBirthdate('01-15-1990');
    expect(date).toBeInstanceOf(Date);
    expect(date.getFullYear()).toBe(1990);
  });

  it('should return null for invalid formats', () => {
    expect(parseBirthdate('invalid')).toBeNull();
    expect(parseBirthdate('')).toBeNull();
    expect(parseBirthdate(null)).toBeNull();
    expect(parseBirthdate(undefined)).toBeNull();
  });
});
