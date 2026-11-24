import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  validateLicenseKey,
  generateCustomerLicenseKey,
  loadPersistentLicense,
} from '../src/utils/licenseEngine';

const memoryStore: Record<string, string> = {};
beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => memoryStore[k] ?? null,
        setItem: (k: string, v: string) => {
          memoryStore[k] = String(v);
        },
        removeItem: (k: string) => {
          delete memoryStore[k];
        },
        clear: () => {
          Object.keys(memoryStore).forEach((k) => delete memoryStore[k]);
        },
      },
      writable: true,
    });
  }
  if (typeof globalThis.window === 'undefined') {
    (globalThis as any).window = globalThis;
  }
});

describe('OmniVibe Permanent Offline License Validation Engine', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('rejects old hardcoded master bypass strings in client code', () => {
    expect(validateLicenseKey('OMNI-FOUNDER-2026-FOREVER').isValid).toBe(false);
    expect(validateLicenseKey('OMNI-PRO-UNLIMITED-VIP').isValid).toBe(false);
    expect(validateLicenseKey('OMNI-BETA-TESTER').isValid).toBe(false);
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

  it('rejects invalid or tampered keys and tampered localStorage license records', async () => {
    const fakeKey = 'OMNI-FAKE-1234-5678-XXXX';
    const result = validateLicenseKey(fakeKey);
    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
    expect(validateLicenseKey('').isValid).toBe(false);

    // Attacker sets isPro: true manually in localStorage with an unverified key
    globalThis.localStorage.setItem(
      'omnivibe_pro_license',
      JSON.stringify({ isPro: true, licenseKey: 'BYPASS-KEY-9999', tier: 'LIFETIME_PRO' })
    );
    const loaded = await loadPersistentLicense();
    expect(loaded.isPro).toBe(false);
  });
});
