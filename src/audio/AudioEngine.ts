// OmniVibe Master Web Audio Engine & Real-Time FFT Analyzer
import { SynthesizedSoundscapes } from './soundscapes';
import { AudioTelemetry, SoundscapeMix } from '../types';

export type AudioSourceType = 'none' | 'soundscapes' | 'local_file' | 'mic' | 'system';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private soundscapes: SynthesizedSoundscapes | null = null;

  // Media Element Source for uploaded files
  private audioElement: HTMLAudioElement | null = null;
  private mediaElementSource: MediaElementAudioSourceNode | null = null;

  // MediaStream (Mic / System Audio)
  private activeStream: MediaStream | null = null;
  private streamSource: MediaStreamAudioSourceNode | null = null;

  private currentSourceType: AudioSourceType = 'soundscapes';
  private telemetryCallbacks: Set<(telemetry: AudioTelemetry) => void> = new Set();
  private animationFrameId: number | null = null;

  // Peak hold & silence detection
  private peakHoldValue = 0;
  private lastSoundTimestamp = Date.now();
  private isMuted = false;

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

  constructor() {
    // Setup audio element for local file playback
    if (typeof window !== 'undefined') {
      this.audioElement = new Audio();
      this.audioElement.crossOrigin = 'anonymous';
      this.audioElement.loop = true;
      this.audioElement.addEventListener('ended', () => {
        this.isPlaying = false;
      });
    }
  }

  // Ensure AudioContext is initialized and resumed
  public async initAudioContext(): Promise<AudioContext> {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();

      // Master Analyser
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.minDecibels = -85;
      this.analyser.maxDecibels = -15;
      this.analyser.smoothingTimeConstant = 0.8;

      // Master Output Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.85;

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

    this.currentSourceType = 'soundscapes';
    this.currentTrackTitle = 'Built-In Generative Soundscapes';
    this.isPlaying = true;
    this.soundscapes?.updateLevels(mix);
  }

  public updateSoundscapeMix(mix: SoundscapeMix): void {
    if (this.currentSourceType === 'soundscapes') {
      this.soundscapes?.updateLevels(mix);
    }
  }

  // Play uploaded audio file (MP3, WAV, FLAC)
  public async playLocalFile(file: File): Promise<void> {
    await this.initAudioContext();
    this.stopStreamCapture();
    this.soundscapes?.updateLevels({ rain: 0, fire: 0, brownNoise: 0, drone: 0 });

    if (this.audioElement) {
      const fileUrl = URL.createObjectURL(file);
      this.audioElement.src = fileUrl;
      this.audioElement.load();
      await this.audioElement.play();
      this.currentSourceType = 'local_file';
      this.currentTrackTitle = file.name.replace(/\.[^/.]+$/, '');
      this.isPlaying = true;
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

  // Capture Microphone or Wired Line-In Audio (Room / Speaker Fallback with Noise Gate & Sensitivity)
  public async startMicCapture(deviceId?: string): Promise<boolean> {
    try {
      await this.initAudioContext();
      this.stopStreamCapture();
      if (this.audioElement) this.audioElement.pause();
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

      this.activeStream = stream;
      if (this.ctx && this.analyser) {
        this.streamSource = this.ctx.createMediaStreamSource(stream);
        // Connect mic/line-in ONLY to analyser, NOT to speakers (to avoid feedback screech!)
        this.streamSource.connect(this.analyser);
      }

      this.currentSourceType = 'mic';
      this.currentTrackTitle = deviceId ? 'Wired Line-In / Audio Interface' : 'Noise-Gated Acoustic Room Mic';
      this.isPlaying = true;
      return true;
    } catch (err) {
      console.warn('Microphone / Line-In capture failed or permission denied:', err);
      return false;
    }
  }

  // Capture System Audio (Spotify, Youtube, Games via getDisplayMedia)
  public async startSystemAudioCapture(): Promise<boolean> {
    try {
      await this.initAudioContext();
      this.stopStreamCapture();
      if (this.audioElement) this.audioElement.pause();
      this.soundscapes?.updateLevels({ rain: 0, fire: 0, brownNoise: 0, drone: 0 });

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      // Stop video track immediately, we only need audio
      stream.getVideoTracks().forEach((track) => track.stop());

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        console.warn('No audio track selected in screen capture');
        return false;
      }

      this.activeStream = stream;
      if (this.ctx && this.analyser) {
        this.streamSource = this.ctx.createMediaStreamSource(stream);
        // Connect system audio capture directly to analyzer
        this.streamSource.connect(this.analyser);
      }

      this.currentSourceType = 'system';
      this.currentTrackTitle = 'System & Tab Audio Stream (Spotify/OS)';
      this.isPlaying = true;
      return true;
    } catch (err) {
      console.warn('System audio capture failed or cancelled:', err);
      return false;
    }
  }

  // Stop active mic or system capture
  private stopStreamCapture(): void {
    if (this.streamSource) {
      try {
        this.streamSource.disconnect();
      } catch {}
      this.streamSource = null;
    }
    if (this.activeStream) {
      this.activeStream.getTracks().forEach((t) => t.stop());
      this.activeStream = null;
    }
  }

  // Master Volume Controls
  public setMasterVolume(volPercent: number): void {
    if (this.masterGain && this.ctx) {
      const clamped = Math.max(0, Math.min(100, volPercent)) / 100;
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : clamped, this.ctx.currentTime);
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.85, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  public pause(): void {
    if (this.audioElement && this.currentSourceType === 'local_file') {
      this.audioElement.pause();
    }
    this.soundscapes?.updateLevels({ rain: 0, fire: 0, brownNoise: 0, drone: 0 });
    this.isPlaying = false;
  }

  public resume(soundscapeMix?: SoundscapeMix): void {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
    if (this.audioElement && this.currentSourceType === 'local_file') {
      this.audioElement.play();
      this.isPlaying = true;
    } else if (this.currentSourceType === 'soundscapes' && soundscapeMix) {
      this.soundscapes?.updateLevels(soundscapeMix);
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

  // Main real-time FFT processing loop (60fps)
  private startTelemetryLoop(): void {
    const dataArray = new Uint8Array(this.analyser ? this.analyser.frequencyBinCount : 512);

    const step = () => {
      if (this.analyser) {
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

        // Mode-aware FFT smoothing (Calm = smoother low-flicker, Party = punchy fast reactivity)
        if (this.analyser) {
          this.analyser.smoothingTimeConstant = this.experienceMode === 'party' ? 0.58 : 0.86;
        }

        // Apply adjustable frequency gains
        const bass = Math.min(100, Math.round(rawBass * this.bassGain));
        const mids = Math.min(100, Math.round(rawMids * this.midGain));
        const treble = Math.min(100, Math.round(rawTreble * this.trebleGain));
        const overall = Math.min(100, Math.round(bass * 0.45 + mids * 0.35 + treble * 0.2));

        // Peak hold decay
        if (overall > this.peakHoldValue) {
          this.peakHoldValue = overall;
        } else {
          this.peakHoldValue = Math.max(0, this.peakHoldValue - 0.7);
        }

        // Silence detection (under 3% energy)
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

      this.animationFrameId = requestAnimationFrame(step);
    };

    this.animationFrameId = requestAnimationFrame(step);
  }

  public getRawFrequencyData(): Uint8Array {
    if (!this.analyser) return new Uint8Array(256);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  public destroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.stopStreamCapture();
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
