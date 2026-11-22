import React, { useState, useEffect, useRef } from 'react';
import {
  Monitor,
  Lightbulb,
  Smartphone,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Play,
  Pause,
  ArrowRight,
  Key,
  ExternalLink,
  Download,
  Share,
  MoreVertical,
  MonitorDown,
  Search,
  Laptop,
  Mic,
  HardDrive,
  Sliders,
  AlertCircle,
} from 'lucide-react';
import { STRIPE_PAYMENT_LINK_URL } from '../data/defaultPresets';
import { globalAudioEngine } from '../audio/AudioEngine';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface DownloadPortalProps {
  onEnterStudio: () => void;
  onOpenUnlockModal: () => void;
  isPro: boolean;
  deferredPrompt?: BeforeInstallPromptEvent | null;
}

export type DetectedOS = 'windows' | 'macos' | 'android' | 'ios' | 'unknown';

interface CompatRow {
  model: string;
  brand: string;
  status: 'supported' | 'unsupported' | 'coming_soon';
  protocol: string;
  notes: string;
}

const COMPATIBILITY_MATRIX: CompatRow[] = [
  {
    model: 'Philips Hue Bridge v2 + Color Bulbs / Play Bars / Gradient Strips',
    brand: 'Philips Hue',
    status: 'supported',
    protocol: 'Entertainment API v2 (DTLS 1.2 PSK, UDP 2100)',
    notes: 'Requires Bridge v2 (API >= 1.22) and an Entertainment Area (up to 10 color lights, max 1 active area).',
  },
  {
    model: 'Govee LAN-Enabled Strips & Lamps (H6199, H61A0, H6072, H6056, H6159)',
    brand: 'Govee',
    status: 'supported',
    protocol: 'Local LAN UDP (4001/4002/4003) + Razer 0xB1',
    notes: 'Toggle "LAN Control" ON in Govee Home app. Includes port 4002 conflict diagnostics & static-IP unicast bypass.',
  },
  {
    model: 'WiZ Wi-Fi RGB & RGBTW Smart Bulbs / Light Strips',
    brand: 'WiZ',
    status: 'supported',
    protocol: 'Raw JSON setPilot (UDP 38899 / 38900)',
    notes: 'Broadcast discovery or static-IP unicast list (DHCP reservation recommended) with exponential output smoothing.',
  },
  {
    model: 'Philips Hue Bridge v1 (Round BSB001)',
    brand: 'Philips Hue',
    status: 'unsupported',
    protocol: 'Legacy REST Only',
    notes: 'Bridge v1 does not support Entertainment API or DTLS 1.2. OmniVibe never falls back to rate-limited REST polling.',
  },
  {
    model: 'Govee H6006 / H605C & Cloud-Only Govee Bulbs',
    brand: 'Govee',
    status: 'unsupported',
    protocol: 'No LAN Control',
    notes: 'These models lack local LAN UDP support. OmniVibe never uses Govee cloud HTTP API for real-time audio sync.',
  },
  {
    model: 'Bluetooth-Only Bulbs (Hue Bluetooth without Bridge, BLE-only strips)',
    brand: 'Bluetooth',
    status: 'unsupported',
    protocol: 'BLE Only',
    notes: 'Cannot receive sub-50 ms LAN UDP/DTLS frames.',
  },
  {
    model: 'Matter over Thread / Wi-Fi & Bluetooth BLE Ambient Lamps',
    brand: 'Roadmap',
    status: 'coming_soon',
    protocol: 'Coming Soon',
    notes: 'Explicitly planned for future Native Bridge updates once high-frequency streaming profiles stabilize.',
  },
];

const SHADER_DEMOS = [
  { id: 'milkdrop', name: 'MilkDrop Fluid', tag: 'Retro Psychedelic', colors: ['#38bdf8', '#818cf8', '#f59e0b'] },
  { id: 'winamp', name: 'Retro Winamp', tag: 'Classic Spectrum', colors: ['#00ff66', '#38bdf8', '#f59e0b'] },
  { id: 'tunnel', name: 'Cyber Tunnel', tag: '3D Warp Rings', colors: ['#06b6d4', '#6366f1', '#e2e8f0'] },
  { id: 'lava', name: '3D Lava Blobs', tag: 'Organic Metaballs', colors: ['#f59e0b', '#8b5cf6', '#38bdf8'] },
  { id: 'waves', name: 'Liquid Waveforms', tag: 'Harmonic Ribbons', colors: ['#38bdf8', '#10b981', '#818cf8'] },
  { id: 'monolith', name: 'Monolith Matrix', tag: 'Isometric 3D Grid', colors: ['#818cf8', '#38bdf8', '#94a3b8'] },
  { id: 'eq3d', name: '3D Equalizer', tag: 'Peak-Hold Bars', colors: ['#10b981', '#38bdf8', '#f59e0b'] },
  { id: 'particles', name: 'Particle Field', tag: 'Orbital Core (Pro)', colors: ['#38bdf8', '#c084fc', '#fbbf24'] },
  { id: 'nebula', name: 'Harmonic Nebula', tag: 'Volumetric (Pro)', colors: ['#6366f1', '#06b6d4', '#34d399'] },
];

