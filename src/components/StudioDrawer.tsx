import React, { useState } from 'react';
import {
  VibePreset,
  ReactivityMode,
  SongVibeRule,
  VisualizerSettings,
} from '../types';
import {
  X,
  Sliders,
  Palette,
  Eye,
  Music,
  Plus,
  Trash2,
  Save,
  Check,
} from 'lucide-react';

interface StudioDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activePreset: VibePreset;
  onUpdatePreset: (updated: VibePreset) => void;
  onSaveAsNewPreset: (newPreset: VibePreset) => void;
  visualizerSettings: VisualizerSettings;
  onUpdateVisualizerSettings: (settings: VisualizerSettings) => void;
  songRules: SongVibeRule[];
  onUpdateSongRules: (rules: SongVibeRule[]) => void;
  allPresets: VibePreset[];
}

export const StudioDrawer: React.FC<StudioDrawerProps> = ({
  isOpen,
  onClose,
  activePreset,
  onUpdatePreset,
  onSaveAsNewPreset,
  visualizerSettings,
  onUpdateVisualizerSettings,
  songRules,
  onUpdateSongRules,
  allPresets,
}) => {
  const [activeTab, setActiveTab] = useState<'palette' | 'reactivity' | 'shader' | 'song_rules'>('palette');
  const [draftPreset, setDraftPreset] = useState<VibePreset>(activePreset);
  const [showSavedToast, setShowSavedToast] = useState(false);

  // New song rule form state
  const [newRuleQuery, setNewRuleQuery] = useState('');
  const [newRuleArtist, setNewRuleArtist] = useState('');
  const [newRulePresetId, setNewRulePresetId] = useState(activePreset.id);
  const [newRuleMode, setNewRuleMode] = useState<ReactivityMode>('harmonic_flow');

  // Keep draft in sync if activePreset changes externally
  React.useEffect(() => {
    setDraftPreset(activePreset);
  }, [activePreset]);

  if (!isOpen) return null;

  const handleColorChange = (index: number, newColor: string) => {
    const newColors = [...draftPreset.colors];
    newColors[index] = newColor;
    const updated = { ...draftPreset, colors: newColors };
    setDraftPreset(updated);
    onUpdatePreset(updated);
  };

  const handleAddColor = () => {
    if (draftPreset.colors.length >= 6) return;
    const updated = { ...draftPreset, colors: [...draftPreset.colors, '#ffffff'] };
    setDraftPreset(updated);
    onUpdatePreset(updated);
  };

  const handleRemoveColor = (index: number) => {
    if (draftPreset.colors.length <= 2) return;
    const newColors = draftPreset.colors.filter((_, i) => i !== index);
    const updated = { ...draftPreset, colors: newColors };
    setDraftPreset(updated);
    onUpdatePreset(updated);
  };

  const handleSaveAsNew = () => {
    const newId = `custom-${Date.now()}`;
    const newPreset: VibePreset = {
      ...draftPreset,
      id: newId,
      name: `${draftPreset.name} (Custom)`,
      pack: 'Custom Studio',
    };
    onSaveAsNewPreset(newPreset);
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2400);
  };

  const handleAddSongRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleQuery.trim()) return;

    const newRule: SongVibeRule = {
      id: `rule-${Date.now()}`,
      songQuery: newRuleQuery.trim(),
      artist: newRuleArtist.trim() || undefined,
      presetId: newRulePresetId,
      mode: newRuleMode,
    };

    const updated = [...songRules, newRule];
    onUpdateSongRules(updated);
    setNewRuleQuery('');
    setNewRuleArtist('');
  };

  const handleDeleteSongRule = (id: string) => {
    onUpdateSongRules(songRules.filter((r) => r.id !== id));
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-studio-surface border-l border-studio-border shadow-2xl flex flex-col select-none animate-in slide-in-from-right duration-300">
      {/* Drawer Header */}
      <div className="p-4 border-b border-studio-border flex items-center justify-between bg-studio-bg/60 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <Sliders className="w-4 h-4 text-studio-accent" />
          <div>
            <h3 className="text-sm font-mono font-bold text-studio-text">
              Interactive Studio Drawer
            </h3>
            <p className="text-[11px] text-studio-textMuted font-mono">
              Live Editing: <strong className="text-studio-accent">{draftPreset.name}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {showSavedToast && (
            <span className="flex items-center gap-1 text-xs font-mono text-emerald-400">
              <Check className="w-3.5 h-3.5" /> Saved!
            </span>
          )}
          <button
            onClick={handleSaveAsNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-studio-elevated hover:bg-studio-border text-xs font-mono text-studio-text transition-all"
            title="Save as new custom preset"
          >
            <Save className="w-3.5 h-3.5 text-studio-accent" />
            <span>Save Copy</span>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-studio-textMuted hover:text-studio-text hover:bg-studio-card"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-1 p-2 bg-studio-card/50 border-b border-studio-borderSubtle">
        <button
          onClick={() => setActiveTab('palette')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-mono flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'palette'
              ? 'bg-studio-accent text-black font-semibold'
              : 'text-studio-textMuted hover:text-studio-text'
          }`}
        >
          <Palette className="w-3.5 h-3.5" />
          <span>Colors</span>
        </button>

        <button
          onClick={() => setActiveTab('reactivity')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-mono flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'reactivity'
              ? 'bg-studio-accent text-black font-semibold'
              : 'text-studio-textMuted hover:text-studio-text'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Reactivity</span>
        </button>

        <button
          onClick={() => setActiveTab('shader')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-mono flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'shader'
              ? 'bg-studio-accent text-black font-semibold'
              : 'text-studio-textMuted hover:text-studio-text'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Visualizer</span>
        </button>

        <button
          onClick={() => setActiveTab('song_rules')}
          className={`flex-1 py-1.5 rounded-lg text-xs font-mono flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'song_rules'
              ? 'bg-studio-accent text-black font-semibold'
              : 'text-studio-textMuted hover:text-studio-text'
          }`}
        >
          <Music className="w-3.5 h-3.5" />
          <span>Song Rules</span>
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
        {/* TAB 1: PALETTE & DYNAMICS */}
        {activeTab === 'palette' && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-mono text-studio-text font-bold block mb-2">
                Multi-Stop Color Palette
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                {draftPreset.colors.map((color, idx) => (
                  <div key={idx} className="flex items-center gap-1 bg-black/40 p-1.5 rounded-xl border border-studio-border">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => handleColorChange(idx, e.target.value)}
                      className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0"
                    />
                    <input
                      type="text"
                      value={color.toUpperCase()}
                      onChange={(e) => handleColorChange(idx, e.target.value)}
                      className="w-16 bg-transparent text-[11px] font-mono text-studio-text focus:outline-none"
                    />
                    {draftPreset.colors.length > 2 && (
                      <button
                        onClick={() => handleRemoveColor(idx)}
                        className="text-red-400 hover:text-red-300 p-1"
                        title="Remove stop"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
                {draftPreset.colors.length < 6 && (
                  <button
                    onClick={handleAddColor}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl border border-dashed border-studio-border hover:border-studio-accent text-xs font-mono text-studio-textMuted hover:text-studio-text"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Stop</span>
                  </button>
                )}
              </div>
            </div>

            {/* Gradient Preview */}
            <div
              className="h-6 rounded-xl border border-studio-borderSubtle shadow-inner"
              style={{
                background: `linear-gradient(90deg, ${draftPreset.colors.join(', ')})`,
              }}
            />

            {/* Transition Speed Slider */}
            <div className="hardware-card p-3 rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-studio-text">Morph Transition Speed</span>
                <span className="text-studio-accent font-bold">
                  {(draftPreset.transitionSpeedMs / 1000).toFixed(1)}s
                </span>
              </div>
              <input
                type="range"
                min="100"
                max="8000"
                step="100"
                value={draftPreset.transitionSpeedMs}
                onChange={(e) => {
                  const updated = { ...draftPreset, transitionSpeedMs: Number(e.target.value) };
                  setDraftPreset(updated);
                  onUpdatePreset(updated);
                }}
                className="w-full accent-studio-accent h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
              <div className="flex items-center justify-between text-[10px] font-mono text-studio-textMuted">
                <span>Fast Strobing (0.1s)</span>
                <span>Smooth Organic Drift (8.0s)</span>
              </div>
            </div>

            {/* Max Brightness Cap */}
            <div className="hardware-card p-3 rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-studio-text">Max Lumen Brightness Cap</span>
                <span className="text-studio-accent font-bold">{draftPreset.maxBrightness}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                value={draftPreset.maxBrightness}
                onChange={(e) => {
                  const updated = { ...draftPreset, maxBrightness: Number(e.target.value) };
                  setDraftPreset(updated);
                  onUpdatePreset(updated);
                }}
                className="w-full accent-studio-accent h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* TAB 2: FREQUENCY REACTIVITY */}
        {activeTab === 'reactivity' && (
          <div className="flex flex-col gap-4">
            {/* Mode Picker */}
            <div>
              <label className="text-xs font-mono text-studio-text font-bold block mb-2">
                Reactivity Behavior Mode
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['ambient_drift', 'harmonic_flow', 'party_reactive'] as ReactivityMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => {
                      const updated = {
                        ...draftPreset,
                        audioReactivity: { ...draftPreset.audioReactivity, mode: m },
                      };
                      setDraftPreset(updated);
                      onUpdatePreset(updated);
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-mono text-center capitalize border transition-all ${
                      draftPreset.audioReactivity.mode === m
                        ? 'bg-studio-accent text-black font-semibold border-studio-accent shadow-md'
                        : 'bg-studio-card text-studio-textMuted border-studio-border hover:border-studio-borderSubtle'
                    }`}
                  >
                    {m.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {/* Bass Sensitivity */}
            <div className="hardware-card p-3 rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-studio-text">Sub-Bass Weight (20-250Hz)</span>
                <span className="text-studio-accent font-bold">
                  {draftPreset.audioReactivity.bassWeight}x
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2.5"
                step="0.1"
                value={draftPreset.audioReactivity.bassWeight}
                onChange={(e) => {
                  const updated = {
                    ...draftPreset,
                    audioReactivity: { ...draftPreset.audioReactivity, bassWeight: Number(e.target.value) },
                  };
                  setDraftPreset(updated);
                  onUpdatePreset(updated);
                }}
                className="w-full accent-studio-accent h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>

            {/* Mids Sensitivity */}
            <div className="hardware-card p-3 rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-studio-text">Mids / Vocals Weight (250-4kHz)</span>
                <span className="text-studio-accent font-bold">
                  {draftPreset.audioReactivity.midWeight}x
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2.5"
                step="0.1"
                value={draftPreset.audioReactivity.midWeight}
                onChange={(e) => {
                  const updated = {
                    ...draftPreset,
                    audioReactivity: { ...draftPreset.audioReactivity, midWeight: Number(e.target.value) },
                  };
                  setDraftPreset(updated);
                  onUpdatePreset(updated);
                }}
                className="w-full accent-studio-accent h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>

            {/* Treble Sensitivity */}
            <div className="hardware-card p-3 rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-studio-text">Treble / Highs Weight (4-16kHz)</span>
                <span className="text-studio-accent font-bold">
                  {draftPreset.audioReactivity.trebleWeight}x
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2.5"
                step="0.1"
                value={draftPreset.audioReactivity.trebleWeight}
                onChange={(e) => {
                  const updated = {
                    ...draftPreset,
                    audioReactivity: { ...draftPreset.audioReactivity, trebleWeight: Number(e.target.value) },
                  };
                  setDraftPreset(updated);
                  onUpdatePreset(updated);
                }}
                className="w-full accent-studio-accent h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>

            {/* Attack / Release Smoothing */}
            <div className="hardware-card p-3 rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-studio-text">Attack / Release Smoothing Curve</span>
                <span className="text-studio-accent font-bold">
                  {draftPreset.audioReactivity.smoothing}
                </span>
              </div>
              <input
                type="range"
                min="0.1"
                max="0.98"
                step="0.02"
                value={draftPreset.audioReactivity.smoothing}
                onChange={(e) => {
                  const updated = {
                    ...draftPreset,
                    audioReactivity: { ...draftPreset.audioReactivity, smoothing: Number(e.target.value) },
                  };
                  setDraftPreset(updated);
                  onUpdatePreset(updated);
                }}
                className="w-full accent-studio-accent h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* TAB 3: VISUALIZER SHADER PARAMETERS */}
        {activeTab === 'shader' && (
          <div className="flex flex-col gap-4">
            {/* Particle Density */}
            <div className="hardware-card p-3 rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-studio-text">Particle Constellation Density</span>
                <span className="text-studio-accent font-bold">{visualizerSettings.particleDensity}x</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="2.0"
                step="0.1"
                value={visualizerSettings.particleDensity}
                onChange={(e) =>
                  onUpdateVisualizerSettings({
                    ...visualizerSettings,
                    particleDensity: Number(e.target.value),
                  })
                }
                className="w-full accent-studio-accent h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>

            {/* Camera Drift Speed */}
            <div className="hardware-card p-3 rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-studio-text">Camera Orbit & Drift Speed</span>
                <span className="text-studio-accent font-bold">{visualizerSettings.cameraDriftSpeed}x</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="2.5"
                step="0.1"
                value={visualizerSettings.cameraDriftSpeed}
                onChange={(e) =>
                  onUpdateVisualizerSettings({
                    ...visualizerSettings,
                    cameraDriftSpeed: Number(e.target.value),
                  })
                }
                className="w-full accent-studio-accent h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>

            {/* Bloom Intensity */}
            <div className="hardware-card p-3 rounded-xl flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-studio-text">Glow Bloom Intensity</span>
                <span className="text-studio-accent font-bold">{visualizerSettings.bloomIntensity}x</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="2.5"
                step="0.1"
                value={visualizerSettings.bloomIntensity}
                onChange={(e) =>
                  onUpdateVisualizerSettings({
                    ...visualizerSettings,
                    bloomIntensity: Number(e.target.value),
                  })
                }
                className="w-full accent-studio-accent h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>

            {/* OLED Burn-In Protection Toggle */}
            <div className="hardware-card p-3 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-mono font-bold text-studio-text block">
                  OLED Burn-In Protection
                </span>
                <span className="text-[11px] text-studio-textMuted font-mono">
                  Periodic pixel shifting and standby dim after 5min silence
                </span>
              </div>
              <input
                type="checkbox"
                checked={visualizerSettings.oledBurnInProtection}
                onChange={(e) =>
                  onUpdateVisualizerSettings({
                    ...visualizerSettings,
                    oledBurnInProtection: e.target.checked,
                  })
                }
                className="w-4 h-4 accent-studio-accent cursor-pointer"
              />
            </div>
          </div>
        )}

        {/* TAB 4: PER-SONG RULES */}
        {activeTab === 'song_rules' && (
          <div className="flex flex-col gap-4">
            {/* Add Rule Form */}
            <form onSubmit={handleAddSongRule} className="hardware-card p-3 rounded-xl flex flex-col gap-2.5">
              <span className="text-xs font-mono font-bold text-studio-text">
                Add Automatic Song Trigger
              </span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Song Keyword (e.g. lofi)"
                  value={newRuleQuery}
                  onChange={(e) => setNewRuleQuery(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-black/50 border border-studio-border text-xs font-mono text-studio-text focus:outline-none focus:border-studio-accent"
                />
                <input
                  type="text"
                  placeholder="Artist (Optional)"
                  value={newRuleArtist}
                  onChange={(e) => setNewRuleArtist(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg bg-black/50 border border-studio-border text-xs font-mono text-studio-text focus:outline-none focus:border-studio-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newRulePresetId}
                  onChange={(e) => setNewRulePresetId(e.target.value)}
                  className="px-2 py-1.5 rounded-lg bg-black/50 border border-studio-border text-xs font-mono text-studio-text focus:outline-none focus:border-studio-accent"
                >
                  {allPresets.map((p) => (
                    <option key={p.id} value={p.id} className="bg-neutral-900">
                      {p.name}
                    </option>
                  ))}
                </select>

                <select
                  value={newRuleMode}
                  onChange={(e) => setNewRuleMode(e.target.value as ReactivityMode)}
                  className="px-2 py-1.5 rounded-lg bg-black/50 border border-studio-border text-xs font-mono text-studio-text focus:outline-none focus:border-studio-accent"
                >
                  <option value="ambient_drift" className="bg-neutral-900">Ambient Drift</option>
                  <option value="harmonic_flow" className="bg-neutral-900">Harmonic Flow</option>
                  <option value="party_reactive" className="bg-neutral-900">Party Reactive</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-1.5 rounded-lg bg-studio-accent text-black font-mono font-semibold text-xs mt-1"
              >
                + Bind Song Rule
              </button>
            </form>

            {/* List Active Rules */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-mono text-studio-textMuted">
                Active Song & Genre Bindings ({songRules.length})
              </label>
              {songRules.map((rule) => {
                const targetPreset = allPresets.find((p) => p.id === rule.presetId);
                return (
                  <div
                    key={rule.id}
                    className="hardware-card p-2.5 rounded-xl flex items-center justify-between text-xs font-mono"
                  >
                    <div>
                      <div className="text-studio-text font-bold">
                        &quot;{rule.songQuery}&quot; {rule.artist && <span className="text-studio-textMuted">by {rule.artist}</span>}
                      </div>
                      <div className="text-[10px] text-studio-accent">
                        → {targetPreset?.name || rule.presetId} ({rule.mode.replace('_', ' ')})
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteSongRule(rule.id)}
                      className="p-1 text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
