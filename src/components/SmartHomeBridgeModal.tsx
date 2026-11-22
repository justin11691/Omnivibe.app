import React, { useEffect, useState } from 'react';
import { SmartDevice, RoomZone } from '../types';
import { companionBridge, BridgeDiagnostics } from '../utils/companionBridgeClient';
import {
  X,
  Cpu,
  Wifi,
  Radio,
  Sparkles,
  Info,
  ShieldAlert,
  CheckCircle2,
  Lock,
  Trash2,
  RefreshCw,
  Terminal,
  Zap,
  Play,
  Square,
  Plus,
} from 'lucide-react';

interface SmartHomeBridgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices: SmartDevice[];
  onUpdateDevices: (devices: SmartDevice[]) => void;
  zones: RoomZone[];
  isPro?: boolean;
  onOpenUpgradeModal?: () => void;
}

interface HueArea {
  id: string;
  name: string;
  status: string;
  channelCount: number;
  channels: Array<{ channelId: number; position: { x: number; y: number; z: number } }>;
}

export const SmartHomeBridgeModal: React.FC<SmartHomeBridgeModalProps> = ({
  isOpen,
  onClose,
  devices,
  onUpdateDevices,
  zones,
  isPro = true,
  onOpenUpgradeModal,
}) => {
  const [activeTab, setActiveTab] = useState<'hue' | 'govee' | 'wiz'>('hue');
  const [bridgeOnline, setBridgeOnline] = useState(companionBridge.isConnected);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  // Philips Hue Entertainment API v2 Wizard state
  const [hueIp, setHueIp] = useState('');
  const [hueUsername, setHueUsername] = useState('');
  const [hueClientKey, setHueClientKey] = useState('');
  const [hueAreas, setHueAreas] = useState<HueArea[]>([]);
  const [selectedHueAreaId, setSelectedHueAreaId] = useState('');
  const [isHueStreaming, setIsHueStreaming] = useState(false);
  const [hueGuidance, setHueGuidance] = useState<string | null>(null);

  // Govee LAN UDP + Diagnostics state
  const [goveeDiag, setGoveeDiag] = useState<BridgeDiagnostics | null>(null);
  const [goveeStaticIp, setGoveeStaticIp] = useState('');
  const [goveeStaticName, setGoveeStaticName] = useState('');
  const [goveeRazerEnabled, setGoveeRazerEnabled] = useState(false);

  // WiZ Raw JSON UDP state
  const [wizStaticIp, setWizStaticIp] = useState('');
  const [wizStaticName, setWizStaticName] = useState('');

  const [selectedZone, setSelectedZone] = useState(zones[0]?.id || 'living-room');

  useEffect(() => {
    if (!isOpen) return;
    const unsub = companionBridge.subscribeStatus(setBridgeOnline);
    companionBridge.connect(1200).catch(() => {});
    return unsub;
  }, [isOpen]);

  if (!isOpen) return null;

  const requireProAndBridge = (): boolean => {
    if (!isPro) {
      onOpenUpgradeModal?.();
      return false;
    }
    if (!bridgeOnline) {
      setErrorMessage(
        'Local Companion Bridge is offline. Start it via `npm run bridge` or launch the OmniVibe Studio Desktop app to open native UDP/DTLS sockets.'
      );
      return false;
    }
    setErrorMessage(null);
    return true;
  };

  // --- PHILIPS HUE ENTERTAINMENT API WIZARD ---
  const handleHueDiscover = async () => {
    if (!requireProAndBridge()) return;
    setIsBusy(true);
    setStatusMessage('Scanning LAN via SSDP for Philips Hue Bridge v2 (API >= 1.22)...');
    try {
      const bridges = await companionBridge.rpc<Array<any>>('hue:discover', { timeoutMs: 2500 });
      if (!bridges || bridges.length === 0) {
        setStatusMessage('No Hue Bridge found via SSDP. Enter your Hue Bridge v2 local IP manually below.');
      } else {
        const supported = bridges.find((b) => b.entertainmentSupported);
        if (supported) {
          setHueIp(supported.ip);
          setStatusMessage(`Found ${supported.name} at ${supported.ip} (API ${supported.apiVersion}, Entertainment Ready).`);
        } else {
          setErrorMessage(bridges[0].reason || 'Hue Bridge v1 detected — Hue Bridge v2 (API >= 1.22) is required.');
        }
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Hue discovery failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleHuePair = async () => {
    if (!requireProAndBridge()) return;
    if (!hueIp.trim()) {
      setErrorMessage('Enter your Hue Bridge v2 local IP address first.');
      return;
    }
    setIsBusy(true);
    setStatusMessage('Requesting username + DTLS 1.2 PSK clientkey from Hue Bridge v2...');
    try {
      const res = await companionBridge.rpc<any>('hue:pair', { ip: hueIp.trim() });
      if (!res.ok) {
        setErrorMessage(res.message);
        setStatusMessage(null);
      } else {
        setHueUsername(res.username);
        setHueClientKey(res.clientkey);
        setStatusMessage('Paired with Hue Bridge v2! Username & PSK clientkey stored locally. Querying Entertainment Areas...');
        const areaRes = await companionBridge.rpc<any>('hue:areas', { ip: hueIp.trim(), username: res.username });
        setHueAreas(areaRes.areas || []);
        if (areaRes.guidance) setHueGuidance(areaRes.guidance);
        if (areaRes.areas?.[0]) setSelectedHueAreaId(areaRes.areas[0].id);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Hue pairing failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleHueQueryAreas = async () => {
    if (!requireProAndBridge()) return;
    if (!hueIp.trim() || !hueUsername.trim()) {
      setErrorMessage('Pair your Hue Bridge v2 first to load Entertainment Areas.');
      return;
    }
    setIsBusy(true);
    try {
      const areaRes = await companionBridge.rpc<any>('hue:areas', { ip: hueIp.trim(), username: hueUsername.trim() });
      setHueAreas(areaRes.areas || []);
      setHueGuidance(areaRes.guidance || null);
      if (areaRes.areas?.[0] && !selectedHueAreaId) setSelectedHueAreaId(areaRes.areas[0].id);
      setStatusMessage(`Loaded ${(areaRes.areas || []).length} Entertainment Area(s).`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load Entertainment Areas.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleHueStream = async () => {
    if (!requireProAndBridge()) return;
    setIsBusy(true);
    try {
      if (isHueStreaming) {
        const stopRes = await companionBridge.rpc<any>('hue:stop');
        setIsHueStreaming(false);
        setStatusMessage(`Entertainment stream stopped. Restored ${stopRes.restored ?? 0} bulb state(s) and unlocked Hue app control.`);
      } else {
        const area = hueAreas.find((a) => a.id === selectedHueAreaId);
        if (!area) {
          setErrorMessage('Select an Entertainment Area (up to 10 color lights) first.');
          setIsBusy(false);
          return;
        }
        const startRes = await companionBridge.rpc<any>('hue:start', {
          ip: hueIp.trim(),
          username: hueUsername.trim(),
          clientkey: hueClientKey.trim(),
          areaId: area.id,
          channels: area.channels,
        });
        setIsHueStreaming(true);
        setStatusMessage(
          `DTLS 1.2 PSK streaming active on UDP:${startRes.port} at ${startRes.targetHz} Hz (${startRes.cipherSuite}). Hue app control is locked until stopped.`
        );
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Hue Entertainment stream error.');
    } finally {
      setIsBusy(false);
    }
  };

  // --- GOVEE LAN UDP + PRE-FLIGHT DIAGNOSTICS ---
  const handleRunGoveeDiagnostics = async () => {
    if (!requireProAndBridge()) return;
    setIsBusy(true);
    setStatusMessage('Running Govee pre-flight network diagnostics (UDP 4002 bind, VPN & dual-homing check)...');
    try {
      const diag = await companionBridge.rpc<BridgeDiagnostics>('govee:diagnostics');
      setGoveeDiag(diag);
      setStatusMessage(diag.ok ? 'Pre-flight diagnostics passed: UDP 4002 available and clean LAN routing.' : 'Diagnostics completed with network advisories below.');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Govee diagnostics failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDiscoverGovee = async () => {
    if (!requireProAndBridge()) return;
    setIsBusy(true);
    setStatusMessage('Broadcasting Govee LAN multicast scan (239.255.255.250:4001 -> listening UDP 4002)...');
    try {
      const res = await companionBridge.rpc<any>('govee:discover', { timeoutMs: 2500 });
      if (!res.ok) {
        setErrorMessage(res.error || 'Govee multicast bind error on UDP 4002.');
      } else if (res.devices?.length) {
        const added: SmartDevice[] = res.devices
          .filter((d: any) => !devices.some((existing) => existing.ip === d.ip && existing.type === 'govee'))
          .map((d: any) => ({
            id: `govee-${d.ip}`,
            name: `Govee ${d.sku || 'LAN'} (${d.ip})`,
            type: 'govee' as const,
            ip: d.ip,
            enabled: true,
            targetZone: selectedZone,
            status: 'connected' as const,
            lastPingMs: 18,
          }));
        if (added.length > 0) onUpdateDevices([...devices, ...added]);
        setStatusMessage(`Discovered ${res.devices.length} Govee LAN device(s).`);
      } else {
        setStatusMessage('No multicast replies received. Ensure "LAN Control" is toggled ON in Govee Home app, or add a Static Unicast IP below.');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Govee discovery failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleAddStaticDevice = (type: 'govee' | 'wiz', ip: string, name: string) => {
    if (!isPro) {
      onOpenUpgradeModal?.();
      return;
    }
    const cleanIp = ip.trim();
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(cleanIp)) {
      setErrorMessage('Enter a valid local IPv4 address (e.g. 192.168.1.45).');
      return;
    }
    setErrorMessage(null);
    const dev: SmartDevice = {
      id: `${type}-${cleanIp}-${Date.now()}`,
      name: name.trim() || `${type === 'govee' ? 'Govee LAN' : 'WiZ Bulb'} (${cleanIp})`,
      type,
      ip: cleanIp,
      enabled: true,
      targetZone: selectedZone,
      status: 'connected',
      lastPingMs: 20,
    };
    onUpdateDevices([...devices, dev]);
    if (type === 'govee') {
      setGoveeStaticIp('');
      setGoveeStaticName('');
      if (goveeRazerEnabled && bridgeOnline) {
        companionBridge.rpc('govee:razer', { ip: cleanIp, enabled: true }).catch(() => {});
      }
    } else {
      setWizStaticIp('');
      setWizStaticName('');
    }
    setStatusMessage(`Added ${dev.name} for direct unicast UDP control.`);
  };

  // --- WIZ RAW JSON UDP DISCOVERY ---
  const handleDiscoverWiz = async () => {
    if (!requireProAndBridge()) return;
    setIsBusy(true);
    setStatusMessage('Broadcasting WiZ UDP discovery (255.255.255.255:38899)...');
    try {
      const res = await companionBridge.rpc<any>('wiz:discover', { timeoutMs: 2200 });
      if (res.devices?.length) {
        const added: SmartDevice[] = res.devices
          .filter((d: any) => !devices.some((existing) => existing.ip === d.ip && existing.type === 'wiz'))
          .map((d: any) => ({
            id: `wiz-${d.ip}`,
            name: `WiZ Bulb (${d.ip})`,
            type: 'wiz' as const,
            ip: d.ip,
            enabled: true,
            targetZone: selectedZone,
            status: 'connected' as const,
            lastPingMs: 16,
          }));
        if (added.length > 0) onUpdateDevices([...devices, ...added]);
        setStatusMessage(`Found ${res.devices.length} WiZ bulb(s) on UDP 38899. Assign DHCP reservations for best reliability.`);
      } else {
        setStatusMessage('No WiZ bulbs responded to UDP broadcast. Add bulb static IPs manually below (DHCP reservation recommended).');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'WiZ discovery failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveDevice = (id: string) => {
    onUpdateDevices(devices.filter((d) => d.id !== id));
  };

  const goveeDevices = devices.filter((d) => d.type === 'govee');
  const wizDevices = devices.filter((d) => d.type === 'wiz');

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none animate-in fade-in duration-200">
      <div className="hardware-panel max-w-3xl w-full p-6 rounded-3xl flex flex-col gap-4 border border-studio-border max-h-[92vh] overflow-hidden shadow-2xl bg-[#0D1117]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-borderSubtle pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1E2933] border border-[#4A5568]/40 flex items-center justify-center text-studio-accent">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-heading tracking-wider text-[#E2E8F0] uppercase">
                Local Companion Bridge
              </h3>
              <p className="text-[10px] font-subheading text-[#A6B0BF] uppercase tracking-wider">
                Sub-50 ms Local Wi-Fi Sync (Hue DTLS 2100 • Govee LAN 4001–4003 • WiZ UDP 38899)
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

        {/* Local Companion Bridge Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-[#141A22] border border-studio-borderSubtle text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${bridgeOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className={bridgeOnline ? 'text-emerald-300 font-bold' : 'text-amber-300 font-bold'}>
              {bridgeOnline
                ? 'Local Companion Bridge Connected (ws://127.0.0.1:47890)'
                : 'Companion Bridge Offline — Browser Mode Only'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!bridgeOnline && (
              <span className="text-[10px] text-studio-textMuted hidden sm:inline">
                Run <code className="text-sky-300">npm run bridge</code> or Desktop App for UDP/DTLS sockets
              </span>
            )}
            <button
              type="button"
              onClick={() => companionBridge.connect(1500)}
              className="px-2.5 py-1 rounded-lg bg-studio-card border border-studio-border hover:border-studio-accent text-[11px] text-studio-text flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3 text-studio-accent" />
              <span>Reconnect</span>
            </button>
          </div>
        </div>

        {/* Free-Tier Preview Banner */}
        {!isPro && (
          <div className="p-3.5 rounded-2xl bg-studio-surface/90 border border-amber-400/35 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/40 text-amber-300 text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />
                <span>Preview Mode</span>
              </span>
              <span className="text-xs font-mono text-studio-text">
                Inspect Philips Hue, Govee LAN, and WiZ pairing workflows before upgrading.
              </span>
            </div>
            <button
              type="button"
              onClick={() => onOpenUpgradeModal?.()}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-sky-400 hover:opacity-95 text-black font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Unlock Full Offline App ($9.99)</span>
            </button>
          </div>
        )}

        {/* Driver Protocol Tabs */}
        <div className="flex items-center gap-1.5 bg-[#141A22] p-1.5 rounded-2xl border border-studio-borderSubtle">
          {[
            { id: 'hue', label: 'Philips Hue (DTLS 2100)' },
            { id: 'govee', label: 'Govee LAN (UDP 4001–4003)' },
            { id: 'wiz', label: 'WiZ (Raw JSON UDP 38899)' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setActiveTab(t.id as 'hue' | 'govee' | 'wiz');
                setErrorMessage(null);
              }}
              className={`flex-1 py-2 px-2 rounded-xl text-[11px] font-mono uppercase tracking-wider font-bold transition-all cursor-pointer ${
                activeTab === t.id
                  ? 'bg-studio-accent text-black shadow-sm'
                  : 'text-studio-textMuted hover:text-studio-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1">
          {/* TAB 1: PHILIPS HUE ENTERTAINMENT API v2 */}
          {activeTab === 'hue' && (
            <div className="flex flex-col gap-3">
              <div className="p-3.5 rounded-2xl bg-black/40 border border-studio-borderSubtle text-xs font-mono text-[#CBD5E1] space-y-1.5">
                <div className="font-bold text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Entertainment API v2 Only (Hue Bridge v2, API &ge; 1.22)</span>
                </div>
                <p className="text-[11px] text-studio-textMuted">
                  Streams binary big-endian HueStream v2 frames over DTLS 1.2 PSK (<code>TLS_PSK_WITH_AES_128_GCM_SHA256</code>) to UDP port 2100 at 35 Hz. Never falls back to rate-limited REST <code>/lights</code> endpoints.
                </p>
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-400/30 text-[11px] text-amber-200 flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                  <span>
                    Normal Hue app control of lamps in the active Entertainment Area is locked while streaming and automatically restored to each bulb&apos;s previous color &amp; brightness when stopped.
                  </span>
                </div>
              </div>

              {/* Step 1: Discover / IP */}
              <div className="hardware-card p-4 rounded-2xl flex flex-col gap-2.5 bg-[#1E2933]">
                <div className="text-xs font-mono font-bold text-white">Step 1 — Locate Hue Bridge v2 on LAN</div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    placeholder="Hue Bridge v2 IP (e.g. 192.168.1.24)"
                    value={hueIp}
                    onChange={(e) => setHueIp(e.target.value)}
                    className="flex-1 min-w-[200px] px-3 py-2 rounded-xl bg-black/50 border border-studio-border text-xs font-mono text-studio-text focus:outline-none focus:border-studio-accent"
                  />
                  <button
                    type="button"
                    onClick={handleHueDiscover}
                    disabled={isBusy}
                    className="px-4 py-2 rounded-xl bg-studio-surface hover:bg-studio-card border border-studio-border hover:border-studio-accent text-xs font-mono font-bold text-studio-accent cursor-pointer"
                  >
                    Discover Bridge (SSDP)
                  </button>
                </div>
              </div>

              {/* Step 2: Link Button Pair */}
              <div className="hardware-card p-4 rounded-2xl flex flex-col gap-2.5 bg-[#1E2933]">
                <div className="text-xs font-mono font-bold text-white">
                  Step 2 — Press Physical Bridge Link Button &amp; Generate DTLS PSK
                </div>
                <p className="text-[11px] font-mono text-studio-textMuted">
                  Press the circular Link button on top of your Hue Bridge v2, then click Pair within 30 seconds to generate both <code>username</code> and <code>clientkey</code>.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleHuePair}
                    disabled={isBusy}
                    className="px-4 py-2 rounded-xl bg-studio-accent text-black font-mono font-bold text-xs cursor-pointer"
                  >
                    Pair Bridge &amp; Generate PSK
                  </button>
                  {hueUsername && (
                    <span className="text-[11px] font-mono text-emerald-300 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Credentials stored locally
                    </span>
                  )}
                </div>
              </div>

              {/* Step 3: Entertainment Area Selector & Stream Control */}
              <div className="hardware-card p-4 rounded-2xl flex flex-col gap-2.5 bg-[#1E2933]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-white">
                    Step 3 — Select Entertainment Area (Max 10 Color Lights, 1 Active Area)
                  </span>
                  <button
                    type="button"
                    onClick={handleHueQueryAreas}
                    disabled={isBusy}
                    className="text-[11px] font-mono text-studio-accent hover:underline cursor-pointer"
                  >
                    Refresh Areas
                  </button>
                </div>

                {hueGuidance && (
                  <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-400/30 text-[11px] font-mono text-sky-200">
                    {hueGuidance}
                  </div>
                )}

                {hueAreas.length > 0 && (
                  <select
                    value={selectedHueAreaId}
                    onChange={(e) => setSelectedHueAreaId(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-black/50 border border-studio-border text-xs font-mono text-studio-text"
                  >
                    {hueAreas.map((a) => (
                      <option key={a.id} value={a.id} className="bg-neutral-900">
                        {a.name} ({a.channelCount} lights • {a.status})
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  onClick={handleToggleHueStream}
                  disabled={isBusy}
                  className={`w-full py-2.5 rounded-xl font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer ${
                    isHueStreaming
                      ? 'bg-amber-400 text-black'
                      : 'bg-gradient-to-r from-sky-500 to-indigo-600 text-white'
                  }`}
                >
                  {isHueStreaming ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>
                    {isHueStreaming
                      ? 'Stop DTLS Stream & Restore Previous Bulb States'
                      : 'Start Hue Entertainment Stream (UDP 2100)'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: GOVEE LAN UDP + PRE-FLIGHT DIAGNOSTICS */}
          {activeTab === 'govee' && (
            <div className="flex flex-col gap-3">
              {/* Pre-Flight Network Diagnostics */}
              <div className="hardware-card p-4 rounded-2xl flex flex-col gap-3 bg-[#1E2933]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-mono font-bold text-white flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <span>Pre-Flight Network Diagnostics (UDP 4001 / 4002 / 4003)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRunGoveeDiagnostics}
                      disabled={isBusy}
                      className="px-3 py-1.5 rounded-xl bg-studio-surface border border-studio-border hover:border-studio-accent text-xs font-mono text-studio-accent cursor-pointer"
                    >
                      Run Diagnostics
                    </button>
                    <button
                      type="button"
                      onClick={handleDiscoverGovee}
                      disabled={isBusy}
                      className="px-3 py-1.5 rounded-xl bg-studio-accent text-black text-xs font-mono font-bold cursor-pointer"
                    >
                      Multicast Scan
                    </button>
                  </div>
                </div>

                <ul className="text-[11px] font-mono text-studio-textMuted space-y-1 list-disc pl-4">
                  <li>Toggle <strong>LAN Control</strong> ON per device in the Govee Home mobile app (zero cloud HTTP API fallback).</li>
                  <li>UDP port <strong>4002</strong> conflict check detects Home Assistant, Homebridge, or Govee Desktop on the same IP.</li>
                  <li>Active VPNs, Wi-Fi/Ethernet dual-homing, or IoT VLAN multicast drops can be bypassed using Static IP Unicast below.</li>
                </ul>

                {goveeDiag && (
                  <div className="space-y-2 pt-1">
                    {goveeDiag.warnings.length === 0 ? (
                      <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-mono text-emerald-300 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>UDP 4002 is free and no VPN / dual-homing conflicts were detected.</span>
                      </div>
                    ) : (
                      goveeDiag.warnings.map((w) => (
                        <div
                          key={w.code}
                          className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-400/35 text-[11px] font-mono text-amber-200"
                        >
                          <strong>{w.code}:</strong> {w.message}
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Razer / Dreamview 0xB1 Toggle */}
                <label className="flex items-center justify-between pt-2 border-t border-studio-borderSubtle text-xs font-mono cursor-pointer">
                  <span className="text-studio-text">
                    Enable Razer / Dreamview High-Speed Mode (<code>0xB1</code> on UDP 4003)
                  </span>
                  <input
                    type="checkbox"
                    checked={goveeRazerEnabled}
                    onChange={(e) => setGoveeRazerEnabled(e.target.checked)}
                    className="w-4 h-4 accent-studio-accent cursor-pointer"
                  />
                </label>
              </div>

              {/* Static Unicast IP Fallback */}
              <div className="hardware-card p-4 rounded-2xl flex flex-col gap-2.5 bg-[#1E2933]">
                <div className="text-xs font-mono font-bold text-white">
                  Direct Static-IP Unicast Bypass (UDP 4003)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Device IP (e.g. 192.168.1.62)"
                    value={goveeStaticIp}
                    onChange={(e) => setGoveeStaticIp(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-black/50 border border-studio-border text-xs font-mono text-studio-text"
                  />
                  <input
                    type="text"
                    placeholder="Label (e.g. Desk Light Strip)"
                    value={goveeStaticName}
                    onChange={(e) => setGoveeStaticName(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-black/50 border border-studio-border text-xs font-mono text-studio-text"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddStaticDevice('govee', goveeStaticIp, goveeStaticName)}
                    className="px-3 py-2 rounded-xl bg-studio-accent text-black font-mono font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Unicast IP</span>
                  </button>
                </div>

                {goveeDevices.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    {goveeDevices.map((d) => (
                      <div key={d.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-black/40 border border-studio-borderSubtle text-xs font-mono">
                        <span className="text-studio-text">{d.name} — <span className="text-studio-accent">{d.ip}:4003</span></span>
                        <button onClick={() => handleRemoveDevice(d.id)} className="text-studio-textMuted hover:text-amber-300 cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: WIZ RAW JSON UDP 38899 */}
          {activeTab === 'wiz' && (
            <div className="flex flex-col gap-3">
              <div className="hardware-card p-4 rounded-2xl flex flex-col gap-3 bg-[#1E2933]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-mono font-bold text-white flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-sky-400" />
                    <span>WiZ Local Raw JSON over UDP (Ports 38899 / 38900)</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDiscoverWiz}
                    disabled={isBusy}
                    className="px-3.5 py-1.5 rounded-xl bg-studio-accent text-black text-xs font-mono font-bold cursor-pointer"
                  >
                    Broadcast Discover (255.255.255.255)
                  </button>
                </div>
                <p className="text-[11px] font-mono text-studio-textMuted">
                  Sends raw JSON <code>setPilot</code> commands over UDP 38899 with exponential color &amp; dimming interpolation enabled to eliminate step jitter. We recommend setting DHCP IP reservations in your router and adding static unicast IPs below.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="WiZ Bulb IP (e.g. 192.168.1.75)"
                    value={wizStaticIp}
                    onChange={(e) => setWizStaticIp(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-black/50 border border-studio-border text-xs font-mono text-studio-text"
                  />
                  <input
                    type="text"
                    placeholder="Label (e.g. Floor Lamp)"
                    value={wizStaticName}
                    onChange={(e) => setWizStaticName(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-black/50 border border-studio-border text-xs font-mono text-studio-text"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddStaticDevice('wiz', wizStaticIp, wizStaticName)}
                    className="px-3 py-2 rounded-xl bg-studio-accent text-black font-mono font-bold text-xs flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Static Bulb</span>
                  </button>
                </div>

                {wizDevices.length > 0 && (
                  <div className="space-y-1.5 pt-2">
                    {wizDevices.map((d) => (
                      <div key={d.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-black/40 border border-studio-borderSubtle text-xs font-mono">
                        <span className="text-studio-text">{d.name} — <span className="text-sky-300">{d.ip}:38899</span></span>
                        <button onClick={() => handleRemoveDevice(d.id)} className="text-studio-textMuted hover:text-amber-300 cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Target Zone & Roadmap Note */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-black/30 border border-studio-borderSubtle text-[11px] font-mono text-studio-textMuted">
            <div className="flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-studio-accent" />
              <span>Assign discovered lights to Zone:</span>
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className="px-2 py-0.5 rounded bg-black/60 border border-studio-border text-studio-text text-[11px]"
              >
                {zones.map((z) => (
                  <option key={z.id} value={z.id} className="bg-neutral-900">
                    {z.name}
                  </option>
                ))}
              </select>
            </div>
            <span>Matter &amp; Bluetooth BLE Ambient Lamps: <strong className="text-sky-300">Coming Soon</strong></span>
          </div>

          {statusMessage && (
            <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-400/30 text-xs font-mono text-sky-200 flex items-start gap-2">
              <Terminal className="w-4 h-4 shrink-0 text-sky-400 mt-0.5" />
              <span>{statusMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-400/35 text-xs font-mono text-amber-200 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-studio-borderSubtle pt-3 flex items-center justify-between text-xs font-mono text-studio-textMuted">
          <span className="text-[11px]">
            Native UDP/DTLS runs locally via Companion Bridge — never via cloud relay.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-studio-accent text-black font-semibold font-mono cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
