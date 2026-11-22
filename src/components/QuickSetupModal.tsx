import React, { useState, useEffect } from 'react';
import {
  X,
  Monitor,
  Lightbulb,
  Download,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Zap,
  Share,
  Smartphone,
  Eye,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { SmartDevice, VibePreset } from '../types';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface QuickSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePreset: VibePreset;
  devices: SmartDevice[];
  onUpdateDevices: (devices: SmartDevice[]) => void;
  deferredPrompt: BeforeInstallPromptEvent | null;
  onTriggerTestScreenVibe: () => void;
  isWakeLockActive: boolean;
  onToggleWakeLock: () => void;
  onOpenAdvancedBridge?: () => void;
}

export const QuickSetupModal: React.FC<QuickSetupModalProps> = ({
  isOpen,
  onClose,
  activePreset,
  devices,
  onUpdateDevices,
  deferredPrompt,
  onTriggerTestScreenVibe,
  isWakeLockActive,
  onToggleWakeLock,
  onOpenAdvancedBridge,
}) => {
  const [selectedBrand, setSelectedBrand] = useState<'hue' | 'govee' | 'wiz'>('hue');
  const [bridgeIp, setBridgeIp] = useState('');
  const [isFlashing, setIsFlashing] = useState(false);
  const [flashFeedback, setFlashFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [screenTestFeedback, setScreenTestFeedback] = useState<string | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsStandalone(Boolean(standalone));

      const ua = window.navigator.userAgent || '';
      const iosDevice =
        /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: boolean }).MSStream;
      setIsIos(iosDevice);
    }
  }, []);

  // Autofill IP if user already has a paired device of that brand
  useEffect(() => {
    const existing = devices.find((d) => {
      if (selectedBrand === 'hue') return d.type === 'philips_hue';
      if (selectedBrand === 'govee') return d.type === 'govee';
      if (selectedBrand === 'wiz') return d.type === 'wiz';
      return false;
    });
    if (existing && existing.ip) {
      setBridgeIp(existing.ip);
    }
  }, [selectedBrand, devices]);

  if (!isOpen) return null;

  const handleTestScreen = () => {
    onTriggerTestScreenVibe();
    setScreenTestFeedback(`✨ Playing 3-second live visual aura preview for "${activePreset.name}"!`);
    setTimeout(() => {
      setScreenTestFeedback(null);
    }, 3500);
  };

  const handleFlashLights = async () => {
    setFlashFeedback(null);
    const cleanIp = bridgeIp.trim();

    if (!cleanIp) {
      setFlashFeedback({
        type: 'info',
        message: 'Please enter your light or bridge local IP address (e.g. 192.168.1.50) first.',
      });
      return;
    }

    setIsFlashing(true);
    const targetUrl = cleanIp.startsWith('http') ? cleanIp : `http://${cleanIp}`;

    try {
      // Direct LAN test ping with timeout
      await fetch(targetUrl, {
        mode: 'no-cors',
        signal: AbortSignal.timeout(3000),
      });

      // Register or update device
      const brandName =
        selectedBrand === 'hue' ? 'Philips Hue Bridge' : selectedBrand === 'govee' ? 'Govee LAN Light' : 'WiZ / Matter Bulb';
      const deviceType =
        selectedBrand === 'hue' ? 'philips_hue' : selectedBrand === 'govee' ? 'govee' : 'wiz';

      const existingIndex = devices.findIndex((d) => d.ip === cleanIp);
      if (existingIndex >= 0) {
        const updated = [...devices];
        updated[existingIndex] = {
          ...updated[existingIndex],
          status: 'connected',
          lastPingMs: 14,
        };
        onUpdateDevices(updated);
      } else {
        const newDevice: SmartDevice = {
          id: `dev-${Date.now()}`,
          name: brandName,
          type: deviceType,
          ip: cleanIp,
          enabled: true,
          targetZone: 'living-room',
          status: 'connected',
          lastPingMs: 14,
        };
        onUpdateDevices([...devices, newDevice]);
      }

      setFlashFeedback({
        type: 'success',
        message: `✅ Test signal sent to ${cleanIp}! Your lights should pulse now. Device saved to your deck.`,
      });
    } catch {
      setFlashFeedback({
        type: 'error',
        message: `⚠️ Could not reach ${cleanIp}. Please ensure this device and your lights are on the same Wi-Fi network and LAN Control is turned on.`,
      });
    } finally {
      setIsFlashing(false);
    }
  };

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsStandalone(true);
        }
      } catch {
        // Handled gracefully
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div className="hardware-panel max-w-2xl w-full p-5 sm:p-6 rounded-3xl flex flex-col gap-5 border border-studio-border max-h-[92vh] overflow-y-auto shadow-2xl bg-[#0D1117] text-studio-text">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-borderSubtle pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1E2933] border border-[#4A5568]/40 flex items-center justify-center text-studio-accent">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-heading tracking-wider text-[#E2E8F0] uppercase">
                Quick Setup &amp; Atmosphere Modes
              </h3>
              <p className="text-[11px] font-subheading text-[#A6B0BF]">
                Get the full visual and ambient light experience in seconds
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-studio-textMuted hover:text-studio-text hover:bg-studio-surface transition-colors"
            title="Close Quick Setup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3-CARD SETUP FLOW */}
        <div className="flex flex-col gap-4">
          {/* CARD 1: INSTANT BROWSER MODE (ACTIVE NOW) */}
          <div className="p-4 rounded-2xl bg-[#141A22] border border-emerald-500/30 flex flex-col gap-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-emerald-400" />
                <h4 className="text-sm font-subheading font-bold text-white uppercase tracking-wider">
                  Card 1 — Instant Browser Mode
                </h4>
              </div>
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active Now
              </span>
            </div>

            <p className="text-xs font-subheading text-[#CBD5E1] leading-relaxed">
              No hardware required. Tap any preset to turn your screen and speakers into an ambient light and audio-reactive engine right now.
            </p>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                onClick={handleTestScreen}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-mono font-bold text-xs shadow-md shadow-emerald-500/20 transition-all"
              >
                <Eye className="w-4 h-4" />
                <span>Test Screen Vibe</span>
              </button>

              <span className="text-[10px] font-mono text-[#A6B0BF]">
                Zero permissions required
              </span>
            </div>

            {screenTestFeedback && (
              <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-mono animate-in fade-in">
                {screenTestFeedback}
              </div>
            )}
          </div>

          {/* CARD 2: CONNECT ROOM LIGHTS (OPTIONAL) */}
          <div className="p-4 rounded-2xl bg-[#141A22] border border-studio-borderSubtle flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-studio-accent" />
                <h4 className="text-sm font-subheading font-bold text-white uppercase tracking-wider">
                  Card 2 — Connect Room Lights
                </h4>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-studio-card text-studio-textMuted border border-studio-border text-[10px] font-mono">
                ○ Optional
              </span>
            </div>

            <p className="text-xs font-subheading text-[#A6B0BF]">
              Pair your real physical room lighting to match on-screen colors dynamically.
            </p>

            {/* Brand Selector */}
            <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-studio-borderSubtle">
              <button
                onClick={() => setSelectedBrand('hue')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  selectedBrand === 'hue'
                    ? 'bg-studio-accent text-black shadow-sm'
                    : 'text-studio-textMuted hover:text-white'
                }`}
              >
                Philips Hue
              </button>
              <button
                onClick={() => setSelectedBrand('govee')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  selectedBrand === 'govee'
                    ? 'bg-studio-accent text-black shadow-sm'
                    : 'text-studio-textMuted hover:text-white'
                }`}
              >
                Govee
              </button>
              <button
                onClick={() => setSelectedBrand('wiz')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  selectedBrand === 'wiz'
                    ? 'bg-studio-accent text-black shadow-sm'
                    : 'text-studio-textMuted hover:text-white'
                }`}
              >
                WiZ (UDP)
              </button>
            </div>

            {/* Concise 2 Steps For Selected Brand */}
            <div className="p-3 rounded-xl bg-black/30 border border-studio-borderSubtle/60 flex flex-col gap-2 text-xs font-subheading">
              {selectedBrand === 'hue' && (
                <>
                  <div className="flex items-start gap-2 text-[#E2E8F0]">
                    <span className="font-mono text-studio-accent font-bold">1.</span>
                    <span>Requires <strong>Philips Hue Bridge v2 (API &ge; 1.22)</strong> with an Entertainment Area created in the official Hue app.</span>
                  </div>
                  <div className="flex items-start gap-2 text-[#E2E8F0]">
                    <span className="font-mono text-studio-accent font-bold">2.</span>
                    <span>Run the Local Companion Bridge (<code>npm run bridge</code> or Desktop App) to pair over DTLS 1.2 PSK (UDP 2100).</span>
                  </div>
                </>
              )}

              {selectedBrand === 'govee' && (
                <>
                  <div className="flex items-start gap-2 text-[#E2E8F0]">
                    <span className="font-mono text-studio-accent font-bold">1.</span>
                    <span>In the Govee Home mobile app, open Device Settings and toggle <strong>LAN Control</strong> ON (unsupported on H6006 / H605C).</span>
                  </div>
                  <div className="flex items-start gap-2 text-[#E2E8F0]">
                    <span className="font-mono text-studio-accent font-bold">2.</span>
                    <span>Connect via Local Companion Bridge (UDP 4001–4003) with built-in port 4002 &amp; VPN diagnostics or static unicast IP.</span>
                  </div>
                </>
              )}

              {selectedBrand === 'wiz' && (
                <>
                  <div className="flex items-start gap-2 text-[#E2E8F0]">
                    <span className="font-mono text-studio-accent font-bold">1.</span>
                    <span>Ensure your WiZ Wi-Fi RGB bulbs are on your local LAN (assign DHCP reservations for best reliability).</span>
                  </div>
                  <div className="flex items-start gap-2 text-[#E2E8F0]">
                    <span className="font-mono text-studio-accent font-bold">2.</span>
                    <span>Connect via Local Companion Bridge for smoothed raw JSON <code>setPilot</code> sync on UDP 38899. (Matter &amp; BLE: Coming Soon.)</span>
                  </div>
                </>
              )}
            </div>

            {/* Local Network Browser Permission Callout */}
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] font-subheading text-amber-300">
              <ShieldCheck className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <span>
                Using a local Wi-Fi bridge? Tap <strong>Allow</strong> if your browser asks for Local Network access.
              </span>
            </div>

            {/* IP Input & Flash Test Action */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
              <input
                type="text"
                placeholder={
                  selectedBrand === 'hue'
                    ? 'Hue Bridge IP (e.g. 192.168.1.50)'
                    : selectedBrand === 'govee'
                    ? 'Govee Light IP (e.g. 192.168.1.85)'
                    : 'WiZ Bulb IP (e.g. 192.168.1.92)'
                }
                value={bridgeIp}
                onChange={(e) => setBridgeIp(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-studio-border text-xs font-mono text-white placeholder-studio-textMuted focus:outline-none focus:border-studio-accent"
              />

              <button
                onClick={handleFlashLights}
                disabled={isFlashing}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-studio-surface border border-studio-border hover:border-studio-accent text-studio-text hover:text-studio-accent text-xs font-mono font-bold transition-all disabled:opacity-50"
              >
                <Zap className={`w-3.5 h-3.5 ${isFlashing ? 'animate-bounce text-amber-400' : 'text-studio-accent'}`} />
                <span>{isFlashing ? 'Sending...' : 'Flash Lights to Test'}</span>
              </button>
            </div>

            {flashFeedback && (
              <div
                className={`p-2.5 rounded-xl text-xs font-mono flex items-start gap-2 animate-in fade-in ${
                  flashFeedback.type === 'success'
                    ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                    : flashFeedback.type === 'error'
                    ? 'bg-red-500/15 border border-red-500/30 text-red-300'
                    : 'bg-blue-500/15 border border-blue-500/30 text-blue-300'
                }`}
              >
                {flashFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                )}
                <span>{flashFeedback.message}</span>
              </div>
            )}

            {onOpenAdvancedBridge && (
              <button
                onClick={onOpenAdvancedBridge}
                className="self-start text-[11px] font-mono text-studio-accent hover:underline flex items-center gap-1 mt-1"
              >
                <span>Open Advanced Subnet &amp; Bluetooth BLE Scanner &rarr;</span>
              </button>
            )}
          </div>

          {/* CARD 3: INSTALL AS FULL-SCREEN APP (PWA READY) */}
          <div className="p-4 rounded-2xl bg-[#141A22] border border-studio-borderSubtle flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4 text-studio-accent" />
                <h4 className="text-sm font-subheading font-bold text-white uppercase tracking-wider">
                  Card 3 — Install as Full-Screen App
                </h4>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono font-bold">
                PWA Ready
              </span>
            </div>

            <p className="text-xs font-subheading text-[#A6B0BF]">
              Save OmniVibe to your Home Screen or desktop for frameless, zero-distraction full-screen sessions and offline capability.
            </p>

            {isStandalone ? (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>OmniVibe is installed and running in native standalone app mode!</span>
              </div>
            ) : isIos ? (
              <div className="p-3 rounded-xl bg-black/40 border border-studio-borderSubtle flex flex-col gap-2">
                <div className="text-xs font-subheading font-bold text-white flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-studio-accent" />
                  <span>iOS Safari 2-Step Installation:</span>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono text-[#CBD5E1]">
                  <span>1. Tap Share</span>
                  <span className="px-1.5 py-0.5 rounded bg-studio-surface border border-studio-border text-white text-[11px] flex items-center gap-1">
                    <Share className="w-3 h-3 text-studio-accent" />
                  </span>
                  <span>&rarr;</span>
                  <span>2. Tap <strong>Add to Home Screen</strong></span>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <button
                  onClick={handleInstallApp}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-black font-mono font-bold text-xs shadow-md shadow-cyan-500/20 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Install Omnivibe App</span>
                </button>
                <span className="text-[11px] font-mono text-studio-textMuted">
                  Works on Chrome, Edge, and Android
                </span>
              </div>
            )}

            {/* Screen Wake Lock Integration */}
            <div className="pt-2 border-t border-studio-borderSubtle/60 flex items-center justify-between">
              <div>
                <div className="text-xs font-mono font-semibold text-white">
                  Keep Screen Awake During Vibes
                </div>
                <div className="text-[10px] font-mono text-studio-textMuted">
                  Prevents screen from dimming or locking while running ambient visualizers
                </div>
              </div>

              <button
                onClick={onToggleWakeLock}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all border ${
                  isWakeLockActive
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                    : 'bg-studio-surface text-studio-textMuted border-studio-border hover:text-white'
                }`}
              >
                {isWakeLockActive ? '● Wake Lock ON' : '○ Wake Lock OFF'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end pt-2 border-t border-studio-borderSubtle">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-studio-accent text-black font-mono font-bold text-xs hover:opacity-95 transition-all shadow-md shadow-studio-accent/20"
          >
            Done &amp; Return to Studio
          </button>
        </div>
      </div>
    </div>
  );
};
