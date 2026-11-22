import React from 'react';
import { AudioTelemetry, VibePreset, DspCalibrationSettings } from '../types';
import { computeCalibratedLightOutput } from '../audio/AudioEngine';

interface AudioPulseMeterProps {
  telemetry: AudioTelemetry;
  preset: VibePreset;
  dspCalibration?: DspCalibrationSettings;
}

export const AudioPulseMeter: React.FC<AudioPulseMeterProps> = ({
  telemetry,
  preset,
  dspCalibration,
}) => {
  const bands = [
    { label: 'SUB-BASS', range: '20–250Hz', value: telemetry.bass, weight: preset.audioReactivity.bassWeight },
    { label: 'MIDS', range: '250–4kHz', value: telemetry.mids, weight: preset.audioReactivity.midWeight },
    { label: 'TREBLE', range: '4–20kHz', value: telemetry.treble, weight: preset.audioReactivity.trebleWeight },
  ];

  // Convert normalized 0-100 band energy to dB (-30dB floor to 0dB peak)
  const toDbLabel = (val: number) => {
    const db = Math.round(-30 + (Math.max(0, Math.min(100, val)) / 100) * 30);
    return `${db}dB`;
  };

  // Calibrated Room Light Output % using decoupled Master Brightness & Minimum-Black Floor
  const audioEnergy = telemetry.bass * 0.5 + telemetry.mids * 0.3 + telemetry.treble * 0.2;
  const masterBri = dspCalibration?.masterBrightness ?? preset.maxBrightness;
  const minFloor = dspCalibration?.minBlackFloor ?? 2;
  const expMode = dspCalibration?.experienceMode ?? 'calm';
  const effectiveLightOutput = computeCalibratedLightOutput(audioEnergy, masterBri, minFloor, expMode);

  return (
    <div className="hardware-panel p-4 rounded-2xl flex flex-col gap-3 select-none">
      <div className="flex items-center justify-between border-b border-studio-borderSubtle pb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <h3 className="text-sm font-subheading font-bold text-studio-text uppercase tracking-widest">
            Live Frequency Telemetry &amp; Light Flux
          </h3>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono text-studio-textMuted">
          <span>PEAK: <strong className="text-studio-text">{telemetry.peakHold}%</strong></span>
          <span>MODE: <strong className="text-studio-accent uppercase">{preset.audioReactivity.mode.replace('_', ' ')}</strong></span>
        </div>
      </div>

      {/* 3-Band Segmented LED Meter */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-2.5">
        {bands.map((b) => (
          <div key={b.label} className="hardware-card p-3 rounded-xl flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
              <span className="text-studio-text font-semibold whitespace-nowrap">{b.label}</span>
              <span className="text-[10px] text-studio-textMuted whitespace-nowrap">{b.range}</span>
              <span className="text-studio-accent font-bold whitespace-nowrap">{b.value}%</span>
            </div>

            {/* Segmented LED Bar (16 discrete LEDs) */}
            <div className="flex items-center gap-1 h-3.5 bg-black/50 p-1 rounded-md border border-studio-borderSubtle">
              {Array.from({ length: 16 }).map((_, i) => {
                const threshold = (i / 16) * 100;
                const isLit = b.value > threshold;
                let colorClass = 'bg-emerald-500 shadow-emerald-500/50';
                if (i >= 11) colorClass = 'bg-amber-400 shadow-amber-400/50';
                if (i >= 14) colorClass = 'bg-sky-400 shadow-sky-400/50';

                return (
                  <div
                    key={i}
                    className={`flex-1 h-full rounded-sm transition-all duration-75 ${
                      isLit ? `${colorClass} shadow-sm opacity-100` : 'bg-studio-surface opacity-20'
                    }`}
                  />
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-studio-textMuted">
              <span className="whitespace-nowrap">WT {b.weight}x</span>
              <span className="whitespace-nowrap text-studio-text/90 font-semibold">{toDbLabel(b.value)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Live Room Light Output Bar */}
      <div className="hardware-card p-3 rounded-xl flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-4 h-4 rounded-full border border-white/20 transition-all duration-150"
            style={{
              backgroundColor: preset.colors[0] || '#38bdf8',
              boxShadow: `0 0 12px ${preset.colors[0] || '#38bdf8'}`,
            }}
          />
          <div>
            <div className="text-xs font-mono font-medium text-studio-text">
              Simulated Room Light Flux
            </div>
            <div className="text-[10px] text-studio-textMuted font-mono">
              Master: {masterBri}% • Floor: {minFloor}% • Offset: {dspCalibration?.latencyOffsetMs ?? 0}ms
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="flex-1 max-w-xs h-2.5 bg-black/60 rounded-full overflow-hidden border border-studio-borderSubtle">
          <div
            className="h-full rounded-full transition-all duration-100"
            style={{
              width: `${effectiveLightOutput}%`,
              background: `linear-gradient(90deg, ${preset.colors[0] || '#38bdf8'}, ${
                preset.colors[1] || '#818cf8'
              })`,
              boxShadow: `0 0 8px ${preset.colors[0] || '#38bdf8'}`,
            }}
          />
        </div>

        <span className="text-xs font-mono font-bold text-studio-text">
          {effectiveLightOutput}%
        </span>
      </div>
    </div>
  );
};
