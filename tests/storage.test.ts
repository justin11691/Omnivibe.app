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
import { DEFAULT_PRESETS, DEMO_PRO_TEST_KEY } from '../src/data/defaultPresets';
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

  it('defaults to Free Starter Deck license state for new visitors and unlocks with key', () => {
    const lic = loadProLicense();
    expect(lic.isPro).toBe(false);
    expect(lic.licenseKey).toBe('');

    saveProLicense({ isPro: true, licenseKey: 'OMNI-FOUNDER-2026-FOREVER' });
    expect(loadProLicense().isPro).toBe(true);
  });

  it('validates demo license key and standard Pro license format', () => {
    // Demo key check
    expect(validateLicenseKey(DEMO_PRO_TEST_KEY)).toBe(true);
    expect(validateLicenseKey('omni-founder-2026')).toBe(true);

    // Standard pattern OMNI-PRO-XXXX-XXXX
    expect(validateLicenseKey('OMNI-PRO-A1B2-C3D4')).toBe(true);
    expect(validateLicenseKey('omni-pro-9988-7766')).toBe(true);

    // Invalid keys
    expect(validateLicenseKey('')).toBe(false);
    expect(validateLicenseKey('RANDOM-KEY')).toBe(false);
    expect(validateLicenseKey('OMNI-PRO-INVALID')).toBe(false);
  });

  it('activates and persists Pro status', () => {
    saveProLicense({
      isPro: true,
      licenseKey: DEMO_PRO_TEST_KEY,
      activatedAt: new Date().toISOString(),
    });

    const reloaded = loadProLicense();
    expect(reloaded.isPro).toBe(true);
    expect(reloaded.licenseKey).toBe(DEMO_PRO_TEST_KEY);
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

  it('exports and restores complete JSON backup including Pro status', () => {
    saveTheme('clean-daylight');
    saveProLicense({ isPro: true, licenseKey: 'BACKUP-KEY' });
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
    saveTheme('warm-amber');
    saveProLicense({ isPro: true });
    resetToFactoryDefaults();
    expect(loadTheme()).toBe('obsidian');
    expect(loadProLicense().isPro).toBe(false);
  });
});
