import React from 'react';
import { X, Keyboard, Command, Volume2, Tv, Sparkles, Layers } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keyCombo: string[];
  description: string;
}

interface ShortcutGroup {
  category: string;
  icon: React.ReactNode;
  items: ShortcutItem[];
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const groups: ShortcutGroup[] = [
    {
      category: 'Playback & Audio Console',
      icon: <Volume2 className="w-4 h-4 text-studio-accent" />,
      items: [
        { keyCombo: ['Space'], description: 'Play / Pause soundscapes & audio stream' },
        { keyCombo: ['M'], description: 'Toggle master audio mute' },
        { keyCombo: ['F'], description: 'Toggle full-screen visualizer stage mode' },
      ],
    },
    {
      category: '3D Visualizer Modes',
      icon: <Tv className="w-4 h-4 text-cyan-400" />,
      items: [
        { keyCombo: ['1'], description: 'Winamp MilkDrop (Classic 2.x Audio Reaction)' },
        { keyCombo: ['2'], description: 'Cyber Tunnel 3D (Synthwave Wireframe)' },
        { keyCombo: ['3'], description: 'Cube Matrix 3D (Isometric Equalizer Grid)' },
        { keyCombo: ['4'], description: '3D Lava Blobs (Metaball Lava Lamp)' },
        { keyCombo: ['5'], description: '3D Equalizer (Radial Spectrum)' },
        { keyCombo: ['6'], description: 'Liquid Waveforms (Harmonic Fluid)' },
        { keyCombo: ['7'], description: 'Geometric Particles (Orbital Constellation)' },
        { keyCombo: ['8'], description: 'Harmonic Nebula (Deep Cosmic Gas)' },
        { keyCombo: ['9'], description: 'Custom User Shader Studio' },
      ],
    },
    {
      category: 'Studio Control Panels',
      icon: <Layers className="w-4 h-4 text-purple-400" />,
      items: [
        { keyCombo: ['Z'], description: 'Open Room Zones Manager (Add/Remove Custom Rooms)' },
        { keyCombo: ['B'], description: 'Open Local Companion Bridge (Hue DTLS, Govee LAN, WiZ UDP)' },
        { keyCombo: ['C'], description: 'Open Circadian Biological Clock' },
        { keyCombo: ['S'], description: 'Open Share Vibe Code & Party QR' },
        { keyCombo: ['D'], description: 'Download & Save App to Computer (PWA/HTML)' },
        { keyCombo: ['?'], description: 'Show / Hide Keyboard Shortcuts Cheatsheet' },
        { keyCombo: ['Ctrl', 'Shift', 'K'], description: 'Owner Offline License Key Generator (PIN: 2026)' },
        { keyCombo: ['Esc'], description: 'Close any active modal dialog' },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-[#090b12] border border-studio-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-studio-border bg-studio-surface/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-studio-accent/20 border border-studio-accent/40 text-studio-accent">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-heading tracking-widest text-[#E2E8F0] uppercase">
                Studio Console Hotkeys
              </h2>
              <p className="text-xs font-mono text-studio-textMuted">
                Tactile keyboard navigation for desktop power users
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-studio-textMuted hover:text-studio-text hover:bg-studio-surface border border-transparent hover:border-studio-borderSubtle transition-all"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {groups.map((group) => (
            <div key={group.category} className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-subheading uppercase tracking-wider text-studio-accent font-bold">
                {group.icon}
                <span>{group.category}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {group.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-studio-borderSubtle hover:border-studio-border transition-colors text-xs font-mono"
                  >
                    <span className="text-studio-text truncate mr-2">{item.description}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.keyCombo.map((k) => (
                        <kbd
                          key={k}
                          className="px-2 py-0.5 rounded bg-studio-surface border border-studio-border text-[11px] font-mono text-studio-accent font-bold shadow-inner"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-studio-border bg-studio-surface/30 flex items-center justify-between text-[11px] font-mono text-studio-textMuted">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Studio Hotkeys Active</span>
          </div>
          <div className="flex items-center gap-1">
            <span>Press</span>
            <kbd className="px-1.5 py-0.5 rounded bg-studio-surface border border-studio-border text-[10px] text-studio-text font-bold">
              ?
            </kbd>
            <span>at any time to toggle</span>
          </div>
        </div>
      </div>
    </div>
  );
};
