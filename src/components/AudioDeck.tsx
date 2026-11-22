import React, { useState, useRef, useEffect } from 'react';
import { globalAudioEngine, AudioSourceType } from '../audio/AudioEngine';
import { SoundscapeMix, DspCalibrationSettings, LatencyProfileId } from '../types';
import { DEFAULT_DSP_CALIBRATION } from '../utils/storage';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Mic,
  Monitor,
  Upload,
  Radio,
  CloudRain,
  Flame,
  Waves,
  Disc3,
  Music,
  CloudLightning,
  TramFront,
  Wind,
  Moon,
  Timer,
  Check,
} from 'lucide-react';

interface AudioDeckProps {
  soundscapeMix: SoundscapeMix;
  onMixChange: (mix: SoundscapeMix) => void;
  dspCalibration?: DspCalibrationSettings;
  onUpdateDspCalibration?: (next: DspCalibrationSettings) => void;
}

export const AudioDeck: React.FC<AudioDeckProps> = ({
  soundscapeMix,
  onMixChange,
  dspCalibration = DEFAULT_DSP_CALIBRATION,
  onUpdateDspCalibration,
}) => {
  const [sourceType, setSourceType] = useState<AudioSourceType>('soundscapes');
  const [inputDevices, setInputDevices] = useState<Array<{ deviceId: string; label: string }>>([]);

  useEffect(() => {
    globalAudioEngine.micNoiseGate = dspCalibration.micNoiseGate;
    globalAudioEngine.micSensitivity = dspCalibration.micSensitivity;
    globalAudioEngine.latencyOffsetMs = dspCalibration.latencyOffsetMs;
    globalAudioEngine.experienceMode = dspCalibration.experienceMode;
  }, [dspCalibration]);

  const updateDsp = (patch: Partial<DspCalibrationSettings>) => {
    onUpdateDspCalibration?.({ ...dspCalibration, ...patch });
  };

  const applyLatencyProfile = (profile: LatencyProfileId) => {
    const presetMs: Record<LatencyProfileId, number> = {
      wired: 0,
      tv_soundbar: 85,
      bluetooth: 140,
      custom: dspCalibration.latencyOffsetMs,
    };
    updateDsp({ latencyProfile: profile, latencyOffsetMs: presetMs[profile] });
  };
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [trackTitle, setTrackTitle] = useState<string>('Built-In Generative Soundscapes');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [showEmbedModal, setShowEmbedModal] = useState<boolean>(false);
  const [embedUrl, setEmbedUrl] = useState<string>('');
  const [embedError, setEmbedError] = useState<string | null>(null);

  const handleEmbedSubmit = () => {
    const trimmed = embedUrl.trim();
    if (!trimmed) {
      setEmbedError('Please paste a Spotify track/playlist URL or YouTube video URL / ID.');
      return;
    }
    const isSpotify = /^https?:\/\/(open\.)?spotify\.com\/(track|playlist|album|episode|show)\/[A-Za-z0-9]+/i.test(trimmed);
    const isYouTubeUrl = /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)[A-Za-z0-9_-]{11}/i.test(trimmed);
    const isYouTubeId = /^[A-Za-z0-9_-]{11}$/.test(trimmed);

    if (!isSpotify && !isYouTubeUrl && !isYouTubeId) {
      setEmbedError('Invalid link. Enter a Spotify URL (open.spotify.com/...) or YouTube video URL / 11-character ID.');
      return;
    }

    setEmbedError(null);
    setShowEmbedModal(false);
  };

  // Bedtime Sleep Timer (Auto Fade-Out) State
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepTimeLeftSec, setSleepTimeLeftSec] = useState<number | null>(null);
  const [showSleepMenu, setShowSleepMenu] = useState<boolean>(false);

  // Sleep Timer countdown & linear volume fade-out
  React.useEffect(() => {
    if (sleepTimerMinutes === null) {
      setSleepTimeLeftSec(null);
      return;
    }

    const durationSec = sleepTimerMinutes * 60;
    const targetTimestamp = Date.now() + durationSec * 1000;
    setSleepTimeLeftSec(durationSec);

    const interval = setInterval(() => {
      const diff = Math.max(0, Math.round((targetTimestamp - Date.now()) / 1000));
      setSleepTimeLeftSec(diff);

      // Smooth linear fade-out during final 60 seconds
      if (diff <= 60 && diff > 0) {
        const fadeFactor = diff / 60;
        globalAudioEngine.setMasterVolume(Math.round(volume * fadeFactor));
      }

      if (diff === 0) {
        clearInterval(interval);
        globalAudioEngine.pause();
        setIsPlaying(false);
        setSleepTimerMinutes(null);
        setSleepTimeLeftSec(null);
        globalAudioEngine.setMasterVolume(volume);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sleepTimerMinutes, volume]);

  const formatSleepTime = (sec: number | null): string => {
    if (sec === null) return 'Sleep Timer';
    if (sec <= 60) return `Fading (${sec}s)`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Play / Pause Toggle
  const handleTogglePlay = async () => {
    if (isPlaying) {
      globalAudioEngine.pause();
      setIsPlaying(false);
    } else {
      if (sourceType === 'soundscapes') {
        await globalAudioEngine.playSoundscapes(soundscapeMix);
      } else {
        globalAudioEngine.resume(soundscapeMix);
      }
      setIsPlaying(true);
      setTrackTitle(globalAudioEngine.currentTrackTitle);
    }
  };

  // Switch to Soundscapes
  const handleSelectSoundscapes = async () => {
    setSourceType('soundscapes');
    await globalAudioEngine.playSoundscapes(soundscapeMix);
    setIsPlaying(true);
    setTrackTitle('Built-In Generative Soundscapes');
  };

  // Switch to Noise-Gated Acoustic Room Mic or Wired Line-In
  const handleSelectMic = async (deviceId?: string) => {
    const success = await globalAudioEngine.startMicCapture(deviceId);
    if (success) {
      setSourceType('mic');
      setIsPlaying(true);
      setTrackTitle(deviceId ? 'Wired Line-In / Audio Interface' : 'Noise-Gated Acoustic Room Mic');
      const devs = await globalAudioEngine.listAudioInputDevices();
      setInputDevices(devs);
      if (deviceId) updateDsp({ selectedInputDeviceId: deviceId });
    }
  };

  // Switch to System Audio Capture
  const handleSelectSystem = async () => {
    const success = await globalAudioEngine.startSystemAudioCapture();
    if (success) {
      setSourceType('system');
      setIsPlaying(true);
      setTrackTitle('System Audio Stream (Spotify/Apple Music)');
    }
  };

  // Handle Local File Upload
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    await globalAudioEngine.playLocalFile(file);
    setSourceType('local_file');
    setIsPlaying(true);
    setTrackTitle(file.name.replace(/\.[^/.]+$/, ''));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    globalAudioEngine.setMasterVolume(val);
  };

  const handleToggleMute = () => {
    const muted = globalAudioEngine.toggleMute();
    setIsMuted(muted);
  };

  const handleFaderChange = (key: keyof SoundscapeMix, val: number) => {
    const nextMix = { ...soundscapeMix, [key]: val };
    onMixChange(nextMix);
    globalAudioEngine.updateSoundscapeMix(nextMix);
  };

  return (
    <div className="hardware-panel p-4 rounded-2xl flex flex-col gap-4 select-none">
      {/* Top Deck Header & Source Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-borderSubtle pb-3">
        <div className="flex items-center gap-2">
          <Disc3 className={`w-4 h-4 text-studio-accent ${isPlaying ? 'animate-spin-slow' : ''}`} />
          <h3 className="text-sm font-subheading font-bold text-studio-text uppercase tracking-widest">
            Multi-Source Audio Engine
          </h3>
        </div>

        {/* Source Mode Selector Pills */}
        <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-studio-borderSubtle">
          <button
            onClick={handleSelectSoundscapes}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
              sourceType === 'soundscapes'
                ? 'bg-studio-accent text-black font-semibold shadow-sm'
                : 'text-studio-textMuted hover:text-studio-text'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Generative</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
              sourceType === 'local_file'
                ? 'bg-studio-accent text-black font-semibold shadow-sm'
                : 'text-studio-textMuted hover:text-studio-text'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Local File</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/mp3,audio/wav,audio/flac,audio/ogg"
            className="hidden"
            onChange={(e) => handleFileUpload(e.target.files)}
          />

          <button
            onClick={() => handleSelectMic(dspCalibration.selectedInputDeviceId)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
              sourceType === 'mic'
                ? 'bg-studio-accent text-black font-semibold shadow-sm'
                : 'text-studio-textMuted hover:text-studio-text'
            }`}
            title="Noise-Gated Acoustic Room Mic or Wired Line-In (Mobile & Speaker Fallback)"
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Mic / Line-In</span>
          </button>

          <button
            onClick={handleSelectSystem}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
              sourceType === 'system'
                ? 'bg-studio-accent text-black font-semibold shadow-sm'
                : 'text-studio-textMuted hover:text-studio-text'
            }`}
            title="Desktop System Loopback / Tab Audio (Windows & macOS)"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Loopback</span>
          </button>

          <button
            onClick={() => setShowEmbedModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono text-studio-textMuted hover:text-studio-text"
            title="Spotify / YouTube Embed"
          >
            <Music className="w-3.5 h-3.5" />
            <span>Embed</span>
          </button>
        </div>
      </div>

      {/* Main Transport Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 hardware-card p-3 rounded-xl">
        <div className="flex items-center gap-3">
          <button
            onClick={handleTogglePlay}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              isPlaying
                ? 'bg-studio-accent text-black shadow-lg shadow-studio-accent/30 hover:scale-105'
                : 'bg-studio-elevated text-studio-text hover:bg-studio-border'
            }`}
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>

          <div>
            <div className="text-xs font-mono font-bold text-studio-text truncate max-w-[200px] md:max-w-[320px]">
              {trackTitle}
            </div>
            <div className="text-[10px] font-mono text-studio-textMuted flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
              <span>{isPlaying ? 'ACTIVE ANALYZER FEED (FFT 1024)' : 'STANDBY'}</span>
            </div>
          </div>
        </div>

        {/* Sleep Timer & Master Output Volume */}
        <div className="flex items-center gap-3">
          {/* Bedtime Sleep Timer Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSleepMenu(!showSleepMenu)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-mono border transition-all ${
                sleepTimerMinutes !== null
                  ? 'bg-amber-500/20 border-amber-500/60 text-amber-300 font-bold shadow-sm'
                  : 'bg-black/30 border-studio-borderSubtle text-studio-textMuted hover:text-studio-text hover:border-studio-border'
              }`}
              title="Sleep Timer: Automatically fades out soundscape after specified duration"
            >
              <Moon className={`w-3.5 h-3.5 ${sleepTimerMinutes !== null ? 'text-amber-400 animate-pulse' : ''}`} />
              <span>{formatSleepTime(sleepTimeLeftSec)}</span>
            </button>

            {showSleepMenu && (
              <div className="absolute right-0 mt-2 py-1.5 w-40 bg-[#0c0f18] border border-studio-border rounded-xl shadow-2xl z-50 text-xs font-mono">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-studio-textMuted font-bold border-b border-studio-borderSubtle flex items-center justify-between">
                  <span>Sleep Fade-Out</span>
                  <Timer className="w-3 h-3 text-studio-accent" />
                </div>
                {[
                  { label: 'Off', minutes: null },
                  { label: '15 Minutes', minutes: 15 },
                  { label: '30 Minutes', minutes: 30 },
                  { label: '45 Minutes', minutes: 45 },
                  { label: '60 Minutes', minutes: 60 },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => {
                      setSleepTimerMinutes(opt.minutes);
                      setShowSleepMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 hover:bg-studio-surface transition-colors flex items-center justify-between ${
                      sleepTimerMinutes === opt.minutes
                        ? 'text-amber-400 font-bold bg-amber-500/10'
                        : 'text-studio-text'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {sleepTimerMinutes === opt.minutes && <Check className="w-3.5 h-3.5 text-amber-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Master Output Volume Slider */}
          <div className="flex items-center gap-2 min-w-[150px]">
            <button
              onClick={handleToggleMute}
              className="p-1.5 rounded-lg text-studio-textMuted hover:text-studio-text hover:bg-studio-surface"
              title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
            >
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-amber-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="100"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-20 sm:w-24 accent-studio-accent h-1.5 bg-black/50 rounded-lg cursor-pointer"
            />
            <span className="text-xs font-mono font-medium text-studio-textMuted w-7 text-right">
              {isMuted ? '0%' : `${volume}%`}
            </span>
          </div>
        </div>
      </div>

      {/* Experience Mode & DSP / Latency Calibration Deck */}
      <div className="hardware-card p-3 rounded-xl flex flex-col gap-3 border border-studio-borderSubtle">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-studio-borderSubtle">
            <button
              type="button"
              onClick={() => updateDsp({ experienceMode: 'calm' })}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all cursor-pointer ${
                dspCalibration.experienceMode === 'calm'
                  ? 'bg-sky-500/25 border border-sky-400/50 text-sky-200'
                  : 'text-studio-textMuted hover:text-studio-text'
              }`}
            >
              Calm / Ambient Mode
            </button>
            <button
              type="button"
              onClick={() => updateDsp({ experienceMode: 'party' })}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all cursor-pointer ${
                dspCalibration.experienceMode === 'party'
                  ? 'bg-amber-400/20 border border-amber-400/50 text-amber-300'
                  : 'text-studio-textMuted hover:text-studio-text'
              }`}
            >
              Party / Beat-Reactive
            </button>
          </div>

          {/* Savable Audio-to-Light Latency Profiles */}
          <div className="flex items-center gap-1 text-[10px] font-mono">
            {(
              [
                { id: 'wired', label: 'Wired (0ms)' },
                { id: 'tv_soundbar', label: 'TV (85ms)' },
                { id: 'bluetooth', label: 'BT (140ms)' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyLatencyProfile(p.id)}
                className={`px-2 py-1 rounded-lg border transition-all cursor-pointer whitespace-nowrap ${
                  dspCalibration.latencyProfile === p.id
                    ? 'bg-studio-accent/20 border-studio-accent text-studio-accent font-bold'
                    : 'bg-black/30 border-studio-borderSubtle text-studio-textMuted hover:text-studio-text'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Audio-to-Light Latency Offset */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-studio-textMuted">Latency Offset</span>
              <span className="text-studio-accent font-bold">{dspCalibration.latencyOffsetMs} ms</span>
            </div>
            <input
              type="range"
              min="0"
              max="250"
              step="5"
              value={dspCalibration.latencyOffsetMs}
              onChange={(e) =>
                updateDsp({ latencyOffsetMs: Number(e.target.value), latencyProfile: 'custom' })
              }
              className="w-full accent-studio-accent h-1.5 bg-black/60 rounded-lg cursor-pointer"
            />
          </div>

          {/* Decoupled Master Brightness */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-studio-textMuted">Master Brightness</span>
              <span className="text-studio-text font-bold">{dspCalibration.masterBrightness}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              step="1"
              value={dspCalibration.masterBrightness}
              onChange={(e) => updateDsp({ masterBrightness: Number(e.target.value) })}
              className="w-full accent-amber-400 h-1.5 bg-black/60 rounded-lg cursor-pointer"
            />
          </div>

          {/* Configurable Minimum-Black Floor */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-studio-textMuted">Min-Black Floor</span>
              <span className="text-emerald-300 font-bold">{dspCalibration.minBlackFloor}%</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="15"
              step="0.5"
              value={dspCalibration.minBlackFloor}
              onChange={(e) => updateDsp({ minBlackFloor: Number(e.target.value) })}
              className="w-full accent-emerald-400 h-1.5 bg-black/60 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {/* Noise-Gated Room Mic & Wired Line-In Calibration Controls */}
        {sourceType === 'mic' && (
          <div className="pt-2.5 border-t border-studio-borderSubtle grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-studio-textMuted">Mic Noise Gate</span>
                <span className="text-sky-300 font-bold">{dspCalibration.micNoiseGate}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                step="1"
                value={dspCalibration.micNoiseGate}
                onChange={(e) => updateDsp({ micNoiseGate: Number(e.target.value) })}
                className="w-full accent-sky-400 h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-studio-textMuted">Mic Sensitivity</span>
                <span className="text-amber-300 font-bold">{dspCalibration.micSensitivity.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.1"
                value={dspCalibration.micSensitivity}
                onChange={(e) => updateDsp({ micSensitivity: Number(e.target.value) })}
                className="w-full accent-amber-400 h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-mono text-studio-textMuted">Input / Wired Line-In</span>
              <select
                value={dspCalibration.selectedInputDeviceId || ''}
                onChange={(e) => handleSelectMic(e.target.value || undefined)}
                className="px-2 py-1 rounded-lg bg-black/60 border border-studio-border text-[11px] font-mono text-studio-text focus:outline-none focus:border-studio-accent"
              >
                <option value="">System Default Mic</option>
                {inputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Tactile Soundscape Synthesizer Mixer (Active in Generative mode) */}
      {sourceType === 'soundscapes' && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-mono text-studio-textMuted uppercase flex items-center justify-between">
            <span>Synthesized Generative Soundscapes</span>
            <span className="text-studio-accent">100% Web Audio Synthesized</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Rain Fader */}
            <div className="hardware-card p-2.5 rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="flex items-center gap-1 text-studio-textMuted">
                  <CloudRain className="w-3.5 h-3.5 text-sky-400" />
                  Rain
                </span>
                <span className="text-studio-text font-bold">{soundscapeMix.rain}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={soundscapeMix.rain}
                onChange={(e) => handleFaderChange('rain', Number(e.target.value))}
                className="w-full accent-sky-400 h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>

            {/* Rolling Thunder Fader */}
            <div className="hardware-card p-2.5 rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="flex items-center gap-1 text-studio-textMuted">
                  <CloudLightning className="w-3.5 h-3.5 text-yellow-400" />
                  Thunder
                </span>
                <span className="text-studio-text font-bold">{soundscapeMix.thunder ?? 0}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={soundscapeMix.thunder ?? 0}
                onChange={(e) => handleFaderChange('thunder', Number(e.target.value))}
                className="w-full accent-yellow-400 h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>

            {/* Hearth Fire Fader */}
            <div className="hardware-card p-2.5 rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="flex items-center gap-1 text-studio-textMuted">
                  <Flame className="w-3.5 h-3.5 text-amber-500" />
                  Hearth Fire
                </span>
                <span className="text-studio-text font-bold">{soundscapeMix.fire}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={soundscapeMix.fire}
                onChange={(e) => handleFaderChange('fire', Number(e.target.value))}
                className="w-full accent-amber-500 h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>

            {/* Passenger Train Fader */}
            <div className="hardware-card p-2.5 rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="flex items-center gap-1 text-studio-textMuted">
                  <TramFront className="w-3.5 h-3.5 text-amber-400" />
                  Night Train
                </span>
                <span className="text-studio-text font-bold">{soundscapeMix.train ?? 0}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={soundscapeMix.train ?? 0}
                onChange={(e) => handleFaderChange('train', Number(e.target.value))}
                className="w-full accent-amber-400 h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>

            {/* Brown Noise Fader */}
            <div className="hardware-card p-2.5 rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="flex items-center gap-1 text-studio-textMuted">
                  <Waves className="w-3.5 h-3.5 text-purple-400" />
                  Brown Noise
                </span>
                <span className="text-studio-text font-bold">{soundscapeMix.brownNoise}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={soundscapeMix.brownNoise}
                onChange={(e) => handleFaderChange('brownNoise', Number(e.target.value))}
                className="w-full accent-purple-400 h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>

            {/* Ocean Waves Fader */}
            <div className="hardware-card p-2.5 rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="flex items-center gap-1 text-studio-textMuted">
                  <Wind className="w-3.5 h-3.5 text-cyan-400" />
                  Ocean Waves
                </span>
                <span className="text-studio-text font-bold">{soundscapeMix.waves ?? 0}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={soundscapeMix.waves ?? 0}
                onChange={(e) => handleFaderChange('waves', Number(e.target.value))}
                className="w-full accent-cyan-400 h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>

            {/* Analog Drone Fader */}
            <div className="hardware-card p-2.5 rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="flex items-center gap-1 text-studio-textMuted">
                  <Radio className="w-3.5 h-3.5 text-emerald-400" />
                  Analog Drone
                </span>
                <span className="text-studio-text font-bold">{soundscapeMix.drone}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={soundscapeMix.drone}
                onChange={(e) => handleFaderChange('drone', Number(e.target.value))}
                className="w-full accent-emerald-400 h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>

            {/* Vinyl & Cassette Warmth Fader */}
            <div className="hardware-card p-2.5 rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="flex items-center gap-1 text-studio-textMuted">
                  <Disc3 className="w-3.5 h-3.5 text-rose-400" />
                  Vinyl Warmth
                </span>
                <span className="text-studio-text font-bold">{soundscapeMix.vinyl ?? 0}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={soundscapeMix.vinyl ?? 0}
                onChange={(e) => handleFaderChange('vinyl', Number(e.target.value))}
                className="w-full accent-rose-400 h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Drag & Drop Overlay Zone for Local Files */}
      {sourceType === 'local_file' && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFileUpload(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-studio-accent bg-studio-accent/10'
              : 'border-studio-border hover:border-studio-accent hover:bg-studio-surface'
          }`}
        >
          <Upload className="w-6 h-6 text-studio-accent mx-auto mb-1.5" />
          <p className="text-xs font-mono text-studio-text">
            Drop your MP3, FLAC, or WAV audio file here or click to browse
          </p>
          <p className="text-[10px] font-mono text-studio-textMuted mt-0.5">
            Processed 100% locally in browser memory with zero server uploads
          </p>
        </div>
      )}

      {/* Spotify / YouTube Embed Modal */}
      {showEmbedModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="hardware-panel max-w-lg w-full p-5 rounded-2xl flex flex-col gap-4 border border-studio-border">
            <div className="flex items-center justify-between border-b border-studio-borderSubtle pb-2">
              <h4 className="text-sm font-mono font-bold text-studio-text">
                Connect Spotify or YouTube Embed
              </h4>
              <button
                onClick={() => {
                  setEmbedError(null);
                  setShowEmbedModal(false);
                }}
                className="text-xs text-studio-textMuted hover:text-studio-text"
              >
                ✕ Close
              </button>
            </div>

            <p className="text-xs text-studio-textMuted">
              Paste a Spotify Track/Playlist link or YouTube Video ID. For true audio reactivity with Spotify, select <strong>&quot;System/Tab&quot;</strong> in the audio source bar to sync frequencies live!
            </p>

            <div className="flex flex-col gap-1.5">
              <input
                type="text"
                placeholder="e.g., https://open.spotify.com/playlist/... or YouTube ID"
                value={embedUrl}
                onChange={(e) => {
                  setEmbedUrl(e.target.value);
                  if (embedError) setEmbedError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleEmbedSubmit();
                  }
                }}
                aria-invalid={Boolean(embedError)}
                className={`w-full px-3 py-2 rounded-xl bg-black/60 border text-xs font-mono text-studio-text focus:outline-none ${
                  embedError
                    ? 'border-amber-400 focus:border-amber-300'
                    : 'border-studio-border focus:border-studio-accent'
                }`}
              />
              {embedError && (
                <p role="alert" className="text-[11px] font-mono text-amber-300">
                  {embedError}
                </p>
              )}
            </div>

            {embedUrl && embedUrl.includes('spotify.com') && (
              <div className="w-full aspect-video rounded-xl overflow-hidden">
                <iframe
                  src={embedUrl.replace('open.spotify.com/', 'open.spotify.com/embed/')}
                  width="100%"
                  height="100%"
                  allow="encrypted-media"
                  className="border-0"
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleEmbedSubmit}
              className="w-full py-2 rounded-xl bg-studio-accent text-black font-mono font-semibold text-xs hover:opacity-90 transition-opacity cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
