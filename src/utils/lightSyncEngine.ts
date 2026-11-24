// OmniVibe Studio — Safety Guardrails, Circadian Kelvin Shift & Multi-Color Bridge Engine
// Enforces medical photosensitivity flash caps (1-10 Hz), overnight Quiet Hours damping,
// biological Kelvin warmth curves, multi-stop palette color transitions, and instant Blackout.

import {
  VibePreset,
  AudioTelemetry,
  DspCalibrationSettings,
  Guardrails,
  CircadianRule,
  RoomZone,
} from '../types';
import { computeCalibratedLightOutput } from '../audio/AudioEngine';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface CalibratedSyncFrame {
  r: number;
  g: number;
  b: number;
  hex: string;
  brightness: number;
  smoothing: number;
  quietHoursActive: boolean;
  clampedByPhotosensitivity: boolean;
  circadianKelvin: number | null;
}

function parseMinutes(hhmm: string, fallbackMins: number): number {
  if (!hhmm || typeof hhmm !== 'string') return fallbackMins;
  const parts = hhmm.split(':');
  if (parts.length !== 2) return fallbackMins;
  const h = Number.parseInt(parts[0], 10);
  const m = Number.parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return fallbackMins;
  return ((h % 24) + 24) % 24 * 60 + Math.max(0, Math.min(59, m));
}

/**
 * Checks whether `nowDate` falls inside the configured Quiet Hours window,
 * supporting midnight wraparound (e.g., 22:30 -> 07:30).
 */
export function isWithinQuietHours(nowDate: Date, startHHMM: string, endHHMM: string): boolean {
  const cur = nowDate.getHours() * 60 + nowDate.getMinutes();
  const start = parseMinutes(startHHMM, 22 * 60 + 30);
  const end = parseMinutes(endHHMM, 7 * 60 + 30);
  if (start === end) return false;
  if (start < end) {
    return cur >= start && cur < end;
  }
  return cur >= start || cur < end;
}

