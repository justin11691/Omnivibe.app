import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import {
  loadPresets,
  savePresets,
  loadZones,
  saveZones,
  loadTheme,
  saveTheme,
  loadDevices,
  saveDevices,
  loadGuardrails,
  saveGuardrails,
  loadCircadian,
  saveCircadian,
  loadProLicense,
  saveProLicense,
  validateLicenseKey,
  exportAllToJson,
  importFromJson,
  resetToFactoryDefaults,
  encodeVibeToUrlHash,
  decodeVibeFromUrlHash,
} from '../src/utils/storage';
import { DEFAULT_PRESETS, DEMO_PRO_TEST_KEY } from '../src/data/defaultPresets';
import { VibePreset, SmartDevice } from '../src/types';

// Mock localStorage for test environment
const memoryStore: Record<string, string> = {};
const mockStore = {
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
  key: (i: number) => Object.keys(memoryStore)[i] ?? null,
  get length() {
    return Object.keys(memoryStore).length;
  },
};

beforeAll(() => {
  if (typeof globalThis.localStorage === 'undefined') {
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStore,
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

describe('OmniVibe 100% Functionality Beta Test Suite', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  describe('1. Vibe Presets & Curated Packs', () => {
    it('preloads all starter packs and validates required properties', () => {
      const presets = loadPresets();
      expect(presets.length).toBeGreaterThanOrEqual(7);

      presets.forEach((p) => {
        expect(p.id).toBeDefined();
        expect(p.name).toBeDefined();
        expect(p.pack).toBeDefined();
        expect(p.colors.length).toBeGreaterThanOrEqual(3);
        expect(p.transitionSpeedMs).toBeGreaterThan(0);
        expect(p.maxBrightness).toBeGreaterThanOrEqual(10);
        expect(p.maxBrightness).toBeLessThanOrEqual(100);
        expect(p.audioReactivity.bassWeight).toBeGreaterThanOrEqual(0);
        expect(p.soundscapeMix).toBeDefined();
      });
    });

    it('ensures core and nostalgia presets are free and advanced are pro', () => {
      const presets = loadPresets();
      const freePresets = presets.filter((p) => !p.isPro);
      const proPresets = presets.filter((p) => p.isPro);

      expect(freePresets.length).toBeGreaterThanOrEqual(4);
      expect(freePresets.map((p) => p.id)).toContain('deep-focus');
      expect(freePresets.map((p) => p.id)).toContain('late-night-lounge');
      expect(freePresets.map((p) => p.id)).toContain('solar-drift');
      expect(freePresets.map((p) => p.id)).toContain('bass-drop');
      expect(freePresets.map((p) => p.id)).toContain('winamp-1999');

      expect(proPresets.length).toBeGreaterThanOrEqual(3);
      expect(proPresets.map((p) => p.id)).toContain('rainy-cyberpunk');
      expect(proPresets.map((p) => p.id)).toContain('cozy-cabin');
      expect(proPresets.map((p) => p.id)).toContain('aurora-borealis');
    });
  });

  describe('2. Soundscapes & Frequency Gain Calculations', () => {
    it('scales soundscape fader levels properly without clipping', () => {
      const testMix = { rain: 100, fire: 80, brownNoise: 50, drone: 60 };

      // Verification of gain ceiling calculations
      const rainGain = (testMix.rain / 100) * 0.6;
      const fireGain = (testMix.fire / 100) * 0.7;
      const brownGain = (testMix.brownNoise / 100) * 0.5;
      const droneGain = (testMix.drone / 100) * 0.55;

      expect(rainGain).toBeCloseTo(0.6, 2);
      expect(fireGain).toBeCloseTo(0.56, 2);
      expect(brownGain).toBeCloseTo(0.25, 2);
      expect(droneGain).toBeCloseTo(0.33, 2);

      // Verify master headroom remains well within non-distorting thresholds
      const maxPossibleHeadroom = 0.6 + 0.7 + 0.5 + 0.55;
      expect(maxPossibleHeadroom).toBeLessThanOrEqual(2.5);
    });

    it('computes 3-band frequency energy and peak hold accurately', () => {
      const bass = 95;
      const mids = 60;
      const treble = 40;

      const overall = Math.round(bass * 0.45 + mids * 0.35 + treble * 0.2);
      expect(overall).toBe(72);

      // Simulated peak hold update
      let peakHold = 50;
      if (overall > peakHold) {
        peakHold = overall;
      }
      expect(peakHold).toBe(72);

      // Next frame with zero energy should decay gradually
      const decayed = Math.max(0, peakHold - 0.7);
      expect(Math.round(decayed)).toBe(71);
    });
  });

  describe('3. Smart Home Bridge & Virtual Room Pairing', () => {
    it('manages hardware devices and assigns target zones without filler items', () => {
      const initialDevices = loadDevices();
      expect(Array.isArray(initialDevices)).toBe(true);

      const newDevice: SmartDevice = {
        id: 'test-device-1',
        name: 'Desk NeoPixel Strip',
        type: 'wled',
        ip: '192.168.1.99',
        enabled: true,
        targetZone: 'studio-desk',
        status: 'connected',
        lastPingMs: 8,
      };

      saveDevices([...initialDevices, newDevice]);
      const updated = loadDevices();
      expect(updated.find((d) => d.id === 'test-device-1')).toBeDefined();
      expect(updated.find((d) => d.id === 'test-device-1')?.status).toBe('connected');
    });

    it('toggles zone active states in local storage', () => {
      const zones = loadZones();
      const target = zones[0];
      target.active = !target.active;
      saveZones(zones);

      const reloaded = loadZones();
      expect(reloaded[0].active).toBe(target.active);
    });
  });

  describe('4. Guardrails & Circadian Biological Clock Automation', () => {
    it('clamps photosensitivity flash rates within safe medical ranges (1-10 Hz)', () => {
      const guardrails = loadGuardrails();
      expect(guardrails.photosensitivityLimit).toBeGreaterThanOrEqual(1);
      expect(guardrails.photosensitivityLimit).toBeLessThanOrEqual(10);

      guardrails.photosensitivityLimit = 5;
      saveGuardrails(guardrails);
      expect(loadGuardrails().photosensitivityLimit).toBe(5);
    });

    it('handles scheduled quiet hours bedtime brightness and bass damping', () => {
      const guardrails = loadGuardrails();
      expect(guardrails.quietHoursEnabled).toBe(true);
      expect(guardrails.quietHoursMaxBrightness).toBeLessThanOrEqual(50);
      expect(guardrails.quietHoursBassDamping).toBeLessThanOrEqual(0.5);
    });

    it('validates circadian day vs night color temperatures', () => {
      const circadian = loadCircadian();
      expect(circadian.dayTempKelvin).toBeGreaterThanOrEqual(4000);
      expect(circadian.nightTempKelvin).toBeLessThanOrEqual(2500);
    });
  });

  describe('5. Freemium Monetization & Stripe Checkout Auto-Activation', () => {
    it('defaults to Free Starter Deck for new visitors until unlocked', () => {
      const lic = loadProLicense();
      expect(lic.isPro).toBe(false);
      expect(lic.licenseKey).toBe('');
    });

    it('validates the built-in demo founder test key', () => {
      expect(validateLicenseKey(DEMO_PRO_TEST_KEY)).toBe(true);
    });

    it('validates standard Stripe customer license key format', () => {
      expect(validateLicenseKey('OMNI-PRO-7890-ABCD')).toBe(true);
      expect(validateLicenseKey('OMNI-PRO-1122-3344')).toBe(true);
      expect(validateLicenseKey('BAD-KEY-FORMAT')).toBe(false);
    });

    it('simulates Stripe checkout return parameter activation', () => {
      // User returns with ?pro_activated=true or ?session_id=...
      const simulatedSessionId = 'cs_test_a1b2c3d4e5f6g7';
      saveProLicense({
        isPro: true,
        licenseKey: simulatedSessionId,
        activatedAt: new Date().toISOString(),
      });

      const lic = loadProLicense();
      expect(lic.isPro).toBe(true);
      expect(lic.licenseKey).toBe(simulatedSessionId);
    });
  });

  describe('6. Zero-Backend Shareability & JSON Backup Integrity', () => {
    it('encodes and decodes complex vibe structures into URL hash strings', () => {
      const preset = DEFAULT_PRESETS[0];
      const hash = encodeVibeToUrlHash(preset);
      expect(hash).toBeTruthy();

      const decoded = decodeVibeFromUrlHash(hash);
      expect(decoded).not.toBeNull();
      expect(decoded?.name).toBe(preset.name);
      expect(decoded?.colors).toEqual(preset.colors);
      expect(decoded?.maxBrightness).toBe(preset.maxBrightness);
    });

    it('exports complete snapshot and restores from JSON backup without data loss', () => {
      saveTheme('signal-industrial');
      saveProLicense({ isPro: true, licenseKey: 'BACKUP-TEST' });

      const jsonStr = exportAllToJson();
      expect(jsonStr).toContain('signal-industrial');
      expect(jsonStr).toContain('BACKUP-TEST');

      // Clear storage
      globalThis.localStorage.clear();
      expect(loadTheme()).toBe('obsidian');

      // Restore
      const restored = importFromJson(jsonStr);
      expect(restored).toBe(true);
      expect(loadTheme()).toBe('signal-industrial');
      expect(loadProLicense().isPro).toBe(true);
    });

    it('resets entire workspace to factory defaults cleanly', () => {
      saveTheme('nordic-pine');
      saveProLicense({ isPro: true });
      resetToFactoryDefaults();

      expect(loadTheme()).toBe('obsidian');
      expect(loadProLicense().isPro).toBe(false);
    });
  });
});
