// OmniVibe Master Web Audio Engine & Real-Time FFT Analyzer
import { SynthesizedSoundscapes } from './soundscapes';
import { AudioTelemetry, SoundscapeMix } from '../types';

export type AudioSourceType = 'none' | 'soundscapes' | 'local_file' | 'mic' | 'system';

export interface AudioSourceEvent {
  source: AudioSourceType;
  status: 'started' | 'stopped' | 'error';
  message?: string;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private soundscapes: SynthesizedSoundscapes | null = null;

  // Media Element Source for uploaded files (revokes old Object URLs to avoid memory leaks)
  private audioElement: HTMLAudioElement | null = null;
  private mediaElementSource: MediaElementAudioSourceNode | null = null;
  private activeObjectUrl: string | null = null;

  // MediaStream (Mic / System Audio)
  private activeStream: MediaStream | null = null;
  private streamSource: MediaStreamAudioSourceNode | null = null;

  private currentSourceType: AudioSourceType = 'soundscapes';
  private telemetryCallbacks: Set<(telemetry: AudioTelemetry) => void> = new Set();
  private sourceEventCallbacks: Set<(evt: AudioSourceEvent) => void> = new Set();
  private animationFrameId: number | null = null;
  private backgroundIntervalId: number | null = null;
  private visibilityHandler: (() => void) | null = null;
  private fftBuffer: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(512));

  // Peak hold, mute state, & silence detection
  private peakHoldValue = 0;
  private lastSoundTimestamp = Date.now();
  private isMuted = false;
  private userVolume = 0.85;

  // Frequency sensitivity gains & DSP Calibration
  public bassGain = 1.0;
  public midGain = 1.0;
  public trebleGain = 1.0;
  public micNoiseGate = 8; // 0 - 50 %
  public micSensitivity = 1.2; // 0.5 - 3.0 x
  public latencyOffsetMs = 0; // 0 - 250 ms
  public experienceMode: 'calm' | 'party' = 'calm';

  // Ring buffer for audio-to-light latency offset (timestamped telemetry snapshots)
  private latencyBuffer: Array<{ at: number; telemetry: AudioTelemetry }> = [];

  // Current track metadata
  public currentTrackTitle = 'Ambient Studio Generator';
  public isPlaying = false;
  public lastErrorMessage: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.audioElement = new Audio();
      this.audioElement.crossOrigin = 'anonymous';
      this.audioElement.loop = true;
      this.audioElement.addEventListener('ended', () => {
        this.isPlaying = false;
      });
    }
  }

  public subscribeSourceEvent(cb: (evt: AudioSourceEvent) => void): () => void {
    this.sourceEventCallbacks.add(cb);
    return () => {
      this.sourceEventCallbacks.delete(cb);
    };
  }

  private emitSourceEvent(evt: AudioSourceEvent): void {
    this.sourceEventCallbacks.forEach((cb) => {
      try {
        cb(evt);
      } catch {}
    });
  }

  private revokeActiveObjectUrl(): void {
    if (this.activeObjectUrl) {
      try {
        URL.revokeObjectURL(this.activeObjectUrl);
      } catch {}
      this.activeObjectUrl = null;
    }
  }

  // Ensure AudioContext is initialized and resumed
  public async initAudioContext(): Promise<AudioContext> {
    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();

      // Master Analyser
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.minDecibels = -85;
      this.analyser.maxDecibels = -15;
      this.analyser.smoothingTimeConstant = 0.8;
      this.fftBuffer = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));

      // Master Output Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : this.userVolume;

      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      // Initialize Soundscape engine
      this.soundscapes = new SynthesizedSoundscapes(this.ctx, this.masterGain);

      // Connect HTMLAudioElement if present
      if (this.audioElement) {
        this.mediaElementSource = this.ctx.createMediaElementSource(this.audioElement);
        this.mediaElementSource.connect(this.masterGain);
      }

      this.startTelemetryLoop();
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    return this.ctx;
  }

  public getSourceType(): AudioSourceType {
    return this.currentSourceType;
  }

  // Switch to Built-in Soundscape Generation
  public async playSoundscapes(mix: SoundscapeMix): Promise<void> {
    await this.initAudioContext();
    this.stopStreamCapture();
    if (this.audioElement) {
      this.audioElement.pause();
    }
    this.revokeActiveObjectUrl();

    this.lastErrorMessage = null;
    this.currentSourceType = 'soundscapes';
    this.currentTrackTitle = 'Built-In Generative Soundscapes';
    this.isPlaying = true;
    this.soundscapes?.updateLevels(mix);
    this.emitSourceEvent({ source: 'soundscapes', status: 'started' });
  }

  public updateSoundscapeMix(mix: SoundscapeMix): void {
    if (this.currentSourceType === 'soundscapes') {
      this.soundscapes?.updateLevels(mix);
    }
  }

  // Play uploaded audio file (MP3, WAV, FLAC) with automatic Object URL cleanup
  public async playLocalFile(file: File): Promise<void> {
    await this.initAudioContext();
    this.stopStreamCapture();
    this.soundscapes?.updateLevels({ rain: 0, fire: 0, brownNoise: 0, drone: 0 });

    if (this.audioElement) {
      const prevUrl = this.activeObjectUrl;
      const nextUrl = URL.createObjectURL(file);
      this.activeObjectUrl = nextUrl;
      this.audioElement.src = nextUrl;
      this.audioElement.load();
      if (prevUrl) {
        try {
          URL.revokeObjectURL(prevUrl);
        } catch {}
      }
      await this.audioElement.play();
      this.lastErrorMessage = null;
      this.currentSourceType = 'local_file';
      this.currentTrackTitle = file.name.replace(/\.[^/.]+$/, '');
      this.isPlaying = true;
      this.emitSourceEvent({ source: 'local_file', status: 'started', message: this.currentTrackTitle });
    }
  }

  // Enumerate available Microphone & Wired Line-In / USB Audio Interfaces
  public async listAudioInputDevices(): Promise<Array<{ deviceId: string; label: string }>> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      return [];
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices
        .filter((d) => d.kind === 'audioinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Audio Input / Line-In #${idx + 1}`,
        }));
    } catch {
      return [];
    }
  }

  // Capture Microphone or Wired Line-In Audio (handles external permission revocation cleanly)
  public async startMicCapture(deviceId?: string): Promise<boolean> {
    try {
      await this.initAudioContext();
      this.stopStreamCapture();
      if (this.audioElement) this.audioElement.pause();
      this.revokeActiveObjectUrl();
      this.soundscapes?.updateLevels({ rain: 0, fire: 0, brownNoise: 0, drone: 0 });

      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: false,
        autoGainControl: false,
        noiseSuppression: false,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });

      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (this.activeStream === stream) {
            this.stopStreamCapture();
            this.isPlaying = false;
            this.currentSourceType = 'none';
            const msg = 'Microphone / Line-In capture ended or permission was revoked.';
            this.lastErrorMessage = msg;
            this.emitSourceEvent({ source: 'mic', status: 'stopped', message: msg });
          }
        };
      });

      this.activeStream = stream;
      if (this.ctx && this.analyser) {
        this.streamSource = this.ctx.createMediaStreamSource(stream);
        // Connect mic/line-in ONLY to analyser, NOT to speakers (avoids acoustic feedback screech)
        this.streamSource.connect(this.analyser);
      }

      this.lastErrorMessage = null;
      this.currentSourceType = 'mic';
      this.currentTrackTitle = deviceId ? 'Wired Line-In / Audio Interface' : 'Noise-Gated Acoustic Room Mic';
      this.isPlaying = true;
      this.emitSourceEvent({ source: 'mic', status: 'started' });
      return true;
    } catch (err) {
      const msg =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Allow mic access in your browser/OS settings to sync from room audio.'
          : 'Microphone or Line-In audio device could not be opened.';
      this.lastErrorMessage = msg;
      this.emitSourceEvent({ source: 'mic', status: 'error', message: msg });
      return false;
    }
  }

  // Capture System Audio (Spotify, Youtube, Games via getDisplayMedia / Electron desktop loopback)
  public async startSystemAudioCapture(): Promise<boolean> {
    try {
      await this.initAudioContext();
      this.stopStreamCapture();
      if (this.audioElement) this.audioElement.pause();
      this.revokeActiveObjectUrl();
      this.soundscapes?.updateLevels({ rain: 0, fire: 0, brownNoise: 0, drone: 0 });

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      // Stop video track immediately; we only analyze audio
      stream.getVideoTracks().forEach((track) => track.stop());

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        const msg =
          'No system/tab audio track was shared. In the prompt, check "Share system/tab audio" and try again.';
        this.lastErrorMessage = msg;
        this.emitSourceEvent({ source: 'system', status: 'error', message: msg });
        return false;
      }

      audioTracks.forEach((track) => {
        track.onended = () => {
          if (this.activeStream === stream) {
            this.stopStreamCapture();
            this.isPlaying = false;
            this.currentSourceType = 'none';
            const msg = 'System / Tab audio sharing stopped.';
            this.lastErrorMessage = msg;
            this.emitSourceEvent({ source: 'system', status: 'stopped', message: msg });
          }
        };
      });

      this.activeStream = stream;
      if (this.ctx && this.analyser) {
        this.streamSource = this.ctx.createMediaStreamSource(stream);
        this.streamSource.connect(this.analyser);
      }

      this.lastErrorMessage = null;
      this.currentSourceType = 'system';
      this.currentTrackTitle = 'System & Tab Audio Stream (Spotify/OS)';
      this.isPlaying = true;
      this.emitSourceEvent({ source: 'system', status: 'started' });
      return true;
    } catch {
      const msg =
        'System audio capture was cancelled or blocked. Select a browser tab or screen with "Share audio" enabled.';
      this.lastErrorMessage = msg;
      this.emitSourceEvent({ source: 'system', status: 'error', message: msg });
      return false;
    }
  }

  // Stop active mic or system capture cleanly
  private stopStreamCapture(): void {
    if (this.streamSource) {
      try {
        this.streamSource.disconnect();
      } catch {}
      this.streamSource = null;
    }
    if (this.activeStream) {
      this.activeStream.getTracks().forEach((t) => {
        t.onended = null;
        t.stop();
      });
      this.activeStream = null;
    }
  }

  // Master Volume Controls (preserves user volume across Mute / Unmute)
  public setMasterVolume(volPercent: number): void {
    const clamped = Math.max(0, Math.min(100, volPercent)) / 100;
    this.userVolume = clamped;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : clamped, this.ctx.currentTime);
    }
  }

  public getMasterVolume(): number {
    return Math.round(this.userVolume * 100);
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.userVolume, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  public pause(): void {
    if (this.audioElement && this.currentSourceType === 'local_file') {
      this.audioElement.pause();
    }
    if (this.currentSourceType === 'mic' || this.currentSourceType === 'system') {
      this.ctx?.suspend().catch(() => {});
    }
    this.soundscapes?.updateLevels({ rain: 0, fire: 0, brownNoise: 0, drone: 0 });
    this.isPlaying = false;
  }

  public resume(soundscapeMix?: SoundscapeMix): void {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.audioElement && this.currentSourceType === 'local_file') {
      this.audioElement.play().catch(() => {});
      this.isPlaying = true;
    } else if (this.currentSourceType === 'soundscapes' && soundscapeMix) {
      this.soundscapes?.updateLevels(soundscapeMix);
      this.isPlaying = true;
    } else if ((this.currentSourceType === 'mic' || this.currentSourceType === 'system') && this.activeStream) {
      this.isPlaying = true;
    }
  }

  // Register telemetry callback for UI and Visualizer
  public subscribeTelemetry(callback: (telemetry: AudioTelemetry) => void): () => void {
    this.telemetryCallbacks.add(callback);
    return () => {
      this.telemetryCallbacks.delete(callback);
    };
  }

  private processTelemetryFrame(): void {
    if (!this.analyser) return;

    const dataArray = this.fftBuffer;
    this.analyser.getByteFrequencyData(dataArray);

    const sampleRate = this.ctx ? this.ctx.sampleRate : 44100;
    const binCount = dataArray.length;
    const binHz = sampleRate / (binCount * 2);

    // Bass: 20Hz - 250Hz
    const bassStart = Math.floor(20 / binHz);
    const bassEnd = Math.max(bassStart + 1, Math.floor(250 / binHz));

    // Mids: 250Hz - 4000Hz
    const midsStart = bassEnd;
    const midsEnd = Math.floor(4000 / binHz);

    // Treble: 4000Hz - 20000Hz
    const trebleStart = midsEnd;
    const trebleEnd = Math.min(binCount - 1, Math.floor(20000 / binHz));

    let bassSum = 0;
    for (let i = bassStart; i < bassEnd; i++) bassSum += dataArray[i];
    let rawBass = (bassSum / Math.max(1, bassEnd - bassStart) / 255) * 100;

    let midsSum = 0;
    for (let i = midsStart; i < midsEnd; i++) midsSum += dataArray[i];
    let rawMids = (midsSum / Math.max(1, midsEnd - midsStart) / 255) * 100;

    let trebleSum = 0;
    for (let i = trebleStart; i < trebleEnd; i++) trebleSum += dataArray[i];
    let rawTreble = (trebleSum / Math.max(1, trebleEnd - trebleStart) / 255) * 100;

    // Apply Noise Gate & Sensitivity Multiplier (0.5x - 3.0x) when capturing Room Mic / Line-In
    if (this.currentSourceType === 'mic') {
      const gate = Math.max(0, Math.min(50, this.micNoiseGate));
      const mult = Math.max(0.5, Math.min(3.0, this.micSensitivity));
      rawBass = rawBass < gate ? 0 : (rawBass - gate) * mult;
      rawMids = rawMids < gate ? 0 : (rawMids - gate) * mult;
      rawTreble = rawTreble < gate ? 0 : (rawTreble - gate) * mult;
    }

    // Mode-aware FFT smoothing
    this.analyser.smoothingTimeConstant = this.experienceMode === 'party' ? 0.58 : 0.86;

    const bass = Math.min(100, Math.round(rawBass * this.bassGain));
    const mids = Math.min(100, Math.round(rawMids * this.midGain));
    const treble = Math.min(100, Math.round(rawTreble * this.trebleGain));
    const overall = Math.min(100, Math.round(bass * 0.45 + mids * 0.35 + treble * 0.2));

    if (overall > this.peakHoldValue) {
      this.peakHoldValue = overall;
    } else {
      this.peakHoldValue = Math.max(0, this.peakHoldValue - 0.7);
    }

    const now = Date.now();
    if (overall > 3) {
      this.lastSoundTimestamp = now;
    }
    const isSilent = now - this.lastSoundTimestamp > 300000; // 5 min silence

    const currentTelemetry: AudioTelemetry = {
      bass,
      mids,
      treble,
      overall,
      peakHold: Math.round(this.peakHoldValue),
      isSilent,
    };

    // Audio-to-Light Latency Offset ring buffer (0 - 250 ms)
    let emittedTelemetry = currentTelemetry;
    if (this.latencyOffsetMs > 0) {
      this.latencyBuffer.push({ at: now, telemetry: currentTelemetry });
      const targetTime = now - this.latencyOffsetMs;
      while (this.latencyBuffer.length > 1 && this.latencyBuffer[1].at <= targetTime) {
        this.latencyBuffer.shift();
      }
      if (this.latencyBuffer.length > 0 && this.latencyBuffer[0].at <= targetTime) {
        emittedTelemetry = this.latencyBuffer[0].telemetry;
      }
      if (this.latencyBuffer.length > 60) {
        this.latencyBuffer.splice(0, this.latencyBuffer.length - 60);
      }
    } else if (this.latencyBuffer.length > 0) {
      this.latencyBuffer = [];
    }

    this.telemetryCallbacks.forEach((cb) => cb(emittedTelemetry));
  }

  // Real-time FFT processing loop with automatic background-tab fallback timer so room lights never freeze
  private startTelemetryLoop(): void {
    const syncLoopMode = () => {
      const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      if (isHidden) {
        if (this.animationFrameId !== null) {
          cancelAnimationFrame(this.animationFrameId);
          this.animationFrameId = null;
        }
        if (this.backgroundIntervalId === null) {
          this.backgroundIntervalId = window.setInterval(() => {
            this.processTelemetryFrame();
          }, 33);
        }
      } else {
        if (this.backgroundIntervalId !== null) {
          clearInterval(this.backgroundIntervalId);
          this.backgroundIntervalId = null;
        }
        if (this.animationFrameId === null) {
          const rafStep = () => {
            this.processTelemetryFrame();
            this.animationFrameId = requestAnimationFrame(rafStep);
          };
          this.animationFrameId = requestAnimationFrame(rafStep);
        }
      }
    };

    if (typeof document !== 'undefined') {
      this.visibilityHandler = syncLoopMode;
      document.addEventListener('visibilitychange', syncLoopMode);
    }

    syncLoopMode();
  }

  public getRawFrequencyData(): Uint8Array {
    if (!this.analyser) return new Uint8Array(256);
    this.analyser.getByteFrequencyData(this.fftBuffer);
    return this.fftBuffer;
  }

  public destroy(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.backgroundIntervalId !== null) {
      clearInterval(this.backgroundIntervalId);
      this.backgroundIntervalId = null;
    }
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
    this.stopStreamCapture();
    this.revokeActiveObjectUrl();
    this.soundscapes?.stop();
    this.ctx?.close();
  }
}

/**
 * Computes calibrated room light brightness (0.5% - 100%) with:
 * - Decoupled Master Brightness (overall room level stays independent of reactive swing)
 * - Configurable Minimum-Black Floor (0.5% - 15% so lights never snap completely dark between beats)
 * - Experience Mode modulation depth (Calm = gentle 20% swing, Party = punchy 55% beat swing)
 */
export function computeCalibratedLightOutput(
  audioEnergyPercent: number,
  masterBrightnessPercent: number,
  minBlackFloorPercent: number,
  experienceMode: 'calm' | 'party'
): number {
  const master = Math.max(10, Math.min(100, masterBrightnessPercent));
  const floor = Math.max(0.5, Math.min(15, minBlackFloorPercent));
  const energyNorm = Math.max(0, Math.min(100, audioEnergyPercent)) / 100;
  const swingDepth = experienceMode === 'party' ? 0.55 : 0.2;
  const baseLevel = master * (1 - swingDepth * 0.6);
  const modulated = baseLevel + master * swingDepth * energyNorm;
  return Number(Math.max(floor, Math.min(100, modulated)).toFixed(1));
}

// Global audio engine singleton
export const globalAudioEngine = new AudioEngine();