export function hexToRgb(hex: string): RgbColor {
  const clean = String(hex || '#38bdf8').replace('#', '').trim();
  if (clean.length === 3) {
    return {
      r: Number.parseInt(clean[0] + clean[0], 16) || 0,
      g: Number.parseInt(clean[1] + clean[1], 16) || 0,
      b: Number.parseInt(clean[2] + clean[2], 16) || 0,
    };
  }
  const padded = clean.padEnd(6, '0').slice(0, 6);
  const r = Number.parseInt(padded.slice(0, 2), 16);
  const g = Number.parseInt(padded.slice(2, 4), 16);
  const b = Number.parseInt(padded.slice(4, 6), 16);
  return {
    r: Number.isNaN(r) ? 56 : r,
    g: Number.isNaN(g) ? 189 : g,
    b: Number.isNaN(b) ? 248 : b,
  };
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

/**
 * Approximates CIE blackbody correlated color temperature (1800K - 6500K) to RGB.
 */
export function kelvinToRgb(kelvin: number): RgbColor {
  const temp = Math.max(1000, Math.min(40000, kelvin)) / 100;
  let r: number;
  let g: number;
  let b: number;

  if (temp <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
    b = temp <= 19 ? 0 : 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    b = 255;
  }

  return {
    r: Math.max(0, Math.min(255, Math.round(r))),
    g: Math.max(0, Math.min(255, Math.round(g))),
    b: Math.max(0, Math.min(255, Math.round(b))),
  };
}

/**
 * Smoothly interpolates Circadian color temperature between daytime and nighttime anchors.
 */
export function computeCircadianKelvin(nowDate: Date, circadian: CircadianRule): number {
  const cur = nowDate.getHours() * 60 + nowDate.getMinutes();
  const sunrise = parseMinutes(circadian.sunriseTime, 6 * 60 + 45);
  const sunset = parseMinutes(circadian.sunsetTime, 19 * 60 + 30);
  const transitionMins = 60;

  // Compute daylight fraction 0 (night) -> 1 (day) with 60-min dawn/dusk cosine ramp
  let dayFactor = 0;
  if (cur >= sunrise && cur < sunset) {
    if (cur < sunrise + transitionMins) {
      const t = (cur - sunrise) / transitionMins;
      dayFactor = 0.5 - 0.5 * Math.cos(t * Math.PI);
    } else if (cur > sunset - transitionMins) {
      const t = (sunset - cur) / transitionMins;
      dayFactor = 0.5 - 0.5 * Math.cos(t * Math.PI);
    } else {
      dayFactor = 1;
    }
  }

  return Math.round(
    circadian.nightTempKelvin + (circadian.dayTempKelvin - circadian.nightTempKelvin) * dayFactor
  );
}

function lerpColor(a: RgbColor, b: RgbColor, t: number): RgbColor {
  const k = Math.max(0, Math.min(1, t));
  return {
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
  };
}

/**
 * Stateful frame governor that wires preset palettes, active zones, Circadian warmth,
 * Quiet Hours attenuation, and Photosensitivity strobe caps (1-10 Hz) into hardware output.
 */
export class LightSyncLimiter {
  private lastTransitionAt = 0;
  private currentRgb: RgbColor = { r: 34, g: 211, b: 238 };
  private currentBrightness = 40;

  public computeFrame({
    preset,
    telemetry,
    dspCalibration,
    guardrails,
    circadian,
    zones,
    isBlackout = false,
    nowMs = Date.now(),
  }: {
    preset: VibePreset;
    telemetry: AudioTelemetry;
    dspCalibration: DspCalibrationSettings;
    guardrails: Guardrails;
    circadian: CircadianRule;
    zones?: RoomZone[];
    isBlackout?: boolean;
    nowMs?: number;
  }): CalibratedSyncFrame {
    if (isBlackout) {
      this.currentRgb = { r: 0, g: 0, b: 0 };
      this.currentBrightness = 0;
      return {
        r: 0,
        g: 0,
        b: 0,
        hex: '#000000',
        brightness: 0,
        smoothing: 0.1,
        quietHoursActive: false,
        clampedByPhotosensitivity: false,
        circadianKelvin: null,
      };
    }

    const nowDate = new Date(nowMs);
    const quietHoursActive = Boolean(
      guardrails.quietHoursEnabled &&
        isWithinQuietHours(nowDate, guardrails.quietHoursStart, guardrails.quietHoursEnd)
    );

    // 1. Evaluate active Room Zones
    let zoneCeiling = 100;
    if (Array.isArray(zones)) {
      const activeZones = zones.filter((z) => z.active);
      if (activeZones.length === 0) {
        zoneCeiling = 0;
      } else {
        zoneCeiling = Math.max(...activeZones.map((z) => z.brightness));
      }
    }

    // 2. Compute audio-reactive energy with Quiet Hours bass damping
    const bassDamping = quietHoursActive ? Math.max(0.05, Math.min(1, guardrails.quietHoursBassDamping)) : 1;
    const effectiveBass = telemetry.bass * bassDamping;
    const weightedEnergy = effectiveBass * 0.5 + telemetry.mids * 0.3 + telemetry.treble * 0.2;

    const effectiveMasterBri = Math.min(dspCalibration.masterBrightness, preset.maxBrightness);
    let targetBrightness =
      zoneCeiling === 0
        ? 0
        : computeCalibratedLightOutput(
            weightedEnergy,
            effectiveMasterBri,
            dspCalibration.minBlackFloor,
            dspCalibration.experienceMode
          );

    if (zoneCeiling > 0 && zoneCeiling < 100) {
      targetBrightness = Math.min(targetBrightness, (targetBrightness * zoneCeiling) / 100 + 0.5);
    }

    if (quietHoursActive) {
      targetBrightness = Math.min(targetBrightness, guardrails.quietHoursMaxBrightness);
    }

    // 3. Interpolate dynamically across ALL colors in the active preset palette
    const palette = (preset.colors && preset.colors.length > 0 ? preset.colors : ['#22d3ee', '#d946ef', '#f59e0b']).map(hexToRgb);
    let targetRgb = palette[0];
    if (palette.length > 1) {
      const totalSpec = Math.max(1, telemetry.bass + telemetry.mids + telemetry.treble);
      const spectralShift = (telemetry.mids * 0.5 + telemetry.treble) / totalSpec;
      const speedSec = Math.max(0.25, preset.transitionSpeedMs / 1000);
      const timeDrift = ((nowMs / (speedSec * 1000)) % 1);
      const pos = ((spectralShift * 0.65 + timeDrift * 0.35) % 1) * (palette.length - 1);
      const idx = Math.floor(pos);
      const frac = pos - idx;
      targetRgb = lerpColor(palette[idx], palette[Math.min(palette.length - 1, idx + 1)], frac);
    }

    // 4. Blend Circadian biological Kelvin warmth when enabled
    let circadianKelvin: number | null = null;
    if (circadian.enabled && circadian.autoShiftTemp) {
      circadianKelvin = computeCircadianKelvin(nowDate, circadian);
      const kelvinTint = kelvinToRgb(circadianKelvin);
      // Warm evening shifts carry slightly stronger tint without washing out daytime saturation
      const blendWeight = circadianKelvin <= 3200 ? 0.28 : 0.1;
      targetRgb = lerpColor(targetRgb, kelvinTint, blendWeight);
    }

    // 5. Enforce Photosensitivity Flash Rate Limiter (1 - 10 Hz max sudden transitions/sec)
    const maxHz = Math.max(1, Math.min(10, guardrails.photosensitivityLimit || 4));
    const minIntervalMs = 1000 / maxHz;
    const elapsedMs = nowMs - this.lastTransitionAt;

    const briDelta = Math.abs(targetBrightness - this.currentBrightness);
    const rgbDelta = Math.max(
      Math.abs(targetRgb.r - this.currentRgb.r),
      Math.abs(targetRgb.g - this.currentRgb.g),
      Math.abs(targetRgb.b - this.currentRgb.b)
    );

    const isRapidFlashStep = briDelta > 8 || rgbDelta > 35;
    let clampedByPhotosensitivity = false;

    if (isRapidFlashStep && elapsedMs < minIntervalMs) {
      clampedByPhotosensitivity = true;
      // Hold at gently slewed maximum safe rate when smoothTransitions is active
      if (guardrails.smoothTransitions) {
        this.currentRgb = lerpColor(this.currentRgb, targetRgb, 0.12);
        this.currentBrightness =
          this.currentBrightness + Math.sign(targetBrightness - this.currentBrightness) * Math.min(briDelta, 2.5);
      }
    } else {
      if (isRapidFlashStep) {
        this.lastTransitionAt = nowMs;
      }
      if (guardrails.smoothTransitions) {
        const slew = dspCalibration.experienceMode === 'party' && !quietHoursActive ? 0.55 : 0.25;
        this.currentRgb = lerpColor(this.currentRgb, targetRgb, slew);
        this.currentBrightness = this.currentBrightness + (targetBrightness - this.currentBrightness) * slew;
      } else {
        this.currentRgb = targetRgb;
        this.currentBrightness = targetBrightness;
      }
    }

    const r = Math.max(0, Math.min(255, Math.round(this.currentRgb.r)));
    const g = Math.max(0, Math.min(255, Math.round(this.currentRgb.g)));
    const b = Math.max(0, Math.min(255, Math.round(this.currentRgb.b)));
    const brightness = Number(Math.max(0, Math.min(100, this.currentBrightness)).toFixed(1));

    return {
      r,
      g,
      b,
      hex: rgbToHex({ r, g, b }),
      brightness,
      smoothing: guardrails.smoothTransitions
        ? dspCalibration.experienceMode === 'party' && !quietHoursActive
          ? 0.5
          : 0.22
        : 0.85,
      quietHoursActive,
      clampedByPhotosensitivity,
      circadianKelvin,
    };
  }
}
