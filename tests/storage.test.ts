import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  loadTheme,
  saveTheme,
  loadPresets,
  savePresets,
  loadZones,
  saveZones,
  exportAllToJson,
  importFromJson,
  resetToFactoryDefaults,
  encodeVibeToUrlHash,
  decodeVibeFromUrlHash,
  loadProLicense,
  saveProLicense,
  validateLicenseKey,
} from '../src/utils/storage';
import { DEFAULT_PRESETS } from '../src/data/defaultPresets';
import { generateCustomerLicenseKey } from '../src/utils/licenseEngine';
import { VibePreset } from '../src/types';

// In-memory mock for localStorage in Node test runner
const memoryStorage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (k: string) => memoryStorage[k] ?? null,
  setItem: (k: string, v: string) => {
    memoryStorage[k] = String(v);
  },
  removeItem: (k: string) => {
    delete memoryStorage[k];
  },
  clear: () => {
    Object.keys(memoryStorage).forEach((k) => delete memoryStorage[k]);
  },
  key: (i: number) => Object.keys(memoryStorage)[i] ?? null,
  get length() {
    return Object.keys(memoryStorage).length;
  },
};

// Polyfill global localStorage and atob/btoa if needed in Node
beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });
  }
  if (typeof globalThis.btoa === 'undefined') {
    globalThis.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
  }
  if (typeof globalThis.atob === 'undefined') {
    globalThis.atob = (b64: string) => Buffer.from(b64, 'base64').toString('binary');
  }
});

describe('OmniVibe Local Storage & State Persistence', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('loads default presets with correct Free vs Pro flags', () => {
    const presets = loadPresets();
    expect(presets).toHaveLength(DEFAULT_PRESETS.length);
    expect(presets[0].id).toBe('deep-focus');
    expect(presets[0].isPro).toBe(false);

    // Verify Pro presets
    const cyberpunk = presets.find((p) => p.id === 'rainy-cyberpunk');
    expect(cyberpunk?.isPro).toBe(true);
  });

  it('defaults to locked/demo license state and rejects unverified or forged storage records', () => {
    const lic = loadProLicense();
    expect(lic.isPro).toBe(false);
    expect(lic.licenseKey).toBe('');

    // Forged save attempt must be ignored
    saveProLicense({ isPro: true, licenseKey: 'FAKE-FORGED-KEY' });
    expect(loadProLicense().isPro).toBe(false);

    const validKey = generateCustomerLicenseKey('standard_4');
    saveProLicense({ isPro: true, licenseKey: validKey });
    expect(loadProLicense().isPro).toBe(true);
  });

  it('validates cryptographically signed license keys and rejects bogus keys', () => {
    const validStd = generateCustomerLicenseKey('standard_4');
    const validToken = generateCustomerLicenseKey('signed_token', 'Test Owner');
    expect(validateLicenseKey(validStd)).toBe(true);
    expect(validateLicenseKey(validStd.toLowerCase())).toBe(true);
    expect(validateLicenseKey(validToken)).toBe(true);

    // Invalid / old hardcoded keys
    expect(validateLicenseKey('')).toBe(false);
    expect(validateLicenseKey('RANDOM-KEY')).toBe(false);
    expect(validateLicenseKey('OMNI-PRO-INVALID')).toBe(false);
    expect(validateLicenseKey('OMNI-FOUNDER-2026-FOREVER')).toBe(false);
  });

  it('activates and persists valid offline license status', () => {
    const validKey = generateCustomerLicenseKey('standard_4');
    saveProLicense({
      isPro: true,
      licenseKey: validKey,
      activatedAt: new Date().toISOString(),
    });

    const reloaded = loadProLicense();
    expect(reloaded.isPro).toBe(true);
    expect(reloaded.licenseKey).toBe(validKey);
  });

  it('saves and loads active skin theme including new free studio skins', () => {
    expect(loadTheme()).toBe('obsidian');
    saveTheme('warm-amber');
    expect(loadTheme()).toBe('warm-amber');
    saveTheme('signal-industrial');
    expect(loadTheme()).toBe('signal-industrial');
    saveTheme('nordic-pine');
    expect(loadTheme()).toBe('nordic-pine');
    saveTheme('mcintosh-hifi');
    expect(loadTheme()).toBe('mcintosh-hifi');
    saveTheme('cool-slate');
    expect(loadTheme()).toBe('cool-slate');
    saveTheme('winamp-classic');
    expect(loadTheme()).toBe('winamp-classic');
  });

  it('persists modified room zones', () => {
    const zones = loadZones();
    zones[0].active = false;
    saveZones(zones);

    const reloaded = loadZones();
    expect(reloaded[0].active).toBe(false);
  });

  it('exports and restores complete JSON backup including verified license and rejects forged backups', () => {
    const validKey = generateCustomerLicenseKey('standard_4');
    saveTheme('clean-daylight');
    saveProLicense({ isPro: true, licenseKey: validKey });
    const jsonStr = exportAllToJson();
    const parsed = JSON.parse(jsonStr);

    expect(parsed.version).toBe(1);
    expect(parsed.theme).toBe('clean-daylight');
    expect(parsed.proLicense?.isPro).toBe(true);

    // Reset and verify restore
    globalThis.localStorage.clear();
    const success = importFromJson(jsonStr);
    expect(success).toBe(true);
    expect(loadTheme()).toBe('clean-daylight');
    expect(loadProLicense().isPro).toBe(true);

    // Forged backup must not grant isPro: true
    globalThis.localStorage.clear();
    importFromJson(JSON.stringify({ version: 1, proLicense: { isPro: true, licenseKey: 'FAKE-BACKUP-KEY' } }));
    expect(loadProLicense().isPro).toBe(false);
  });

  it('encodes and decodes shareable URL vibe hashes correctly', () => {
    const testPreset: VibePreset = {
      id: 'test-vibe',
      name: 'Cyberpunk Sunset',
      pack: 'Custom',
      tagline: 'Test description',
      icon: 'Sparkles',
      colors: ['#ff007f', '#00f0ff', '#ffe600'],
      transitionSpeedMs: 2500,
      maxBrightness: 85,
      audioReactivity: {
        bassWeight: 1.5,
        midWeight: 1.0,
        trebleWeight: 0.8,
        mode: 'party_reactive',
        smoothing: 0.7,
      },
      soundscapeMix: {
        rain: 40,
        fire: 0,
        brownNoise: 20,
        drone: 10,
      },
    };

    const hash = encodeVibeToUrlHash(testPreset);
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(10);

    const decoded = decodeVibeFromUrlHash(hash);
    expect(decoded).not.toBeNull();
    expect(decoded?.name).toBe('Cyberpunk Sunset');
    expect(decoded?.colors).toEqual(['#ff007f', '#00f0ff', '#ffe600']);
    expect(decoded?.maxBrightness).toBe(85);
    expect(decoded?.audioReactivity?.mode).toBe('party_reactive');
  });

  it('handles corrupted URL hashes gracefully without crashing', () => {
    const result = decodeVibeFromUrlHash('invalid_corrupted_base64_string!@#');
    expect(result).toBeNull();
  });

  it('resets all local storage keys to factory defaults', () => {
    const validKey = generateCustomerLicenseKey('standard_4');
    saveTheme('warm-amber');
    saveProLicense({ isPro: true, licenseKey: validKey });
    resetToFactoryDefaults();
    expect(loadTheme()).toBe('obsidian');
    expect(loadProLicense().isPro).toBe(false);
  });
});
