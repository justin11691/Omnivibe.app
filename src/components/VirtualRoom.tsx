import React from 'react';
import { VibePreset, AudioTelemetry, RoomZone } from '../types';

interface VirtualRoomProps {
  preset: VibePreset;
  telemetry: AudioTelemetry;
  zones: RoomZone[];
  onToggleZone?: (zoneId: string) => void;
}

export const VirtualRoom: React.FC<VirtualRoomProps> = ({
  preset,
  telemetry,
  zones,
  onToggleZone,
}) => {
  // Calculate dynamic active zones (supports any custom user-created rooms)
  const activeZones = zones.filter((z) => z.active);
  const hasActiveZones = activeZones.length > 0;
  const activeRatio = zones.length > 0 ? activeZones.length / zones.length : 1;

  // Intelligently map custom user rooms to 2.5D visual fixtures:
  // Desk setup: looks for 'studio-desk' or first available zone
  // Floor light bar & track light: looks for 'living-room' or second zone
  // Shelf diffuser / accent: looks for 'bedroom' or third zone
  const deskZone = zones.find((z) => z.id === 'studio-desk') || zones[0];
  const livingZone = zones.find((z) => z.id === 'living-room') || zones[1] || zones[0];
  const accentZone = zones.find((z) => z.id === 'bedroom') || zones[2] || zones[0];

  const isDeskActive = deskZone ? deskZone.active : hasActiveZones;
  const isLivingRoomActive = livingZone ? livingZone.active : hasActiveZones;
  const isAccentActive = accentZone ? accentZone.active : hasActiveZones;

  const bassBoost = (telemetry.bass / 100) * (preset.audioReactivity.bassWeight || 1);
  const midBoost = (telemetry.mids / 100) * (preset.audioReactivity.midWeight || 1);
  const trebleBoost = (telemetry.treble / 100) * (preset.audioReactivity.trebleWeight || 1);

  const colors = preset.colors;
  const c1 = colors[0] || '#38bdf8';
  const c2 = colors[1] || '#818cf8';
  const c3 = colors[2] || '#f59e0b';
  const c4 = colors[3] || '#ec4899';

  const baseBrightness = (preset.maxBrightness / 100);
  const effectiveGlow = Math.min(1.0, baseBrightness * (0.5 + bassBoost * 0.7));

  return (
    <div className="relative w-full aspect-[16/10] bg-[#07090e] rounded-2xl overflow-hidden border border-studio-border shadow-2xl p-4 flex flex-col justify-between select-none">
      {/* Top Header Label */}
      <div className="flex items-center justify-between z-20">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-studio-accent animate-pulse" />
          <span className="text-sm font-subheading font-bold text-studio-text tracking-widest uppercase">
            Virtual 2.5D Room Telemetry
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-studio-textMuted bg-studio-surface/80 px-2.5 py-1 rounded-full border border-studio-border">
          <span>ZONE ACTIVE:</span>
          <span className="text-studio-accent font-semibold">
            {zones.filter((z) => z.active).map((z) => z.name).join(', ') || 'None'}
          </span>
        </div>
      </div>

      {/* 2.5D Isometric Room Canvas with Dynamic Lighting */}
      <div className="relative flex-1 w-full flex items-center justify-center my-2">
        {/* Ambient Room Wall Wash (Reactive Radial Bloom) */}
        <div
          className="absolute inset-0 transition-all duration-150 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at 50% 40%, ${c1} ${Math.round(
              effectiveGlow * 35
            )}%, ${c2} ${Math.round(effectiveGlow * 18)}%, transparent 70%)`,
            filter: `blur(${35 + bassBoost * 25}px)`,
            opacity: hasActiveZones ? Math.min(1.0, 0.35 + activeRatio * 0.6) : 0.12,
          }}
        />

        {/* Isometric SVG Room Structure */}
        <svg
          viewBox="0 0 600 340"
          className="w-full h-full max-h-[300px] z-10 transition-transform duration-300"
          style={{ transform: `scale(${1 + bassBoost * 0.015})` }}
        >
          <defs>
            {/* Monitor Bias Glow */}
            <radialGradient id="monitorGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={c1} stopOpacity={isDeskActive ? 0.85 : 0.05} />
              <stop offset="100%" stopColor={c2} stopOpacity="0" />
            </radialGradient>

            {/* Floor Light Bar Glow */}
            <linearGradient id="floorBarGlow" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={c3} stopOpacity={isLivingRoomActive ? 0.9 : 0.1} />
              <stop offset="100%" stopColor={c4} stopOpacity={isLivingRoomActive ? 0.3 : 0} />
            </linearGradient>

            {/* Ceiling Pendant Glow */}
            <radialGradient id="pendantGlow" cx="50%" cy="0%" r="80%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity={isLivingRoomActive ? 0.9 : 0.1} />
              <stop offset="40%" stopColor={c2} stopOpacity={isLivingRoomActive ? 0.6 : 0.05} />
              <stop offset="100%" stopColor={c1} stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Isometric Room Walls & Floor */}
          {/* Back Wall */}
          <polygon
            points="100,50 500,50 500,230 100,230"
            fill="#12151f"
            stroke="#1f2538"
            strokeWidth="1.5"
          />

          {/* Acoustic Wall Diffusers */}
          <rect x="130" y="70" width="70" height="70" rx="4" fill="#181c2a" stroke="#252d42" />
          <rect x="400" y="70" width="70" height="70" rx="4" fill="#181c2a" stroke="#252d42" />

          {/* Left Wall */}
          <polygon
            points="20,100 100,50 100,230 20,290"
            fill="#0d1018"
            stroke="#1b2131"
            strokeWidth="1.5"
          />

          {/* Right Wall */}
          <polygon
            points="500,50 580,100 580,290 500,230"
            fill="#0d1018"
            stroke="#1b2131"
            strokeWidth="1.5"
          />

          {/* Floor */}
          <polygon
            points="100,230 500,230 580,290 20,290"
            fill="#0a0c12"
            stroke="#1b2131"
            strokeWidth="1.5"
          />

          {/* Ceiling Overhead Track Light (Living Room Zone) */}
          <line x1="220" y1="50" x2="380" y2="50" stroke="#334155" strokeWidth="3" />
          <circle cx="260" cy="55" r="4" fill="#cbd5e1" />
          <circle cx="340" cy="55" r="4" fill="#cbd5e1" />
          {/* Downward light cone */}
          <polygon
            points="230,55 370,55 420,220 180,220"
            fill="url(#pendantGlow)"
            style={{ opacity: isLivingRoomActive ? 0.4 + midBoost * 0.4 : 0.05 }}
          />

          {/* STUDIO DESK & MONITORS (Studio Desk Zone) */}
          {/* Desk Surface */}
          <polygon
            points="210,185 390,185 430,225 170,225"
            fill="#1e2435"
            stroke="#2d374f"
            strokeWidth="1.5"
            className="cursor-pointer hover:opacity-90"
            onClick={() => onToggleZone && deskZone && onToggleZone(deskZone.id)}
          />
          {/* Desk Legs */}
          <line x1="185" y1="225" x2="185" y2="270" stroke="#2d374f" strokeWidth="3" />
          <line x1="415" y1="225" x2="415" y2="270" stroke="#2d374f" strokeWidth="3" />

          {/* Monitor 1 (Main Ultrawide) */}
          {/* Bias Backlight Bloom behind monitor */}
          <ellipse
            cx="300"
            cy="150"
            rx={70 + bassBoost * 25}
            ry={45 + bassBoost * 15}
            fill="url(#monitorGlow)"
            style={{ filter: 'blur(16px)' }}
          />
          <rect
            x="245"
            y="130"
            width="110"
            height="46"
            rx="3"
            fill="#090a0f"
            stroke={isDeskActive ? c1 : '#334155'}
            strokeWidth="2"
          />
          {/* Screen Content Simulated Wave */}
          <line
            x1="252"
            y1="153"
            x2="348"
            y2="153"
            stroke={isDeskActive ? c2 : '#1e293b'}
            strokeWidth="1.5"
          />
          <rect x="296" y="176" width="8" height="10" fill="#334155" />

          {/* Studio Monitor Speakers */}
          <rect x="215" y="142" width="18" height="32" rx="2" fill="#141824" stroke="#252d42" />
          <circle cx="224" cy="154" r="5" fill="#334155" />
          <rect x="367" y="142" width="18" height="32" rx="2" fill="#141824" stroke="#252d42" />
          <circle cx="376" cy="154" r="5" fill="#334155" />

          {/* STANDING CORNER FLOOR LIGHT BAR (Floor / Ambient Zone) */}
          <g
            className="cursor-pointer"
            onClick={() => onToggleZone && livingZone && onToggleZone(livingZone.id)}
          >
            {/* Light Bar Aura */}
            <ellipse
              cx="475"
              cy="160"
              rx={25 + trebleBoost * 20}
              ry="75"
              fill={isLivingRoomActive ? c3 : 'transparent'}
              style={{ filter: 'blur(18px)', opacity: isLivingRoomActive ? 0.75 : 0.05 }}
            />
            {/* The Physical Bar */}
            <line x1="475" y1="110" x2="475" y2="245" stroke="#334155" strokeWidth="4" />
            <line
              x1="475"
              y1="112"
              x2="475"
              y2="243"
              stroke={isLivingRoomActive ? c3 : '#475569'}
              strokeWidth="2"
            />
            {/* Base */}
            <ellipse cx="475" cy="245" rx="10" ry="3" fill="#1e293b" />
          </g>

          {/* AMBIENT SMART PLUG (Diffuser / Lava Lamp on side shelf) */}
          <g>
            <rect x="120" y="155" width="28" height="5" rx="1" fill="#2d374f" />
            {/* Diffuser Vapor */}
            <circle
              cx="134"
              cy="142"
              r="7"
              fill={isDeskActive ? c4 : '#334155'}
              style={{ filter: 'blur(3px)', opacity: isDeskActive ? 0.7 : 0.1 }}
            />
            <rect x="127" y="145" width="14" height="10" rx="3" fill="#181e2b" />
          </g>

          {/* Floor Light Bounce Pool */}
          <ellipse
            cx="300"
            cy="260"
            rx={110 + bassBoost * 40}
            ry={30 + bassBoost * 10}
            fill={c1}
            style={{
              filter: 'blur(22px)',
              opacity: hasActiveZones ? 0.28 + bassBoost * 0.3 : 0.05,
            }}
          />
        </svg>
      </div>

      {/* Interactive Zone Indicator Toggles */}
      <div className="flex items-center justify-center gap-2 z-20">
        {zones.map((zone) => (
          <button
            key={zone.id}
            onClick={() => onToggleZone && onToggleZone(zone.id)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono transition-all border ${
              zone.active
                ? 'bg-studio-surface text-studio-text border-studio-accent shadow-sm shadow-studio-accent/20'
                : 'bg-studio-surface/50 text-studio-textMuted border-studio-border/60 hover:border-studio-border'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full transition-all ${
                zone.active ? 'bg-studio-accent shadow-sm shadow-studio-accent' : 'bg-gray-600'
              }`}
            />
            <span>{zone.name}</span>
            <span className="text-[10px] text-studio-textMuted font-sans">({zone.lightCount} bulbs)</span>
          </button>
        ))}
      </div>
    </div>
  );
};
