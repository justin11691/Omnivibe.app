import { describe, it, expect } from 'vitest';

describe('Audio Frequency Bins & Telemetry Math', () => {
  it('correctly maps frequency ranges to FFT bins for 44.1kHz sample rate', () => {
    const sampleRate = 44100;
    const fftSize = 1024;
    const binCount = fftSize / 2; // 512
    const binHz = sampleRate / fftSize; // ~43.066 Hz per bin

    // Bass: 20Hz - 250Hz
    const bassStart = Math.floor(20 / binHz);
    const bassEnd = Math.floor(250 / binHz);
    expect(bassStart).toBe(0);
    expect(bassEnd).toBeGreaterThan(4);
    expect(bassEnd).toBeLessThan(8);

    // Mids: 250Hz - 4000Hz
    const midsStart = bassEnd;
    const midsEnd = Math.floor(4000 / binHz);
    expect(midsStart).toBeLessThan(midsEnd);
    expect(midsEnd).toBeGreaterThan(80);

    // Treble: 4000Hz - 16000Hz
    const trebleStart = midsEnd;
    const trebleEnd = Math.floor(16000 / binHz);
    expect(trebleStart).toBeLessThan(trebleEnd);
    expect(trebleEnd).toBeLessThan(binCount);
  });

  it('calculates weighted composite energy level correctly', () => {
    const bass = 80;
    const mids = 50;
    const treble = 30;

    // Overall energy formula: 45% bass + 35% mids + 20% treble
    const overall = Math.round(bass * 0.45 + mids * 0.35 + treble * 0.2);
    expect(overall).toBe(60);
  });

  it('decays peak hold smoothly', () => {
    let peakHold = 90;
    const decayRate = 0.7;

    // Simulate 10 frames of audio quieter than the peak
    for (let i = 0; i < 10; i++) {
      peakHold = Math.max(0, peakHold - decayRate);
    }
    expect(Math.round(peakHold)).toBe(83);
  });
});
