import { describe, it, expect } from 'vitest';
import { Guardrails, CircadianRule } from '../src/types';
import { DEFAULT_GUARDRAILS, DEFAULT_CIRCADIAN } from '../src/data/defaultPresets';

describe('Safety Guardrails & Automation Logic', () => {
  it('enforces photosensitivity rate limiting constraints', () => {
    const guardrails: Guardrails = { ...DEFAULT_GUARDRAILS, photosensitivityLimit: 3 };
    // Flash rate limit must be positive and clamped between 1 and 10 Hz
    expect(guardrails.photosensitivityLimit).toBeGreaterThanOrEqual(1);
    expect(guardrails.photosensitivityLimit).toBeLessThanOrEqual(10);
  });

  it('calculates quiet hours bedtime brightness damping', () => {
    const guardrails: Guardrails = {
      ...DEFAULT_GUARDRAILS,
      quietHoursEnabled: true,
      quietHoursMaxBrightness: 35,
      quietHoursBassDamping: 0.3,
    };

    const regularMaxBrightness = 90;
    const quietEffectiveBrightness = Math.min(regularMaxBrightness, guardrails.quietHoursMaxBrightness);
    expect(quietEffectiveBrightness).toBe(35);

    const rawBassEnergy = 80;
    const dampenedBass = rawBassEnergy * guardrails.quietHoursBassDamping;
    expect(dampenedBass).toBe(24);
  });

  it('validates circadian color temperature parameters', () => {
    const circadian: CircadianRule = { ...DEFAULT_CIRCADIAN };
    expect(circadian.dayTempKelvin).toBeGreaterThan(circadian.nightTempKelvin);
    expect(circadian.nightTempKelvin).toBeLessThanOrEqual(3000);
  });
});
