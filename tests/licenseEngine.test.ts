import { describe, it, expect } from 'vitest';
import {
  validateLicenseKey,
  generateCustomerLicenseKey,
  normalizeLicenseKey,
} from '../src/utils/licenseEngine';

describe('OmniVibe Permanent Offline License Validation Engine', () => {
  it('validates master and founder test keys instantly', () => {
    const founder = validateLicenseKey('OMNI-FOUNDER-2026-FOREVER');
    expect(founder.isValid).toBe(true);
    expect(founder.tier).toBe('FOUNDER_VIP');

    const vip = validateLicenseKey('  omni-pro-unlimited-vip \n');
    expect(vip.isValid).toBe(true);
    expect(vip.tier).toBe('FOUNDER_VIP');

    const beta = validateLicenseKey('OMNI-BETA-TESTER');
    expect(beta.isValid).toBe(true);
  });

  it('generates and validates standard 4-block customer keys offline', () => {
    for (let i = 0; i < 5; i++) {
      const key = generateCustomerLicenseKey('standard_4');
      const result = validateLicenseKey(key);
      expect(result.isValid).toBe(true);
      expect(result.tier).toBe('LIFETIME_PRO');
    }
  });

  it('generates and validates long 6-block customer keys offline', () => {
    const longKey = generateCustomerLicenseKey('long_6');
    const result = validateLicenseKey(longKey);
    expect(result.isValid).toBe(true);
    expect(result.tier).toBe('LIFETIME_PRO');
  });

  it('generates and validates signed tokens with buyer metadata', () => {
    const token = generateCustomerLicenseKey('signed_token', 'John Doe');
    const result = validateLicenseKey(token);
    expect(result.isValid).toBe(true);
    expect(result.buyerName).toBe('John Doe');
  });

  it('handles user input normalization with line breaks and trailing spaces', () => {
    const rawGenerated = generateCustomerLicenseKey('standard_4');
    const pastedMessy = ` \t\n ${rawGenerated.toLowerCase()} \n `;
    const result = validateLicenseKey(pastedMessy);
    expect(result.isValid).toBe(true);
  });

  it('rejects invalid or tampered keys cleanly with clear feedback', () => {
    const fakeKey = 'OMNI-FAKE-1234-5678-XXXX';
    const result = validateLicenseKey(fakeKey);
    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();

    const empty = validateLicenseKey('');
    expect(empty.isValid).toBe(false);
  });
});
