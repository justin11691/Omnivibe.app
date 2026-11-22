// Web Audio API Pure Synthesized Soundscape Generators
// Generates Rain, Fire, Brown Noise, Drone, Distant Rolling Thunder, Night Passenger Train, Ocean Waves, and Vinyl Tape Warmth.
// 100% procedural with zero external audio files.

import { SoundscapeMix } from '../types';

export class SynthesizedSoundscapes {
  private ctx: AudioContext;
  private outputNode: GainNode;

  // Soundscape Gain Nodes
  private rainGain: GainNode;
  private fireGain: GainNode;
  private brownNoiseGain: GainNode;
  private droneGain: GainNode;
  private thunderGain: GainNode;
  private trainGain: GainNode;
  private wavesGain: GainNode;
  private vinylGain: GainNode;

  // Active Soundscape Source Nodes & Timers
  private rainSource: AudioBufferSourceNode | null = null;
  private brownNoiseSource: AudioBufferSourceNode | null = null;
  private fireBedSource: AudioBufferSourceNode | null = null;
  private droneOsc1: OscillatorNode | null = null;
  private droneOsc2: OscillatorNode | null = null;
  private droneLfo: OscillatorNode | null = null;

  // Ocean wave LFO filter
  private waveNoiseSource: AudioBufferSourceNode | null = null;
  private waveFilter: BiquadFilterNode | null = null;
  private waveLfo: OscillatorNode | null = null;

  // Intervals for organic procedural events
  private crackleIntervalId: number | null = null;
  private thunderIntervalId: number | null = null;
  private trainIntervalId: number | null = null;
  private vinylIntervalId: number | null = null;

  private isRunning = false;

  constructor(ctx: AudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.outputNode = ctx.createGain();
    this.outputNode.gain.value = 1.0;
    this.outputNode.connect(destination);

    // Individual soundscape gains
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    this.rainGain.connect(this.outputNode);

    this.fireGain = ctx.createGain();
    this.fireGain.gain.value = 0;
    this.fireGain.connect(this.outputNode);

    this.brownNoiseGain = ctx.createGain();
    this.brownNoiseGain.gain.value = 0;
    this.brownNoiseGain.connect(this.outputNode);

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneGain.connect(this.outputNode);

    this.thunderGain = ctx.createGain();
    this.thunderGain.gain.value = 0;
    this.thunderGain.connect(this.outputNode);

    this.trainGain = ctx.createGain();
    this.trainGain.gain.value = 0;
    this.trainGain.connect(this.outputNode);

    this.wavesGain = ctx.createGain();
    this.wavesGain.gain.value = 0;
    this.wavesGain.connect(this.outputNode);

    this.vinylGain = ctx.createGain();
    this.vinylGain.gain.value = 0;
    this.vinylGain.connect(this.outputNode);
  }

  // Generate 5-second buffer of white noise
  private createWhiteNoiseBuffer(durationSeconds = 5): AudioBuffer {
    const bufferSize = this.ctx.sampleRate * durationSeconds;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // Generate 5-second buffer of Brownian (red) noise
  private createBrownNoiseBuffer(durationSeconds = 5): AudioBuffer {
    const bufferSize = this.ctx.sampleRate * durationSeconds;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5;
    }
    return buffer;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // 1. RAIN SYNTHESIS
    const rainNoise = this.ctx.createBufferSource();
    rainNoise.buffer = this.createWhiteNoiseBuffer(5);
    rainNoise.loop = true;

    const rainBandpass = this.ctx.createBiquadFilter();
    rainBandpass.type = 'bandpass';
    rainBandpass.frequency.value = 1200;
    rainBandpass.Q.value = 1.2;

    const rainHighpass = this.ctx.createBiquadFilter();
    rainHighpass.type = 'highpass';
    rainHighpass.frequency.value = 400;

    rainNoise.connect(rainBandpass);
    rainBandpass.connect(rainHighpass);
    rainHighpass.connect(this.rainGain);
    rainNoise.start();
    this.rainSource = rainNoise;

    // 2. BROWN NOISE SYNTHESIS
    const brownNoise = this.ctx.createBufferSource();
    brownNoise.buffer = this.createBrownNoiseBuffer(5);
    brownNoise.loop = true;

    const brownLowpass = this.ctx.createBiquadFilter();
    brownLowpass.type = 'lowpass';
    brownLowpass.frequency.value = 450;

    brownNoise.connect(brownLowpass);
    brownLowpass.connect(this.brownNoiseGain);
    brownNoise.start();
    this.brownNoiseSource = brownNoise;

    // 3. FIRE SYNTHESIS
    const fireBed = this.ctx.createBufferSource();
    fireBed.buffer = this.createBrownNoiseBuffer(4);
    fireBed.loop = true;

    const fireLowpass = this.ctx.createBiquadFilter();
    fireLowpass.type = 'lowpass';
    fireLowpass.frequency.value = 350;

    fireBed.connect(fireLowpass);
    fireLowpass.connect(this.fireGain);
    fireBed.start();
    this.fireBedSource = fireBed;

    this.crackleIntervalId = window.setInterval(() => {
      if (!this.isRunning || this.fireGain.gain.value <= 0.01) return;
      if (Math.random() < 0.65) {
        this.triggerFireCrackle();
      }
    }, 180);

    // 4. DEEP ANALOG DRONE SYNTHESIS
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 43.65; // F1

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 65.41; // C2

    const droneFilter = this.ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 180;
    droneFilter.Q.value = 3.5;

    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.08;

    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain);
    lfoGain.connect(droneFilter.frequency);

