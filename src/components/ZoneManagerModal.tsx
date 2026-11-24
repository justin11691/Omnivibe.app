import React, { useState } from 'react';
import { RoomZone } from '../types';
import {
  X,
  Layers,
  Plus,
  Trash2,
  Sliders,
  CheckCircle2,
  Home,
  Sparkles,
} from 'lucide-react';

interface ZoneManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  zones: RoomZone[];
  onUpdateZones: (zones: RoomZone[]) => void;
  isPro: boolean;
  onOpenUpgradeModal?: () => void;
}

export const ZoneManagerModal: React.FC<ZoneManagerModalProps> = ({
  isOpen,
  onClose,
  zones,
  onUpdateZones,
  isPro,
}) => {
  const [newZoneName, setNewZoneName] = useState('');
  const [newLightCount, setNewLightCount] = useState<number>(4);
  const [newBrightness, setNewBrightness] = useState<number>(80);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddZone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZoneName.trim()) return;

    const id = newZoneName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    // Ensure unique ID
    const uniqueId = zones.some((z) => z.id === id) ? `${id}-${Date.now().toString().slice(-4)}` : id;

    const newZone: RoomZone = {
      id: uniqueId,
      name: newZoneName.trim(),
      active: true,
      lightCount: Math.max(1, newLightCount),
      brightness: Math.min(100, Math.max(10, newBrightness)),
    };

    onUpdateZones([...zones, newZone]);
    setNewZoneName('');
    setNewLightCount(4);
    setNewBrightness(80);
  };

  const handleDeleteZone = (id: string) => {
    if (zones.length <= 1) {
      alert('You must have at least one room zone configured.');
      return;
    }
    onUpdateZones(zones.filter((z) => z.id !== id));
  };

  const handleToggleZoneActive = (id: string) => {
    if (!isPro) {
      // In Free tier: only 1 zone can be active at a time
      onUpdateZones(
        zones.map((z) => ({
          ...z,
          active: z.id === id ? !z.active : false,
        }))
      );
      return;
    }
    onUpdateZones(
      zones.map((z) => (z.id === id ? { ...z, active: !z.active } : z))
    );
  };

  const handleUpdateZoneBrightness = (id: string, brightness: number) => {
    onUpdateZones(
      zones.map((z) => (z.id === id ? { ...z, brightness } : z))
    );
  };

  const handleUpdateZoneLights = (id: string, lightCount: number) => {
    onUpdateZones(
      zones.map((z) => (z.id === id ? { ...z, lightCount: Math.max(1, lightCount) } : z))
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Custom Room and Zone Architecture"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
    >
      <div className="hardware-panel max-w-xl w-full p-6 rounded-3xl flex flex-col gap-5 border border-studio-border max-h-[90vh] overflow-hidden shadow-2xl bg-[#0D1117]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-borderSubtle pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1E2933] border border-[#4A5568]/40 flex items-center justify-center text-studio-accent">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-heading tracking-wider text-[#E2E8F0] uppercase">
                Custom Room &amp; Zone Architecture
              </h3>
              <p className="text-[10px] font-subheading text-[#A6B0BF] uppercase tracking-wider">
                Tailor your space: Add, configure, or remove house zones
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-studio-textMuted hover:text-studio-text hover:bg-studio-surface"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Zone List */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1">
          <div className="text-xs font-subheading uppercase text-studio-textMuted font-bold tracking-wider flex items-center justify-between">
            <span>Configured Rooms ({zones.length})</span>
            <span className="text-studio-accent">
              {zones.filter((z) => z.active).length} Active Now
            </span>
          </div>

          {zones.map((zone) => (
            <div
              key={zone.id}
              className={`hardware-card p-3.5 rounded-2xl flex flex-col gap-3 border transition-all ${
                zone.active
                  ? 'border-studio-accent/70 bg-[#1E2933] shadow-md shadow-studio-accent/10'
                  : 'border-studio-borderSubtle bg-[#141A22]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleToggleZoneActive(zone.id)}
                    className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                      zone.active
                        ? 'bg-studio-accent border-studio-accent text-black'
                        : 'border-studio-border hover:border-studio-accent'
                    }`}
                    title={zone.active ? 'Active: syncing lights' : 'Inactive: muted'}
                  >
                    {zone.active && <CheckCircle2 className="w-3.5 h-3.5" />}
                  </button>

                  <div>
                    <h4 className="text-sm font-subheading font-bold text-[#E2E8F0] flex items-center gap-2">
                      <span>{zone.name}</span>
                      {zone.active && (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                          LIVE
                        </span>
                      )}
                    </h4>
                    <span className="text-[10px] font-mono text-[#A6B0BF]">
                      ID: {zone.id} • {zone.lightCount} fixture{zone.lightCount > 1 ? 's' : ''} • Max: {zone.brightness}%
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setEditingId(editingId === zone.id ? null : zone.id)}
                    className="p-1.5 rounded-lg text-studio-textMuted hover:text-studio-text hover:bg-studio-card"
                    title="Configure sliders"
                  >
                    <Sliders className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleDeleteZone(zone.id)}
                    className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-studio-card"
                    title="Delete room"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Expandable Adjuster for Brightness and Light Count */}
              {editingId === zone.id && (
                <div className="pt-2 border-t border-studio-borderSubtle grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] text-[#A6B0BF]">
                      <span>Max Zone Brightness</span>
                      <span className="text-studio-accent font-bold">{zone.brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={zone.brightness}
                      onChange={(e) => handleUpdateZoneBrightness(zone.id, Number(e.target.value))}
                      className="w-full accent-studio-accent h-1.5 bg-black/60 rounded-lg cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[11px] text-[#A6B0BF]">
                      <span>Smart Fixtures Count</span>
                      <span className="text-studio-accent font-bold">{zone.lightCount}</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="32"
                      value={zone.lightCount}
                      onChange={(e) => handleUpdateZoneLights(zone.id, Number(e.target.value))}
                      className="w-full accent-studio-accent h-1.5 bg-black/60 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add New Room Form */}
          <form
            onSubmit={handleAddZone}
            className="hardware-card p-4 rounded-2xl flex flex-col gap-3 border border-dashed border-studio-borderSubtle bg-[#141A22] mt-2"
          >
            <div className="text-xs font-subheading font-bold text-studio-text uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-studio-accent" />
              <span>Add Custom House Room</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-1">
                <label className="text-[10px] font-mono text-studio-textMuted mb-1 block">Room Name</label>
                <input
                  type="text"
                  placeholder="e.g. Patio Deck"
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-black/50 border border-studio-border text-xs font-mono text-studio-text focus:outline-none focus:border-studio-accent"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-studio-textMuted mb-1 block">Fixtures ({newLightCount})</label>
                <input
                  type="number"
                  min="1"
                  max="48"
                  value={newLightCount}
                  onChange={(e) => setNewLightCount(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-black/50 border border-studio-border text-xs font-mono text-studio-text focus:outline-none focus:border-studio-accent"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono text-studio-textMuted mb-1 block">Default Cap ({newBrightness}%)</label>
                <input
                  type="number"
                  min="10"
                  max="100"
                  value={newBrightness}
                  onChange={(e) => setNewBrightness(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-black/50 border border-studio-border text-xs font-mono text-studio-text focus:outline-none focus:border-studio-accent"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!newZoneName.trim()}
              className="w-full py-2.5 rounded-xl bg-studio-accent text-black font-mono font-bold text-xs mt-1 shadow-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Room to Deck</span>
            </button>
          </form>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-studio-borderSubtle pt-3 flex items-center justify-between text-xs font-mono text-studio-textMuted">
          <span className="text-[11px]">Room layout persists locally in localStorage.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-studio-accent text-black font-semibold font-mono"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
