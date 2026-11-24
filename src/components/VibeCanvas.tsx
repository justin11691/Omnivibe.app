import React, { useState } from 'react';
import { VibePreset } from '../types';
import {
  Brain,
  GlassWater,
  Sun,
  Zap,
  CloudRain,
  Flame,
  Sparkles,
  Check,
  Plus,
  Lock,
} from 'lucide-react';

interface VibeCanvasProps {
  presets: VibePreset[];
  activePresetId: string;
  isPro: boolean;
  onSelectPreset: (preset: VibePreset) => void;
  onOpenStudioDrawer: () => void;
  onOpenUpgradeModal: () => void;
}

export const VibeCanvas: React.FC<VibeCanvasProps> = ({
  presets,
  activePresetId,
  isPro,
  onSelectPreset,
  onOpenStudioDrawer,
  onOpenUpgradeModal,
}) => {
  const [selectedPack, setSelectedPack] = useState<string>('All');

  const packs = ['All', 'Focus', 'Chill', 'Party', 'Circadian'];

  const filteredPresets =
    selectedPack === 'All' ? presets : presets.filter((p) => p.pack === selectedPack);

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Brain':
        return <Brain className="w-4 h-4 stroke-[2.2]" />;
      case 'GlassWater':
        return <GlassWater className="w-4 h-4 stroke-[2.2]" />;
      case 'Sun':
        return <Sun className="w-4 h-4 stroke-[2.2]" />;
      case 'Zap':
        return <Zap className="w-4 h-4 stroke-[2.2]" />;
      case 'CloudRain':
        return <CloudRain className="w-4 h-4 stroke-[2.2]" />;
      case 'Flame':
        return <Flame className="w-4 h-4 stroke-[2.2]" />;
      default:
        return <Sparkles className="w-4 h-4 stroke-[2.2]" />;
    }
  };

  const getIconBadgeStyle = (presetId: string, colors: string[]) => {
    if (presetId === 'deep-focus') {
      return {
        backgroundColor: 'rgba(56, 189, 248, 0.22)',
        color: '#38bdf8',
        border: '1px solid rgba(56, 189, 248, 0.6)',
        boxShadow: '0 0 14px rgba(56, 189, 248, 0.35)',
      };
    }
    if (presetId === 'late-night-lounge') {
      return {
        backgroundColor: 'rgba(245, 158, 11, 0.22)',
        color: '#fbbf24',
        border: '1px solid rgba(245, 158, 11, 0.6)',
        boxShadow: '0 0 14px rgba(245, 158, 11, 0.35)',
      };
    }

    const isDarkHex = (hex: string) => {
      const clean = hex.replace('#', '');
      if (clean.length !== 6) return false;
      const r = parseInt(clean.substring(0, 2), 16);
      const g = parseInt(clean.substring(2, 4), 16);
      const b = parseInt(clean.substring(4, 6), 16);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      return lum < 75;
    };

    const brightColor = colors.find((c) => !isDarkHex(c)) || colors[1] || colors[2] || '#38bdf8';

    return {
      backgroundColor: `${brightColor}28`,
      color: brightColor,
      border: `1px solid ${brightColor}60`,
      boxShadow: `0 0 14px ${brightColor}25`,
    };
  };

  const handleCardClick = (preset: VibePreset) => {
    if (preset.isPro && !isPro) {
      onOpenUpgradeModal();
      return;
    }
    onSelectPreset(preset);
  };

  return (
    <div className="hardware-panel p-4 rounded-2xl flex flex-col gap-4 select-none">
      {/* Top Header & Pack Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-studio-borderSubtle pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-studio-accent" />
          <h2 className="text-sm font-subheading font-bold text-studio-text uppercase tracking-widest">
            Atmosphere Presets
          </h2>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 max-w-full">
          {packs.map((pack) => (
            <button
              key={pack}
              onClick={() => setSelectedPack(pack)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono whitespace-nowrap transition-all ${
                selectedPack === pack
                  ? 'bg-studio-accent text-black font-semibold shadow-sm'
                  : 'text-studio-textMuted hover:text-studio-text hover:bg-studio-surface'
              }`}
            >
              {pack}
            </button>
          ))}
        </div>
      </div>

      {/* Preset Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredPresets.map((preset) => {
          const isActive = preset.id === activePresetId;
          const isLocked = Boolean(preset.isPro && !isPro);

          return (
            <div
              key={preset.id}
              onClick={() => handleCardClick(preset)}
              className={`group relative hardware-card p-3.5 rounded-xl cursor-pointer transition-all duration-200 border ${
                isActive
                  ? 'border-studio-accent shadow-lg shadow-studio-accent/20 bg-studio-surface'
                  : isLocked
                  ? 'border-studio-borderSubtle/60 opacity-85 hover:opacity-100 hover:border-amber-500/50'
                  : 'border-studio-borderSubtle hover:border-studio-border hover:bg-studio-card/70'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105 shrink-0"
                  style={getIconBadgeStyle(preset.id, preset.colors)}
                >
                  {getIcon(preset.icon)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-[15px] font-heading tracking-wider text-studio-text group-hover:text-studio-accent transition-colors uppercase leading-snug">
                      {preset.name}
                    </h4>
                    {isActive ? (
                      <div className="w-5 h-5 rounded-full bg-studio-accent flex items-center justify-center text-black shadow-sm shrink-0 mt-0.5">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                    ) : isLocked ? (
                      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-mono text-amber-400 font-bold shrink-0 mt-0.5">
                        <Lock className="w-2.5 h-2.5" />
                        <span>KEY</span>
                      </div>
                    ) : null}
                  </div>
                  <p className="text-[11px] font-subheading text-[#A6B0BF] mt-0.5 leading-snug">
                    {preset.tagline}
                  </p>
                </div>
              </div>

              {/* Color Swatch Bar */}
              <div className="mt-3 flex items-center gap-1.5 h-2 rounded-full overflow-hidden p-0.5 bg-black/40 border border-studio-borderSubtle">
                {preset.colors.map((c, i) => (
                  <div
                    key={i}
                    className="flex-1 h-full rounded-full"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>

              {/* Card Meta Badges */}
              <div className="mt-2.5 flex items-center justify-between text-[10px] font-mono text-studio-textMuted">
                <span className="capitalize">{preset.audioReactivity.mode.replace('_', ' ')}</span>
                <span>{preset.maxBrightness}% BRIGHT</span>
                <span>{(preset.transitionSpeedMs / 1000).toFixed(1)}s MORPH</span>
              </div>
            </div>
          );
        })}

        {/* Create Custom Vibe Card */}
        <div
          onClick={() => {
            if (!isPro) {
              onOpenUpgradeModal();
            } else {
              onOpenStudioDrawer();
            }
          }}
          className="hardware-card p-3.5 rounded-xl border border-dashed border-studio-border hover:border-studio-accent flex flex-col items-center justify-center gap-2 text-center cursor-pointer hover:bg-studio-surface/50 transition-all min-h-[120px] relative"
        >
          {!isPro && (
            <div className="absolute top-2.5 right-2.5 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[9px] font-mono text-amber-400 font-bold">
              <Lock className="w-2.5 h-2.5" />
              <span>KEY</span>
            </div>
          )}
          <div className="w-8 h-8 rounded-full bg-studio-surface border border-studio-border flex items-center justify-center text-studio-accent">
            <Plus className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-mono font-semibold text-studio-text">
              Design Custom Vibe
            </div>
            <div className="text-[10px] text-studio-textMuted font-mono">
              {isPro ? 'Open Interactive Studio Drawer' : 'Unlock with OmniVibe Offline Key'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
