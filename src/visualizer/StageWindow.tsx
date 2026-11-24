import React, { useEffect, useState } from 'react';
import { VisualizerStage } from './VisualizerStage';
import {
  VibePreset,
  AudioTelemetry,
  VisualizerMode,
  VisualizerSettings,
  StageBroadcastMessage,
} from '../types';
import { DEFAULT_PRESETS, DEFAULT_VISUALIZER_SETTINGS } from '../data/defaultPresets';
import { globalAudioEngine } from '../audio/AudioEngine';
import { Tv, ArrowLeft, Maximize2 } from 'lucide-react';

export const StageWindow: React.FC = () => {
  const [preset, setPreset] = useState<VibePreset>(DEFAULT_PRESETS[0]);
  const [telemetry, setTelemetry] = useState<AudioTelemetry>({
    bass: 0,
    mids: 0,
    treble: 0,
    overall: 0,
    peakHold: 0,
    isSilent: false,
  });
  const [mode, setMode] = useState<VisualizerMode>('liquid_waveforms');
  const [settings, setSettings] = useState<VisualizerSettings>(DEFAULT_VISUALIZER_SETTINGS);
  const [isSynced, setIsSynced] = useState<boolean>(false);

  useEffect(() => {
    // Subscribe to local audio engine telemetry
    const unsubscribe = globalAudioEngine.subscribeTelemetry((t) => {
      setTelemetry(t);
    });

    // Listen to BroadcastChannel from main dashboard
    try {
      const channel = new BroadcastChannel('omnivibe-stage-channel');
      channel.onmessage = (event: MessageEvent<StageBroadcastMessage>) => {
        if (event.data && event.data.type === 'STAGE_SYNC') {
          setIsSynced(true);
          if (event.data.preset) setPreset(event.data.preset);
          if (event.data.telemetry) setTelemetry(event.data.telemetry);
          if (event.data.visualizerMode) setMode(event.data.visualizerMode);
          if (event.data.visualizerSettings) setSettings(event.data.visualizerSettings);
        }
      };

      return () => {
        channel.close();
        unsubscribe();
      };
    } catch {
      return () => {
        unsubscribe();
      };
    }
  }, []);

  const handleReturnToDashboard = () => {
    if (window.opener && !window.opener.closed) {
      window.close();
      return;
    }
    window.location.href = '/studio';
  };

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black overflow-hidden flex flex-col select-none">
      {/* Visualizer Stage Canvas */}
      <VisualizerStage
        mode={mode}
        preset={preset}
        telemetry={telemetry}
        settings={settings}
        isStageWindow={true}
        onModeChange={(m) => setMode(m)}
      />

      {/* Floating Cast Status Pill (Auto-hides) */}
      <div className="absolute top-4 right-4 z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-studio-surface/80 backdrop-blur-md border border-studio-border text-xs font-mono text-studio-text opacity-70 hover:opacity-100 transition-opacity">
        <Tv className="w-3.5 h-3.5 text-studio-accent" />
        <span>{isSynced ? 'BROADCAST SYNCED' : 'STANDALONE STAGE'}</span>
        <button
          onClick={handleReturnToDashboard}
          className="ml-2 flex items-center gap-1 text-[11px] text-studio-textMuted hover:text-studio-text"
        >
          <ArrowLeft className="w-3 h-3" />
          <span>Exit</span>
        </button>
      </div>
    </div>
  );
};