// Lightweight auto-playing muted 60fps Canvas preview for each of the 9 shaders
const ShaderMiniCanvas: React.FC<{ shaderId: string; colors: string[] }> = ({ shaderId, colors }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let t = Math.random() * 10;

    const draw = () => {
      t += 0.03;
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = 'rgba(7, 9, 14, 0.28)';
      ctx.fillRect(0, 0, w, h);

      if (shaderId === 'waves' || shaderId === 'milkdrop') {
        for (let l = 0; l < 3; l++) {
          ctx.beginPath();
          ctx.strokeStyle = colors[l % colors.length];
          ctx.lineWidth = 2;
          for (let x = 0; x <= w; x += 6) {
            const y = h / 2 + Math.sin(x * 0.045 + t * (1 + l * 0.35)) * (14 + l * 5) * Math.sin((x / w) * Math.PI);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      } else if (shaderId === 'winamp' || shaderId === 'eq3d') {
        const bars = 14;
        const bw = (w - 24) / bars;
        for (let i = 0; i < bars; i++) {
          const bh = 8 + Math.abs(Math.sin(t * 2.2 + i * 0.55)) * (h - 22);
          ctx.fillStyle = colors[i % colors.length];
          ctx.fillRect(12 + i * bw, h - bh - 6, bw - 3, bh);
        }
      } else if (shaderId === 'tunnel' || shaderId === 'monolith') {
        ctx.strokeStyle = colors[0];
        ctx.lineWidth = 1.5;
        for (let r = 0; r < 5; r++) {
          const prog = ((t * 0.6 + r * 0.2) % 1);
          const rad = 6 + prog * (w * 0.42);
          ctx.globalAlpha = 1 - prog;
          ctx.beginPath();
          if (shaderId === 'tunnel') {
            ctx.arc(w / 2, h / 2, rad, 0, Math.PI * 2);
          } else {
            ctx.rect(w / 2 - rad, h / 2 - rad * 0.6, rad * 2, rad * 1.2);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else {
        for (let i = 0; i < 4; i++) {
          const bx = w / 2 + Math.cos(t * (0.9 + i * 0.25) + i * 1.6) * (w * 0.26);
          const by = h / 2 + Math.sin(t * (1.1 + i * 0.2) + i * 2.1) * (h * 0.26);
          const grad = ctx.createRadialGradient(bx, by, 2, bx, by, 24);
          grad.addColorStop(0, colors[i % colors.length]);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(bx, by, 24, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [shaderId, colors]);

  return <canvas ref={ref} width={220} height={88} className="w-full h-22 rounded-xl bg-[#07090E] block" />;
};

export const DownloadPortal: React.FC<DownloadPortalProps> = ({
  onEnterStudio,
  onOpenUnlockModal,
  isPro,
  deferredPrompt = null,
}) => {
  const [detectedOS, setDetectedOS] = useState<DetectedOS>('unknown');
  const [detectedLabel, setDetectedLabel] = useState<string>('Web Browser');
  const [isDemoPlaying, setIsDemoPlaying] = useState<boolean>(false);
  const [demoMix, setDemoMix] = useState({ rain: 45, thunder: 35, fire: 0, train: 20 });
  const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);
  const [installNotice, setInstallNotice] = useState<'installed' | 'ios' | 'android' | 'desktop' | null>(null);

  // Searchable Compatibility Matrix state
  const [compatSearch, setCompatSearch] = useState('');
  const [compatFilter, setCompatFilter] = useState<'all' | 'supported' | 'unsupported' | 'coming_soon'>('all');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('win')) {
      setDetectedOS('windows');
      setDetectedLabel('Windows Desktop');
    } else if (ua.includes('mac') && !ua.includes('iphone') && !ua.includes('ipad')) {
      setDetectedOS('macos');
      setDetectedLabel('macOS Desktop');
    } else if (ua.includes('android')) {
      setDetectedOS('android');
      setDetectedLabel('Android');
    } else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) {
      setDetectedOS('ios');
      setDetectedLabel('iOS / iPadOS');
    } else {
      setDetectedOS('windows');
      setDetectedLabel('Desktop Web');
    }
  }, []);

  const handleToggleDemoPlay = async () => {
    if (isDemoPlaying) {
      globalAudioEngine.pause();
      setIsDemoPlaying(false);
    } else {
      await globalAudioEngine.playSoundscapes({
        rain: demoMix.rain,
        fire: demoMix.fire,
        brownNoise: 20,
        drone: 15,
        thunder: demoMix.thunder,
        train: demoMix.train,
      });
      setIsDemoPlaying(true);
    }
  };

  const handleDemoFader = (key: 'rain' | 'thunder' | 'fire' | 'train', val: number) => {
    const next = { ...demoMix, [key]: val };
    setDemoMix(next);
    if (isDemoPlaying) {
      globalAudioEngine.updateSoundscapeMix({
        rain: next.rain,
        fire: next.fire,
        brownNoise: 20,
        drone: 15,
        thunder: next.thunder,
        train: next.train,
      });
    }
  };

  const handleInstallPwa = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setInstallNotice('installed');
          setTimeout(() => onEnterStudio(), 1200);
          return;
        }
      } catch {
        // Fallback to manual guide
      }
    }

    if (detectedOS === 'ios') {
      setInstallNotice('ios');
    } else if (detectedOS === 'android') {
      setInstallNotice('android');
    } else {
      setInstallNotice('desktop');
    }
  };

  const handleBuyUnlockCode = async () => {
    setIsCheckingOut(true);
    try {
      const res = await fetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.checkoutUrl) {
          window.location.href = data.checkoutUrl;
          return;
        }
      }
    } catch {
      // Fallback to direct payment link
    } finally {
      setIsCheckingOut(false);
    }
    window.open(STRIPE_PAYMENT_LINK_URL, '_blank');
  };

  const filteredCompat = COMPATIBILITY_MATRIX.filter((row) => {
    const matchesStatus = compatFilter === 'all' || row.status === compatFilter;
    const q = compatSearch.trim().toLowerCase();
    const matchesQuery =
      !q ||
      row.model.toLowerCase().includes(q) ||
      row.brand.toLowerCase().includes(q) ||
      row.protocol.toLowerCase().includes(q) ||
      row.notes.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  return (
    <div className="min-h-screen bg-[#0B111A] text-[#E2E8F0] font-sans flex flex-col selection:bg-cyan-400 selection:text-black">
      {/* Top Navigation Bar — Consistent OmniVibe Studio Branding */}
      <header className="sticky top-0 z-50 bg-[#0F1724]/95 backdrop-blur-md border-b border-cyan-400/20 px-3 sm:px-6 py-3 flex items-center justify-between gap-3 select-none">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#0B111A] border border-cyan-400/40 overflow-hidden flex items-center justify-center shadow-lg shadow-fuchsia-500/25 shrink-0">
            <img
              src="/omnivibe-logo.jpg"
              alt="OmniVibe Studio Logo"
              className="w-full h-full object-cover scale-110"
            />
          </div>
          <div className="min-w-0">
            <span className="text-lg sm:text-xl font-heading tracking-widest uppercase font-bold text-white leading-none block truncate">
              OMNIVIBE STUDIO
            </span>
            <span className="text-[9px] sm:text-[10px] font-subheading uppercase tracking-wider text-[#A6B0BF] block truncate whitespace-nowrap">
              VISUAL MOOD &amp; LOCAL LIGHT ENGINE
            </span>
          </div>
        </div>

        {/* Pre-Sale Transparency Nav Links */}
        <nav className="hidden lg:flex items-center gap-5 text-xs font-mono text-[#CBD5E1]">
          <a href="#downloads" className="hover:text-studio-accent transition-colors">Downloads</a>
          <a href="#demos" className="hover:text-studio-accent transition-colors">Demos</a>
          <a href="#compatibility" className="hover:text-studio-accent transition-colors">Compatibility</a>
          <a href="#audio-guide" className="hover:text-studio-accent transition-colors">Audio Guide</a>
          <a href="/faq.html" className="hover:text-studio-accent transition-colors">FAQ</a>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {isPro ? (
            <button
              onClick={onOpenUnlockModal}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 text-xs font-mono font-bold hover:bg-emerald-500/25 transition-all whitespace-nowrap cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Pro Active</span>
            </button>
          ) : (
            <button
              onClick={onOpenUnlockModal}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-400 text-xs font-mono font-bold hover:bg-amber-500/20 transition-all whitespace-nowrap cursor-pointer"
            >
              <Key className="w-3.5 h-3.5" />
              <span>GET KEY ($9.99)</span>
            </button>
          )}

          <button
            onClick={onEnterStudio}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 via-fuchsia-500 to-amber-500 hover:brightness-110 text-white text-xs font-bold whitespace-nowrap transition-all shadow-md shadow-fuchsia-500/25 shrink-0 cursor-pointer"
          >
            Launch Studio &rarr;
          </button>
        </div>
      </header>

      {/* Hero Section: Clear Separation of Web Studio vs. Desktop App / Local Companion Bridge */}
      <section className="relative px-4 sm:px-6 py-12 md:py-16 max-w-6xl mx-auto flex flex-col items-center text-center gap-5">
        <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-studio-card/80 border border-studio-border text-xs font-mono text-studio-accent shadow-sm">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>100% Offline • 3-Day Free Trial • $9.99 Once</span>
        </div>

        <h1 className="text-3xl sm:text-5xl md:text-6xl font-heading tracking-wider uppercase text-white max-w-4xl leading-tight">
          Music You Can See. <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-amber-400">
            Room Lighting That Feels Alive.
          </span>
        </h1>

        <p className="text-xs sm:text-sm md:text-base font-subheading text-studio-textMuted max-w-2xl leading-relaxed">
          One offline desktop app for Windows and macOS. Watch smooth 3D visuals react to anything playing on your computer while your Philips Hue, Govee, and WiZ lights pulse in sync over local Wi-Fi. Free for 3 days, then $9.99 for life—or try the browser demo right here.
        </p>

        {/* Dual-Path CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 mt-2 w-full max-w-3xl">
          <a
            href="#downloads"
            className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-fuchsia-500 to-amber-500 hover:brightness-110 text-white font-mono font-bold text-xs sm:text-sm uppercase tracking-wider whitespace-nowrap flex items-center justify-center gap-2.5 shadow-xl shadow-fuchsia-500/25 transition-all transform hover:scale-[1.02] active:scale-95 cursor-pointer shrink-0"
          >
            <Download className="w-4 h-4 text-white shrink-0" />
            <span>DOWNLOAD OFFLINE APP (3-DAY FREE TRIAL)</span>
          </a>

          <button
            onClick={onEnterStudio}
            className="w-full sm:w-auto px-7 py-3.5 rounded-2xl bg-studio-surface border border-studio-border hover:border-studio-accent text-white font-mono font-bold text-xs sm:text-sm uppercase tracking-wider whitespace-nowrap flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0"
          >
            <Sparkles className="w-4 h-4 text-studio-accent shrink-0" />
            <span>TRY INTERACTIVE WEB DEMO</span>
          </button>
        </div>

        {/* Compatible Lights Pill Bar (Honest Protocols Only) */}
        <div className="w-full max-w-3xl px-2 pt-2 flex flex-wrap items-center justify-center gap-2">
          <span className="text-[11px] font-mono text-studio-textMuted uppercase tracking-wider whitespace-nowrap">
            LOCAL BRIDGE DRIVERS:
          </span>
          <span className="px-2.5 py-1 rounded-full bg-studio-card border border-studio-border text-xs font-mono text-[#CBD5E1] flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>Philips Hue v2 (DTLS 2100)</span>
          </span>
          <span className="px-2.5 py-1 rounded-full bg-studio-card border border-studio-border text-xs font-mono text-[#CBD5E1] flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span>Govee LAN (UDP 4001–4003)</span>
          </span>
          <span className="px-2.5 py-1 rounded-full bg-studio-card border border-studio-border text-xs font-mono text-[#CBD5E1] flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-purple-400" />
            <span>WiZ Wi-Fi (UDP 38899)</span>
          </span>
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs font-mono text-emerald-300 flex items-center gap-1.5 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Browser 60fps Shaders</span>
          </span>
        </div>

        <p className="text-xs font-mono text-studio-textMuted flex flex-wrap items-center justify-center gap-2">
          <span>Detected OS: <strong className="text-studio-accent">{detectedLabel}</strong></span>
          <span>•</span>
          <span>Guided Local Network Diagnostics</span>
          <span>•</span>
          <span>100% Offline Desktop App — 3-Day Free Trial, then $9.99 Once</span>
        </p>
      </section>

      {/* Live Looping Video & 9-Shader Showcase */}
      <section id="demos" className="px-4 sm:px-6 py-8 max-w-6xl mx-auto w-full flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl sm:text-3xl font-heading tracking-wider uppercase text-white">
              Live 9-Shader &amp; Room Lighting Demos
            </h2>
            <p className="text-xs font-mono text-studio-textMuted">
              Embedded muted looping video previews + real-time 60fps shader tiles — zero cloud rendering.
            </p>
          </div>
          <button
            onClick={onEnterStudio}
            className="text-xs font-mono text-studio-accent hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Open Fullscreen Visualizer Stage</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Embedded Auto-Playing Muted Looping Video Previews */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="hardware-panel p-3 rounded-2xl border border-studio-border bg-[#0A0D15] flex flex-col gap-2">
            <video
              src="/demos/shaders-showcase.webm"
              autoPlay
              muted
              loop
              playsInline
              className="w-full aspect-video rounded-xl bg-[#07090E] object-cover border border-studio-borderSubtle"
            />
            <div className="flex items-center justify-between px-1 text-xs font-mono">
              <span className="text-white font-bold">9-Shader 60fps Showcase Reel</span>
              <span className="text-studio-accent">MilkDrop • Winamp • Tunnel • Lava • Nebula</span>
            </div>
          </div>

          <div className="hardware-panel p-3 rounded-2xl border border-studio-border bg-[#0A0D15] flex flex-col gap-2">
            <video
              src="/demos/room-lighting-sync.webm"
              autoPlay
              muted
              loop
              playsInline
              className="w-full aspect-video rounded-xl bg-[#07090E] object-cover border border-studio-borderSubtle"
            />
            <div className="flex items-center justify-between px-1 text-xs font-mono">
              <span className="text-white font-bold">Real-Room Hue / Govee / WiZ Sync Demo</span>
              <span className="text-emerald-300">Sub-50 ms Local Companion Bridge</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {SHADER_DEMOS.map((demo) => (
            <div
              key={demo.id}
              onClick={onEnterStudio}
              className="hardware-card p-3 rounded-2xl border border-studio-borderSubtle hover:border-studio-accent transition-all cursor-pointer flex flex-col gap-2.5 bg-[#0C1018]"
            >
              <ShaderMiniCanvas shaderId={demo.id} colors={demo.colors} />
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-mono font-bold text-white">{demo.name}</span>
                <span className="text-[10px] font-mono text-studio-textMuted">{demo.tag}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive Live Soundscape Preview Box */}
      <section className="px-4 sm:px-6 py-6 max-w-6xl mx-auto w-full">
        <div className="hardware-panel p-5 sm:p-6 rounded-3xl border border-studio-border flex flex-col gap-5 shadow-2xl relative overflow-hidden bg-[#0A0D15]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-studio-borderSubtle pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="text-sm sm:text-base font-subheading font-bold text-white uppercase tracking-wider">
                Live Web Audio Soundscape Preview
              </h2>
            </div>
            <span className="text-[11px] font-mono text-studio-accent bg-studio-accent/10 px-2.5 py-0.5 rounded-full border border-studio-accent/30">
              100% Web Audio Synthesized
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={handleToggleDemoPlay}
                className="w-11 h-11 rounded-2xl bg-studio-accent hover:bg-sky-300 text-black flex items-center justify-center shadow-lg shadow-sky-500/25 transition-transform active:scale-95 shrink-0 cursor-pointer"
                title={isDemoPlaying ? 'Pause Ambient Soundscapes' : 'Play Ambient Soundscapes'}
              >
                {isDemoPlaying ? <Pause className="w-5 h-5 fill-black" /> : <Play className="w-5 h-5 fill-black ml-0.5" />}
              </button>
              <div>
                <div className="text-sm font-mono font-bold text-white">
                  {isDemoPlaying ? 'Generative Thunder & Night Train Active' : 'Soundscape Engine Ready'}
                </div>
                <div className="text-xs font-mono text-studio-textMuted">
                  {isDemoPlaying ? 'Real-time offline audio synthesis running' : 'Tap Play to hear ambient soundscapes'}
                </div>
              </div>
            </div>

            <button
              onClick={onEnterStudio}
              className="text-xs font-mono text-studio-accent hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Open Full 8-Channel Audio Deck &amp; Shaders in Studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { id: 'rain', label: 'Rain Generator', val: demoMix.rain, color: 'text-sky-400' },
              { id: 'thunder', label: 'Rolling Thunder', val: demoMix.thunder, color: 'text-amber-400' },
              { id: 'train', label: 'Passenger Train', val: demoMix.train, color: 'text-purple-400' },
              { id: 'fire', label: 'Hearth Fire', val: demoMix.fire, color: 'text-amber-300' },
            ].map((fader) => (
              <div key={fader.id} className="hardware-card p-3 rounded-xl flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className={fader.color}>{fader.label}</span>
                  <span className="text-white font-bold">{fader.val}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={fader.val}
                  onChange={(e) => handleDemoFader(fader.id as any, Number(e.target.value))}
                  className="w-full accent-studio-accent h-1.5 bg-black/60 rounded-lg cursor-pointer"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Two Clear Architecture Paths: Web Studio vs. Desktop App / Local Companion Bridge */}
      <section id="downloads" className="px-4 sm:px-6 py-10 max-w-6xl mx-auto w-full flex flex-col gap-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-heading tracking-wider uppercase text-white">
            Choose Your Setup Path
          </h2>
          <p className="text-xs font-mono text-studio-textMuted">
            Honest architecture: zero-install browser visuals vs. native OS sockets for physical room lighting.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Path A: Web Studio (Screen + Soundscapes) */}
          <div className="hardware-panel p-6 rounded-2xl border border-studio-accent bg-[#0E121B] flex flex-col justify-between gap-5">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="p-3 rounded-xl bg-black/50 border border-white/10 text-emerald-400">
                  <Monitor className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                  ZERO INSTALL • OFFLINE PWA
                </span>
              </div>
              <h3 className="text-lg font-subheading font-bold text-white">
                Try Web Studio (Screen + Soundscapes)
              </h3>
              <p className="text-xs font-mono text-[#CBD5E1] leading-relaxed">
                Runs immediately in Chrome, Safari, Edge, and Firefox with 60fps 3D shaders, 8 procedural soundscapes, circadian guardrails, and Screen Wake-Lock.
              </p>
              <ul className="space-y-1.5 text-xs font-mono text-studio-textMuted pt-1">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /><span>All 9 WebGL/Canvas visualizers + TV Stage Casting</span></li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /><span>Integrated Local Audio Player &amp; Noise-Gated Room Mic</span></li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /><span>Installable as a standalone full-screen PWA</span></li>
              </ul>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                onClick={onEnterStudio}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>Launch Web Studio</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleInstallPwa}
                className="py-2.5 px-4 rounded-xl bg-studio-surface hover:bg-studio-card border border-studio-border text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-studio-accent" />
                <span>Install PWA</span>
              </button>
            </div>
            {installNotice && (
              <div className="p-3 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-200 text-xs font-mono flex flex-wrap items-center gap-1.5">
                {installNotice === 'installed' && (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>OmniVibe Studio installed! Launching...</span>
                  </>
                )}
                {installNotice === 'ios' && (
                  <>
                    <span>iOS Safari: Tap</span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/40 border border-sky-400/40 text-white">
                      <Share className="w-3.5 h-3.5 text-sky-400" />
                      <span>Share</span>
                    </span>
                    <span>&rarr; &quot;Add to Home Screen&quot;.</span>
                  </>
                )}
                {installNotice === 'android' && (
                  <>
                    <span>Android Chrome: Tap</span>
                    <span className="inline-flex items-center px-1 py-0.5 rounded bg-black/40 border border-sky-400/40 text-white">
                      <MoreVertical className="w-3.5 h-3.5 text-sky-400" />
                    </span>
                    <span>&rarr; &quot;Install App&quot;.</span>
                  </>
                )}
                {installNotice === 'desktop' && (
                  <>
                    <span>Desktop Chrome / Edge: Click the Install icon</span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/40 border border-sky-400/40 text-white">
                      <MonitorDown className="w-3.5 h-3.5 text-sky-400" />
                      <span>/</span>
                      <Download className="w-3.5 h-3.5 text-sky-400" />
                    </span>
                    <span>in your address bar.</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Path B: Desktop App & Local Companion Bridge */}
          <div className="hardware-panel p-6 rounded-2xl border border-studio-borderSubtle bg-studio-surface/60 flex flex-col justify-between gap-5">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="p-3 rounded-xl bg-black/50 border border-white/10 text-sky-400">
                  <Lightbulb className="w-6 h-6" />
                </div>
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 font-bold">
                  SUB-50 MS LOCAL UDP / DTLS
                </span>
              </div>
              <h3 className="text-lg font-subheading font-bold text-white">
                Desktop App &amp; Local Companion Bridge
              </h3>
              <p className="text-xs font-mono text-[#CBD5E1] leading-relaxed">
                Standard browser tabs cannot open raw UDP multicast or DTLS 1.2 sockets. Download and run the standalone Local Companion Bridge (<code>ws://127.0.0.1:47890</code>) to drive smart lights and desktop audio loopback.
              </p>
              <ul className="space-y-1.5 text-xs font-mono text-studio-textMuted pt-1">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" /><span><strong>3-Day Offline Free Trial</strong> — full access with zero internet or login</span></li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" /><span>Built-in System Audio Loopback (Windows WASAPI &amp; macOS) + Embedded Bridge</span></li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" /><span>Philips Hue Entertainment API v2 (DTLS UDP 2100), Govee LAN (4001–4003), WiZ (38899)</span></li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" /><span>Zero cloud-API rate limits — runs 100% offline on your home LAN</span></li>
              </ul>
            </div>
            <div className="flex flex-col gap-2">
              <a
                href="https://github.com/justin11691/Omnivibe.app/releases"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all shadow-md shadow-indigo-500/20"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download 3-Day Free Trial (Windows .exe / macOS .dmg)</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href="/downloads/omnivibe-local-companion-bridge.mjs"
                download
                className="w-full py-2 px-4 rounded-xl bg-studio-card border border-studio-border hover:border-studio-accent text-studio-accent font-mono font-bold text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Portable Local Companion Bridge (.mjs — Node 18+)</span>
              </a>
              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                <a
                  href="/downloads/start-omnivibe-bridge.bat"
                  download
                  className="py-1.5 px-3 rounded-xl bg-black/50 border border-studio-border hover:border-studio-accent text-[#CBD5E1] text-center"
                >
                  Windows Launcher (.bat)
                </a>
                <a
                  href="/downloads/start-omnivibe-bridge.command"
                  download
                  className="py-1.5 px-3 rounded-xl bg-black/50 border border-studio-border hover:border-studio-accent text-[#CBD5E1] text-center"
                >
                  macOS Launcher (.command)
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Searchable Hardware Compatibility Matrix */}
      <section id="compatibility" className="px-4 sm:px-6 py-10 max-w-6xl mx-auto w-full flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-heading tracking-wider uppercase text-white">
              Searchable Hardware Compatibility Matrix
            </h2>
            <p className="text-xs font-mono text-studio-textMuted">
              Verify your smart-lighting hardware before purchasing Pro. Unsupported models are flagged upfront.
            </p>
          </div>
          <a href="/compatibility.html" className="text-xs font-mono text-studio-accent hover:underline">
            Standalone Compatibility Page &rarr;
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-studio-textMuted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Hue Bridge v2, Govee H6006, WiZ, Matter..."
              value={compatSearch}
              onChange={(e) => setCompatSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#0D1117] border border-studio-border text-xs font-mono text-studio-text focus:outline-none focus:border-studio-accent"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'supported', label: 'Supported' },
                { id: 'unsupported', label: 'Unsupported' },
                { id: 'coming_soon', label: 'Coming Soon' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setCompatFilter(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
                  compatFilter === f.id
                    ? 'bg-studio-accent text-black'
                    : 'bg-studio-card border border-studio-borderSubtle text-studio-textMuted hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          {filteredCompat.map((row) => (
            <div
              key={row.model}
              className="hardware-card p-4 rounded-2xl border border-studio-borderSubtle bg-[#0D1117] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-mono font-bold text-white">{row.model}</span>
                  {row.status === 'supported' && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-bold uppercase">
                      Supported
                    </span>
                  )}
                  {row.status === 'unsupported' && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/40 text-amber-300 text-[10px] font-mono font-bold uppercase">
                      Unsupported
                    </span>
                  )}
                  {row.status === 'coming_soon' && (
                    <span className="px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-400/40 text-sky-300 text-[10px] font-mono font-bold uppercase">
                      Coming Soon
                    </span>
                  )}
                </div>
                <div className="text-[11px] font-mono text-studio-accent">{row.protocol}</div>
                <p className="text-xs font-mono text-studio-textMuted">{row.notes}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Audio Source & Platform Guide */}
      <section id="audio-guide" className="px-4 sm:px-6 py-10 max-w-6xl mx-auto w-full flex flex-col gap-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-3xl font-heading tracking-wider uppercase text-white">
            Audio Capture &amp; Latency Guide
          </h2>
          <p className="text-xs font-mono text-studio-textMuted">
            Transparent platform breakdown — zero surprises with mobile DRM or Bluetooth speaker lag.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="hardware-card p-5 rounded-2xl border border-studio-borderSubtle bg-[#0D1117] flex flex-col gap-2.5">
            <div className="flex items-center gap-2 text-sky-400 font-mono font-bold text-xs uppercase">
              <Laptop className="w-4 h-4" />
              <span>Windows &amp; macOS Desktop</span>
            </div>
            <p className="text-xs font-mono text-[#CBD5E1] leading-relaxed">
              Capture <strong>System Audio Loopback</strong> directly from Spotify, Apple Music, YouTube, or games—or plug in any <strong>Wired Line-In / USB Audio Interface</strong>.
            </p>
          </div>

          <div className="hardware-card p-5 rounded-2xl border border-studio-borderSubtle bg-[#0D1117] flex flex-col gap-2.5">
            <div className="flex items-center gap-2 text-amber-400 font-mono font-bold text-xs uppercase">
              <Smartphone className="w-4 h-4" />
              <span>iOS &amp; Android Mobile</span>
            </div>
            <p className="text-xs font-mono text-[#CBD5E1] leading-relaxed">
              Because mobile OS DRM policies block third-party capture of streaming apps, use our <strong>Integrated Local Audio Player</strong> (zero DRM interference) or <strong>Noise-Gated Acoustic Room Mic</strong> (0.5x–3.0x sensitivity).
            </p>
          </div>

          <div className="hardware-card p-5 rounded-2xl border border-studio-borderSubtle bg-[#0D1117] flex flex-col gap-2.5">
            <div className="flex items-center gap-2 text-emerald-400 font-mono font-bold text-xs uppercase">
              <Sliders className="w-4 h-4" />
              <span>DSP &amp; Beat Calibration</span>
            </div>
            <p className="text-xs font-mono text-[#CBD5E1] leading-relaxed">
              Dial in <strong>0–250 ms Audio-to-Light Latency Offset</strong> (Wired, TV, Bluetooth profiles), <strong>Decoupled Master Brightness</strong>, and a <strong>Min-Black Floor</strong> so rooms never snap dark between beats.
            </p>
          </div>
        </div>
      </section>

      {/* One-Time Lifetime License Value Section */}
      <section className="px-4 sm:px-6 py-12 bg-[#090C14] border-t border-white/5">
        <div
          className={`max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 hardware-card p-6 sm:p-8 rounded-3xl border bg-gradient-to-br to-transparent ${
            isPro ? 'border-emerald-500/30 from-emerald-500/10' : 'border-amber-500/30 from-amber-500/5'
          }`}
        >
          <div className="space-y-2.5 max-w-lg text-center md:text-left">
            <span className={`text-xs font-mono uppercase font-bold tracking-wider ${isPro ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isPro ? 'Offline Lifetime License Active' : '100% Offline Desktop Ownership'}
            </span>
            <h2 className="text-2xl sm:text-3xl font-heading tracking-wider uppercase text-white">
              {isPro ? 'OmniVibe Studio Is Unlocked' : '3-Day Free Trial, Then $9.99 Once'}
            </h2>
            <p className="text-xs font-mono text-studio-textMuted leading-relaxed">
              Download and install the 100% offline Windows or macOS program with a full 3-day free trial. Keep it forever with a one-time $9.99 offline key — all 9 shaders, all 9 Studio skins, TV Stage Casting, and built-in Hue, Govee &amp; WiZ lighting sync included with zero tiers or subscriptions.
            </p>
            <div className="flex items-center justify-center md:justify-start gap-2.5 text-xs font-mono text-emerald-400 pt-1">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>14-Day Money-Back Guarantee • Offline Cryptographic Key</span>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 w-full md:w-auto shrink-0">
            {isPro ? (
              <>
                <button
                  onClick={onEnterStudio}
                  className="px-6 sm:px-8 py-3.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/50 hover:bg-emerald-500/30 text-emerald-300 font-mono font-bold text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>✓ PRO UNLOCKED ON THIS DEVICE</span>
                </button>
                <button
                  onClick={onOpenUnlockModal}
                  className="text-xs font-mono text-studio-textMuted hover:text-white text-center underline cursor-pointer py-1"
                >
                  Manage / Copy License Key
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleBuyUnlockCode}
                  disabled={isCheckingOut}
                  className="px-6 sm:px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 text-black font-mono font-bold text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-amber-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-60 cursor-pointer whitespace-nowrap"
                >
                  <span>{isCheckingOut ? 'LOADING STRIPE...' : 'BUY LIFETIME KEY — $9.99'}</span>
                  <ExternalLink className="w-4 h-4 shrink-0" />
                </button>
                <button
                  onClick={onOpenUnlockModal}
                  className="text-xs font-mono text-studio-textMuted hover:text-white text-center underline cursor-pointer py-1"
                >
                  Already have a code? Activate here
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Footer with Complete Nav & Legal Links */}
      <footer className="px-4 sm:px-6 py-6 border-t border-white/5 bg-[#05070A] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-studio-textMuted">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold">OmniVibe Studio</span>
          <span>•</span>
          <span>Offline-First Visuals &amp; Local Companion Bridge</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button onClick={onEnterStudio} className="hover:text-studio-accent cursor-pointer">
            Web Studio
          </button>
          <a href="/compatibility.html" className="hover:text-studio-accent">
            Compatibility
          </a>
          <a href="/faq.html" className="hover:text-studio-accent">
            FAQ
          </a>
          <a href="/privacy.html" className="hover:text-studio-accent">
            Privacy Policy
          </a>
          <a href="/terms.html" className="hover:text-studio-accent">
            Terms of Service
          </a>
        </div>
      </footer>
    </div>
  );
};
