import React, { useRef, useState } from 'react';
import { SkinTheme } from '../types';
import {
  exportAllToJson,
  importFromJson,
  resetToFactoryDefaults,
} from '../utils/storage';
import {
  X,
  Settings,
  Paintbrush,
  Download,
  Upload,
  RotateCcw,
  Check,
  Lock,
  Sparkles,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: SkinTheme;
  isPro: boolean;
  onSelectTheme: (theme: SkinTheme) => void;
  onDataResetOrImported: () => void;
  onOpenUpgradeModal: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  currentTheme,
  isPro,
  onSelectTheme,
  onDataResetOrImported,
  onOpenUpgradeModal,
}) => {
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const themes: Array<{
    id: SkinTheme;
    name: string;
    description: string;
    colorPreview: string[];
    isPro: boolean;
  }> = [
    {
      id: 'obsidian',
      name: 'Obsidian Studio (Default)',
      description: 'Deep obsidian surfaces, moody depth, cyan-sky highlights',
      colorPreview: ['#08090d', '#161924', '#38bdf8'],
      isPro: false,
    },
    {
      id: 'signal-industrial',
      name: 'Teenage Signal Industrial',
      description: 'Powder-coated matte charcoal with tactile safety amber',
      colorPreview: ['#121316', '#23252c', '#f59e0b'],
      isPro: true,
    },
    {
      id: 'warm-amber',
      name: 'Warm Amber Analog',
      description: 'Espresso tones, warm tungsten glow, vintage analog VU warmth',
      colorPreview: ['#100b06', '#271a10', '#f59e0b'],
      isPro: true,
    },
    {
      id: 'cool-slate',
      name: 'Cool Slate & Chilton',
      description: 'Deep nocturnal blue-grays, crisp chilton-blue highlights',
      colorPreview: ['#090f1b', '#18253f', '#0284c7'],
      isPro: false,
    },
    {
      id: 'nordic-pine',
      name: 'Nordic Forest & Moss',
      description: 'Scandinavian pine shadow, muted sage, calm organic sanctuary',
      colorPreview: ['#09120e', '#172720', '#10b981'],
      isPro: true,
    },
    {
      id: 'mcintosh-hifi',
      name: 'Retro McIntosh Hi-Fi',
      description: 'Iconic glass blackface with electric cyan watt-meter glow',
      colorPreview: ['#07090c', '#151b24', '#00e5ff'],
      isPro: true,
    },
    {
      id: 'winamp-classic',
      name: "Winamp Classic '99",
      description: 'Brushed gunmetal, electric equalizer green, LCD amber (Millennial Nostalgia)',
      colorPreview: ['#14171a', '#272d34', '#00ff66'],
      isPro: true,
    },
    {
      id: 'tokyo-neon',
      name: 'Tokyo Midnight Neon',
      description: 'Deep midnight ultraviolet & neon magenta cyberpunk glow',
      colorPreview: ['#0a0814', '#1c1634', '#ec4899'],
      isPro: true,
    },
    {
      id: 'clean-daylight',
      name: 'Clean Daylight Studio',
      description: 'High-contrast soft alabaster and stone for bright daytime',
      colorPreview: ['#f8fafc', '#ffffff', '#0284c7'],
      isPro: true,
    },
  ];

  const handleThemeClick = (t: (typeof themes)[0]) => {
    if (t.isPro && !isPro) {
      onOpenUpgradeModal();
      return;
    }
    onSelectTheme(t.id);
  };

  const handleExportJson = () => {
    const jsonStr = exportAllToJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `omnivibe-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const success = importFromJson(content);
      if (success) {
        setImportStatus('Backup restored successfully!');
        onDataResetOrImported();
        setTimeout(() => setImportStatus(null), 3000);
      } else {
        setImportStatus('Failed to import backup: invalid format');
      }
    };
    reader.readAsText(file);
  };

  const handleResetDefaults = () => {
    resetToFactoryDefaults();
    setShowConfirmReset(false);
    onDataResetOrImported();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Studio Settings and Skins"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none"
    >
      <div className="hardware-panel max-w-lg w-full p-6 rounded-2xl flex flex-col gap-5 border border-studio-border max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-borderSubtle pb-3">
          <div className="flex items-center gap-2.5">
            <Settings className="w-5 h-5 text-studio-accent" />
            <div>
              <h3 className="text-sm font-mono font-bold text-studio-text">
                Studio Settings &amp; Skins
              </h3>
              <p className="text-[11px] text-studio-textMuted font-mono">
                Hardware skin design tokens &amp; local data management
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings modal"
            className="p-1.5 rounded-lg text-studio-textMuted hover:text-studio-text hover:bg-studio-surface"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-4">

          {/* Swappable App Skins */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-mono font-bold text-studio-text flex items-center gap-1.5">
              <Paintbrush className="w-4 h-4 text-studio-accent" />
              Tactile Studio Deck Skins
            </label>

            <div className="grid grid-cols-1 gap-2">
              {themes.map((t) => {
                const isSelected = currentTheme === t.id;
                const isLocked = t.isPro && !isPro;

                return (
                  <div
                    key={t.id}
                    onClick={() => handleThemeClick(t)}
                    className={`hardware-card p-3 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                      isSelected
                        ? 'border-studio-accent shadow-md shadow-studio-accent/20 bg-studio-surface'
                        : isLocked
                        ? 'border-studio-borderSubtle/60 opacity-80 hover:opacity-100 hover:border-amber-500/50'
                        : 'border-studio-borderSubtle hover:border-studio-border'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-mono font-bold text-studio-text flex items-center gap-2">
                        {t.name}
                        {isSelected && <Check className="w-3.5 h-3.5 text-studio-accent" />}
                        {isLocked && (
                          <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[9px] text-amber-400 font-bold">
                            <Lock className="w-2.5 h-2.5" /> KEY
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-studio-textMuted mt-0.5">
                        {t.description}
                      </div>
                    </div>

                    {/* Color Swatch Dots */}
                    <div className="flex items-center gap-1.5 p-1 bg-black/40 rounded-lg">
                      {t.colorPreview.map((c, i) => (
                        <div
                          key={i}
                          className="w-4 h-4 rounded-full border border-white/20"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Backup & Restore */}
          <div className="hardware-card p-4 rounded-xl flex flex-col gap-3">
            <span className="text-xs font-mono font-bold text-studio-text">
              100% Local-First JSON Data Backup
            </span>
            <p className="text-[11px] text-studio-textMuted font-mono">
              Export all your custom vibe presets, song rules, paired devices, and visualizer preferences into a portable file.
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={handleExportJson}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-studio-elevated hover:bg-studio-border text-xs font-mono text-studio-text transition-all"
              >
                <Download className="w-3.5 h-3.5 text-studio-accent" />
                <span>Export Backup</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-studio-elevated hover:bg-studio-border text-xs font-mono text-studio-text transition-all"
              >
                <Upload className="w-3.5 h-3.5 text-studio-accent" />
                <span>Restore Backup</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportJson}
              />
            </div>

            {importStatus && (
              <span className="text-xs font-mono text-emerald-400">{importStatus}</span>
            )}
          </div>

          {/* Factory Reset */}
          <div className="hardware-card p-4 rounded-xl flex flex-col gap-2 border border-red-500/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-red-400 flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to Factory Defaults
              </span>
              {!showConfirmReset ? (
                <button
                  onClick={() => setShowConfirmReset(true)}
                  className="px-3 py-1 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs font-mono"
                >
                  Reset
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleResetDefaults}
                    className="px-3 py-1 rounded-lg bg-red-500 text-white font-mono text-xs font-bold"
                  >
                    Confirm Reset
                  </button>
                  <button
                    onClick={() => setShowConfirmReset(false)}
                    className="px-2 py-1 text-xs font-mono text-studio-textMuted"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
            <p className="text-[10px] text-studio-textMuted font-mono">
              Clears all local storage settings, Local Companion Bridge devices, and custom presets back to virgin defaults.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-studio-borderSubtle pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-studio-accent text-black font-mono font-semibold text-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
