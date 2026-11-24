import { describe, it, expect } from 'vitest';
import { Guardrails, CircadianRule } from '../src/types';
import { DEFAULT_GUARDRAILS, DEFAULT_CIRCADIAN, DEFAULT_PRESETS, DEFAULT_ZONES } from '../src/data/defaultPresets';
import {
  LightSyncLimiter,
  isWithinQuietHours,
  kelvinToRgb,
  computeCircadianKelvin,
} from '../src/utils/lightSyncEngine';

describe('Safety Guardrails, Circadian Kelvin & LightSyncLimiter Engine', () => {
  it('detects Quiet Hours accurately including midnight wraparound (22:30 - 07:30)', () => {
    const lateNight = new Date(2026, 10, 24, 23, 15);
    const earlyMorning = new Date(2026, 10, 25, 4, 30);
    const afternoon = new Date(2026, 10, 24, 14, 0);

    expect(isWithinQuietHours(lateNight, '22:30', '07:30')).toBe(true);
    expect(isWithinQuietHours(earlyMorning, '22:30', '07:30')).toBe(true);
    expect(isWithinQuietHours(afternoon, '22:30', '07:30')).toBe(false);
  });

  it('enforces photosensitivity flash-rate limiting and instant Blackout override', () => {
    const limiter = new LightSyncLimiter();
    const partyPreset = DEFAULT_PRESETS.find((p) => p.id === 'bass-drop')!;
    const guardrails: Guardrails = {
      ...DEFAULT_GUARDRAILS,
      photosensitivityLimit: 2, // Max 2 Hz -> 500 ms minimum interval between flash jumps
      smoothTransitions: false,
      quietHoursEnabled: false,
    };

    const calibration = {
      experienceMode: 'party' as const,
      latencyOffsetMs: 0,
      latencyProfile: 'wired' as const,
      masterBrightness: 100,
      minBlackFloor: 2,
      micNoiseGate: 8,
      micSensitivity: 1.2,
    };

    // Frame 1 at t=1000ms (triggers rapid jump & arms cooldown)
    const first = limiter.computeFrame({
      preset: partyPreset,
      telemetry: { bass: 100, mids: 80, treble: 60, overall: 86, peakHold: 86, isSilent: false },
      dspCalibration: calibration,
      guardrails,
      circadian: DEFAULT_CIRCADIAN,
      zones: DEFAULT_ZONES,
      nowMs: 1000,
    });
    expect(first.brightness).toBeGreaterThan(50);

    // Frame 2 just 50ms later with sudden drop -> clamped by 2 Hz photosensitivity limit!
    const clamped = limiter.computeFrame({
      preset: partyPreset,
      telemetry: { bass: 0, mids: 0, treble: 0, overall: 0, peakHold: 50, isSilent: false },
      dspCalibration: calibration,
      guardrails,
      circadian: DEFAULT_CIRCADIAN,
      zones: DEFAULT_ZONES,
      nowMs: 1050,
    });
    expect(clamped.clampedByPhotosensitivity).toBe(true);
    expect(clamped.brightness).toBe(first.brightness);

    // Blackout immediately overrides everything to #000000 / 0%
    const blackoutFrame = limiter.computeFrame({
      preset: partyPreset,
      telemetry: { bass: 100, mids: 100, treble: 100, overall: 100, peakHold: 100, isSilent: false },
      dspCalibration: calibration,
      guardrails,
      circadian: DEFAULT_CIRCADIAN,
      zones: DEFAULT_ZONES,
      isBlackout: true,
      nowMs: 1060,
    });
    expect(blackoutFrame.hex).toBe('#000000');
    expect(blackoutFrame.brightness).toBe(0);
  });

  it('caps brightness and shifts Circadian Kelvin warmer during Quiet Hours midnight hours', () => {
    const limiter = new LightSyncLimiter();
    const circadian: CircadianRule = { ...DEFAULT_CIRCADIAN, enabled: true, autoShiftTemp: true };
    const nightTimestamp = new Date(2026, 10, 24, 23, 45).getTime();

    const frame = limiter.computeFrame({
      preset: DEFAULT_PRESETS[3], // Bass Drop (100% brightness normally)
      telemetry: { bass: 100, mids: 80, treble: 80, overall: 90, peakHold: 90, isSilent: false },
      dspCalibration: {
        experienceMode: 'party',
        latencyOffsetMs: 0,
        latencyProfile: 'wired',
        masterBrightness: 100,
        minBlackFloor: 2,
        micNoiseGate: 8,
        micSensitivity: 1.2,
      },
      guardrails: {
        ...DEFAULT_GUARDRAILS,
        quietHoursEnabled: true,
        quietHoursStart: '22:30',
        quietHoursEnd: '07:30',
        quietHoursMaxBrightness: 30,
        quietHoursBassDamping: 0.25,
        smoothTransitions: false,
      },
      circadian,
      zones: DEFAULT_ZONES,
      nowMs: nightTimestamp,
    });

    expect(frame.quietHoursActive).toBe(true);
    expect(frame.brightness).toBeLessThanOrEqual(30);
    expect(frame.circadianKelvin).toBeLessThanOrEqual(2500);

    const warmRgb = kelvinToRgb(2100);
    const coolRgb = kelvinToRgb(5600);
    expect(warmRgb.r).toBeGreaterThan(warmRgb.b);
    expect(coolRgb.b).toBeGreaterThan(warmRgb.b);
    expect(computeCircadianKelvin(new Date(2026, 10, 24, 13, 0), circadian)).toBe(circadian.dayTempKelvin);
  });
});