    osc1.connect(droneFilter);
    osc2.connect(droneFilter);
    droneFilter.connect(this.droneGain);

    osc1.start();
    osc2.start();
    lfo.start();

    this.droneOsc1 = osc1;
    this.droneOsc2 = osc2;
    this.droneLfo = lfo;

    // 5. DISTANT ROLLING THUNDER (Sub-bass rumble and natural reverberant decay)
    this.thunderIntervalId = window.setInterval(() => {
      if (!this.isRunning || this.thunderGain.gain.value <= 0.01) return;
      if (Math.random() < 0.35) {
        this.triggerRollingThunder();
      }
    }, 4500);

    // 6. NIGHT PASSENGER TRAIN (Rhythmic clack-clack on rails + low axle hum)
    this.startTrainRhythm();

    // 7. OCEAN SURF WAVES (Slow surging resonant filter sweep on pink/brown bed)
    const waveNoise = this.ctx.createBufferSource();
    waveNoise.buffer = this.createBrownNoiseBuffer(6);
    waveNoise.loop = true;

    const wFilter = this.ctx.createBiquadFilter();
    wFilter.type = 'lowpass';
    wFilter.frequency.value = 400;
    wFilter.Q.value = 2.0;

    const wLfo = this.ctx.createOscillator();
    wLfo.type = 'sine';
    wLfo.frequency.value = 0.12; // 8-second wave breath

    const wLfoGain = this.ctx.createGain();
    wLfoGain.gain.value = 300;
    wLfo.connect(wLfoGain);
    wLfoGain.connect(wFilter.frequency);

    waveNoise.connect(wFilter);
    wFilter.connect(this.wavesGain);

    waveNoise.start();
    wLfo.start();

    this.waveNoiseSource = waveNoise;
    this.waveFilter = wFilter;
    this.waveLfo = wLfo;

