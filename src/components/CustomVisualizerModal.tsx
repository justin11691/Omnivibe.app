import React, { useState, useRef, useEffect } from 'react';
import { CustomVisualizerConfig, VisualizerSettings } from '../types';
import { X, Sparkles, Sliders, Check, RefreshCw, Palette } from 'lucide-react';

interface CustomVisualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: VisualizerSettings;
  onSaveConfig: (config: CustomVisualizerConfig) => void;
}

const PRESET_PALETTES = [
  { name: 'Cyber Neon', colors: ['#00FF66', '#FF007F', '#00F0FF', '#FFE600'] },
  { name: 'Midnight Steel', colors: ['#0D1117', '#1E2933', '#4A5568', '#A6B0BF', '#E2E8F0'] },
  { name: 'Molten Lava', colors: ['#FF6B35', '#D00000', '#FFD166', '#3D0043'] },
  { name: 'Deep Space', colors: ['#0A192F', '#4361EE', '#8A2BE2', '#4CC9F0'] },
  { name: 'Emerald Matrix', colors: ['#00B894', '#00FF66', '#1DD1A1', '#09120E'] },
  { name: 'Sunset Drift', colors: ['#EA580C', '#F59E0B', '#EC4899', '#7C3AED'] },
];

export const CustomVisualizerModal: React.FC<CustomVisualizerModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveConfig,
}) => {
  const currentConfig: CustomVisualizerConfig = settings.customConfig || {
    name: 'My Custom Visualizer',
    baseStyle: 'tunnel',
    colorScheme: ['#00F0FF', '#FF007F', '#00FF66', '#FFE600'],
    speed: 1.0,
    density: 1.0,
    audioSensitivity: 1.2,
    wireframe: true,
    crtScanlines: true,
    bloom: 1.4,
    rotationSpeed: 0.8,
  };

  const [name, setName] = useState(currentConfig.name);
  const [baseStyle, setBaseStyle] = useState<CustomVisualizerConfig['baseStyle']>(currentConfig.baseStyle);
  const [colors, setColors] = useState<string[]>(currentConfig.colorScheme);
  const [speed, setSpeed] = useState<number>(currentConfig.speed);
  const [density, setDensity] = useState<number>(currentConfig.density);
  const [audioSensitivity, setAudioSensitivity] = useState<number>(currentConfig.audioSensitivity);
  const [wireframe, setWireframe] = useState<boolean>(currentConfig.wireframe);
  const [crtScanlines, setCrtScanlines] = useState<boolean>(currentConfig.crtScanlines);
  const [bloom, setBloom] = useState<number>(currentConfig.bloom);
  const [rotationSpeed, setRotationSpeed] = useState<number>(currentConfig.rotationSpeed);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Live mini preview animation in the modal
  useEffect(() => {
    if (!isOpen) return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let t = 0;

    const render = () => {
      t += 0.03 * speed;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      ctx.fillStyle = '#08090d';
      ctx.fillRect(0, 0, w, h);

      const simBass = 0.5 + Math.sin(t * 3) * 0.4;
      const primaryCol = colors[0] || '#38bdf8';
      const secondaryCol = colors[1] || '#ec4899';

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.5 * rotationSpeed);

      if (baseStyle === 'tunnel' || baseStyle === 'cubes') {
        const rings = Math.floor(6 * density);
        for (let r = 0; r < rings; r++) {
          const prog = (r / rings + t * 0.2) % 1.0;
          const rad = Math.pow(prog, 1.6) * (w * 0.45) * (1 + simBass * 0.25 * audioSensitivity);
          ctx.strokeStyle = colors[r % colors.length] || primaryCol;
          ctx.lineWidth = wireframe ? 1.5 : 3;
          ctx.shadowColor = ctx.strokeStyle;
          ctx.shadowBlur = 8 * bloom;
          ctx.strokeRect(-rad, -rad, rad * 2, rad * 2);
        }
      } else if (baseStyle === 'lava') {
        const count = Math.floor(8 * density);
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + t * 0.8;
          const dist = (30 + Math.sin(t * 2 + i) * 25) * (1 + simBass * 0.3 * audioSensitivity);
          const px = Math.cos(angle) * dist;
          const py = Math.sin(angle * 1.3) * dist;
          const rad = (15 + Math.cos(t + i) * 8) * (1 + simBass * 0.4);

          ctx.fillStyle = colors[i % colors.length] || secondaryCol;
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 10 * bloom;
          ctx.beginPath();
          ctx.arc(px, py, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Equalizer / Particles / Waves
        const bars = Math.floor(16 * density);
        const bw = w / (bars * 2);
        for (let b = 0; b < bars; b++) {
          const bh = (10 + Math.abs(Math.sin(t * 2 + b * 0.4)) * 50) * (1 + simBass * 0.5 * audioSensitivity);
          const bx = (b - bars / 2) * (bw + 2);
          ctx.fillStyle = colors[b % colors.length] || primaryCol;
          ctx.shadowColor = ctx.fillStyle;
          ctx.shadowBlur = 6 * bloom;
          ctx.fillRect(bx, -bh / 2, bw, bh);
        }
      }

      ctx.restore();

      // CRT Scanlines
      if (crtScanlines) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
        for (let y = 0; y < h; y += 3) {
          ctx.fillRect(0, y, w, 1);
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isOpen, baseStyle, colors, speed, density, audioSensitivity, wireframe, crtScanlines, bloom, rotationSpeed]);

  if (!isOpen) return null;

  const handleSave = () => {
    const config: CustomVisualizerConfig = {
      name: name.trim() || 'My Custom Visualizer',
      baseStyle,
      colorScheme: colors,
      speed,
      density,
      audioSensitivity,
      wireframe,
      crtScanlines,
      bloom,
      rotationSpeed,
    };
    onSaveConfig(config);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Make Your Own 3D Visualizer"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
    >
      <div className="hardware-panel max-w-2xl w-full p-6 rounded-3xl flex flex-col gap-5 border border-studio-border max-h-[92vh] overflow-hidden shadow-2xl bg-[#0D1117]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-borderSubtle pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1E2933] border border-[#4A5568]/40 flex items-center justify-center text-studio-accent">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-heading tracking-wider text-[#E2E8F0] uppercase">
                Make Your Own 3D Visualizer
              </h3>
              <p className="text-[10px] font-subheading text-[#A6B0BF] uppercase tracking-wider">
                Craft bespoke geometry, physics, color stops, and audio reactivity
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

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1">
          {/* Live Canvas Preview */}
          <div className="relative w-full aspect-[21/9] bg-black rounded-2xl overflow-hidden border border-studio-border flex items-center justify-center">
            <canvas ref={previewCanvasRef} width={420} height={180} className="w-full h-full object-cover" />
            <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 border border-studio-borderSubtle text-[10px] font-mono text-studio-accent">
              REAL-TIME PREVIEW
            </div>
          </div>

          {/* Archetype Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-subheading uppercase text-studio-textMuted font-bold tracking-wider">
              1. Base 3D Archetype
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {[
                { id: 'tunnel', label: 'Warp Tunnel' },
                { id: 'cubes', label: '3D Cubes' },
                { id: 'lava', label: 'Lava Blobs' },
                { id: 'waves', label: 'Liquid Waves' },
                { id: 'particles', label: 'Particles' },
                { id: 'equalizer', label: 'Retro EQ' },
              ].map((arch) => (
                <button
                  key={arch.id}
                  type="button"
                  onClick={() => setBaseStyle(arch.id as CustomVisualizerConfig['baseStyle'])}
                  className={`py-2 px-2 rounded-xl text-xs font-mono font-bold transition-all border ${
                    baseStyle === arch.id
                      ? 'bg-studio-accent text-black border-studio-accent shadow-sm'
                      : 'bg-[#1E2933] text-studio-text border-studio-borderSubtle hover:border-studio-accent'
                  }`}
                >
                  {arch.label}
                </button>
              ))}
            </div>
          </div>

          {/* Color Palettes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-subheading uppercase text-studio-textMuted font-bold tracking-wider flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5" />
              <span>2. Color Palette Preset</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PRESET_PALETTES.map((pal) => (
                <button
                  key={pal.name}
                  type="button"
                  onClick={() => setColors(pal.colors)}
                  className="hardware-card p-2 rounded-xl flex items-center justify-between gap-2 border border-studio-borderSubtle hover:border-studio-accent bg-[#1E2933]"
                >
                  <span className="text-[11px] font-mono text-studio-text">{pal.name}</span>
                  <div className="flex items-center gap-1">
                    {pal.colors.slice(0, 3).map((c, i) => (
                      <span key={i} className="w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Sliders: Speed, Density, Audio Sensitivity, Bloom, Rotation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
            <div className="hardware-card p-3 rounded-xl flex flex-col gap-1 bg-[#1E2933]">
              <div className="flex justify-between text-[#A6B0BF]">
                <span>Animation Speed</span>
                <span className="text-studio-accent font-bold">{speed.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="3.0"
                step="0.1"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full accent-studio-accent h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>

            <div className="hardware-card p-3 rounded-xl flex flex-col gap-1 bg-[#1E2933]">
              <div className="flex justify-between text-[#A6B0BF]">
                <span>Geometry Density</span>
                <span className="text-studio-accent font-bold">{density.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="2.5"
                step="0.1"
                value={density}
                onChange={(e) => setDensity(Number(e.target.value))}
                className="w-full accent-studio-accent h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>

            <div className="hardware-card p-3 rounded-xl flex flex-col gap-1 bg-[#1E2933]">
              <div className="flex justify-between text-[#A6B0BF]">
                <span>Audio Reactivity</span>
                <span className="text-studio-accent font-bold">{audioSensitivity.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3.0"
                step="0.1"
                value={audioSensitivity}
                onChange={(e) => setAudioSensitivity(Number(e.target.value))}
                className="w-full accent-studio-accent h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>

            <div className="hardware-card p-3 rounded-xl flex flex-col gap-1 bg-[#1E2933]">
              <div className="flex justify-between text-[#A6B0BF]">
                <span>Phosphor Bloom Glow</span>
                <span className="text-studio-accent font-bold">{bloom.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="2.5"
                step="0.1"
                value={bloom}
                onChange={(e) => setBloom(Number(e.target.value))}
                className="w-full accent-studio-accent h-1.5 bg-black/60 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <button
              type="button"
              onClick={() => setWireframe(!wireframe)}
              className={`p-3 rounded-xl border flex items-center justify-between ${
                wireframe ? 'bg-studio-accent/15 border-studio-accent text-studio-text' : 'bg-[#1E2933] border-studio-borderSubtle text-studio-textMuted'
              }`}
            >
              <span>Wireframe Lines</span>
              <span className={`w-3.5 h-3.5 rounded flex items-center justify-center ${wireframe ? 'bg-studio-accent text-black' : 'border border-gray-600'}`}>
                {wireframe && <Check className="w-3 h-3 stroke-[3]" />}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setCrtScanlines(!crtScanlines)}
              className={`p-3 rounded-xl border flex items-center justify-between ${
                crtScanlines ? 'bg-studio-accent/15 border-studio-accent text-studio-text' : 'bg-[#1E2933] border-studio-borderSubtle text-studio-textMuted'
              }`}
            >
              <span>CRT Scanlines</span>
              <span className={`w-3.5 h-3.5 rounded flex items-center justify-center ${crtScanlines ? 'bg-studio-accent text-black' : 'border border-gray-600'}`}>
                {crtScanlines && <Check className="w-3 h-3 stroke-[3]" />}
              </span>
            </button>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-studio-borderSubtle pt-3 flex items-center justify-between text-xs font-mono">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-studio-textMuted hover:text-studio-text"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-studio-accent text-black font-bold font-mono shadow-md hover:opacity-90 flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Save &amp; Activate Custom Mode</span>
          </button>
        </div>
      </div>
    </div>
  );
};