    // 8. VINYL / CASSETTE TAPE (Micro-needle crackles and vintage tape warmth)
    this.vinylIntervalId = window.setInterval(() => {
      if (!this.isRunning || this.vinylGain.gain.value <= 0.01) return;
      if (Math.random() < 0.8) {
        this.triggerVinylCrackle();
      }
    }, 120);
  }

  // Trigger organic fire wood pop
  private triggerFireCrackle(): void {
    const burstDuration = 0.008 + Math.random() * 0.02;
    const osc = this.ctx.createOscillator();
    osc.type = Math.random() > 0.5 ? 'triangle' : 'square';
    osc.frequency.value = 1200 + Math.random() * 2500;

    const burstGain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    const peak = (0.2 + Math.random() * 0.6) * this.fireGain.gain.value;

    burstGain.gain.setValueAtTime(0, now);
    burstGain.gain.linearRampToValueAtTime(peak, now + 0.002);
    burstGain.gain.exponentialRampToValueAtTime(0.0001, now + burstDuration);

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2400 + Math.random() * 1200;
    bp.Q.value = 2.0;

    osc.connect(bp);
    bp.connect(burstGain);
    burstGain.connect(this.outputNode);

    osc.start(now);
    osc.stop(now + burstDuration + 0.01);
  }

  // Trigger rolling distant thunder
  private triggerRollingThunder(): void {
    const now = this.ctx.currentTime;
    const rumbleDuration = 3.5 + Math.random() * 3.0;

    // Sub-bass oscillator for low earth rumble (30-65Hz)
    const rumbleOsc = this.ctx.createOscillator();
    rumbleOsc.type = 'sawtooth';
    rumbleOsc.frequency.setValueAtTime(45 + Math.random() * 20, now);
    rumbleOsc.frequency.exponentialRampToValueAtTime(28, now + rumbleDuration);

    // Filter to keep it dark and distant
    const rumbleFilter = this.ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.setValueAtTime(120, now);
    rumbleFilter.frequency.linearRampToValueAtTime(60, now + rumbleDuration);

    const rumbleGain = this.ctx.createGain();
    const peakGain = (0.3 + Math.random() * 0.5) * this.thunderGain.gain.value;
    rumbleGain.gain.setValueAtTime(0, now);
    rumbleGain.gain.linearRampToValueAtTime(peakGain, now + 0.8);
    rumbleGain.gain.exponentialRampToValueAtTime(0.0001, now + rumbleDuration);

    rumbleOsc.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(this.thunderGain);

    rumbleOsc.start(now);
    rumbleOsc.stop(now + rumbleDuration + 0.05);
  }

  // Passenger train rhythmic track clatter ("clack-clack... clack-clack")
  private startTrainRhythm(): void {
    let beat = 0;
    this.trainIntervalId = window.setInterval(() => {
      if (!this.isRunning || this.trainGain.gain.value <= 0.01) return;

      const now = this.ctx.currentTime;
      // Pattern: Beat 0 (clack), Beat 1 (clack), Beat 2 (rest), Beat 3 (rest)
      if (beat === 0 || beat === 1) {
        const isSecond = beat === 1;
        const clickOsc = this.ctx.createOscillator();
        clickOsc.type = 'triangle';
        clickOsc.frequency.value = isSecond ? 140 : 180;

        const clickGain = this.ctx.createGain();
        const peak = (isSecond ? 0.25 : 0.4) * this.trainGain.gain.value;
        clickGain.gain.setValueAtTime(peak, now);
        clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 350;
        filter.Q.value = 1.8;

        clickOsc.connect(filter);
        filter.connect(clickGain);
        clickGain.connect(this.trainGain);

        clickOsc.start(now);
        clickOsc.stop(now + 0.07);
      }
      beat = (beat + 1) % 4;
    }, 280);
  }

  // Trigger vinyl needle static and soft cassette clicks
  private triggerVinylCrackle(): void {
    const now = this.ctx.currentTime;
    const dur = 0.003 + Math.random() * 0.006;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 3000 + Math.random() * 4000;

    const gain = this.ctx.createGain();
    const peak = (0.05 + Math.random() * 0.15) * this.vinylGain.gain.value;
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    gain.connect(this.vinylGain);

    osc.start(now);
    osc.stop(now + dur + 0.005);
  }

  // Update mixer levels (values 0 - 100)
  public updateLevels(mix: SoundscapeMix): void {
    const hasAny =
      (mix.rain || 0) > 0 ||
      (mix.fire || 0) > 0 ||
      (mix.brownNoise || 0) > 0 ||
      (mix.drone || 0) > 0 ||
      (mix.thunder || 0) > 0 ||
      (mix.train || 0) > 0 ||
      (mix.waves || 0) > 0 ||
      (mix.vinyl || 0) > 0;

    if (!this.isRunning && hasAny) {
      this.start();
    }

    const now = this.ctx.currentTime;
    const rampTime = 0.15;

    const rainTarget = ((mix.rain || 0) / 100) * 0.6;
    const fireTarget = ((mix.fire || 0) / 100) * 0.7;
    const brownTarget = ((mix.brownNoise || 0) / 100) * 0.5;
    const droneTarget = ((mix.drone || 0) / 100) * 0.55;
    const thunderTarget = ((mix.thunder || 0) / 100) * 0.75;
    const trainTarget = ((mix.train || 0) / 100) * 0.65;
    const wavesTarget = ((mix.waves || 0) / 100) * 0.65;
    const vinylTarget = ((mix.vinyl || 0) / 100) * 0.45;

    this.rainGain.gain.cancelScheduledValues(now);
    this.rainGain.gain.linearRampToValueAtTime(rainTarget, now + rampTime);

    this.fireGain.gain.cancelScheduledValues(now);
    this.fireGain.gain.linearRampToValueAtTime(fireTarget, now + rampTime);

    this.brownNoiseGain.gain.cancelScheduledValues(now);
    this.brownNoiseGain.gain.linearRampToValueAtTime(brownTarget, now + rampTime);

    this.droneGain.gain.cancelScheduledValues(now);
    this.droneGain.gain.linearRampToValueAtTime(droneTarget, now + rampTime);

    this.thunderGain.gain.cancelScheduledValues(now);
    this.thunderGain.gain.linearRampToValueAtTime(thunderTarget, now + rampTime);

    this.trainGain.gain.cancelScheduledValues(now);
    this.trainGain.gain.linearRampToValueAtTime(trainTarget, now + rampTime);

    this.wavesGain.gain.cancelScheduledValues(now);
    this.wavesGain.gain.linearRampToValueAtTime(wavesTarget, now + rampTime);

    this.vinylGain.gain.cancelScheduledValues(now);
    this.vinylGain.gain.linearRampToValueAtTime(vinylTarget, now + rampTime);
  }

  public stop(): void {
    this.isRunning = false;
    if (this.crackleIntervalId) clearInterval(this.crackleIntervalId);
    if (this.thunderIntervalId) clearInterval(this.thunderIntervalId);
    if (this.trainIntervalId) clearInterval(this.trainIntervalId);
    if (this.vinylIntervalId) clearInterval(this.vinylIntervalId);
    this.crackleIntervalId = null;
    this.thunderIntervalId = null;
    this.trainIntervalId = null;
    this.vinylIntervalId = null;

    try {
      this.rainSource?.stop();
      this.brownNoiseSource?.stop();
      this.fireBedSource?.stop();
      this.droneOsc1?.stop();
      this.droneOsc2?.stop();
      this.droneLfo?.stop();
      this.waveNoiseSource?.stop();
      this.waveLfo?.stop();
    } catch {
      // Ignored
    }
  }
}
