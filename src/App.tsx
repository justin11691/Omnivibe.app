import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  SkinTheme,
  VibePreset,
  RoomZone,
  AudioTelemetry,
  VisualizerMode,
  VisualizerSettings,
  SongVibeRule,
  SmartDevice,
  Guardrails,
  CircadianRule,
  SoundscapeMix,
  ProLicenseState,
  DspCalibrationSettings,
} from './types';
import {
  loadTheme,
  saveTheme,
  loadPresets,
  savePresets,
  loadActivePresetId,
  saveActivePresetId,
  loadZones,
  saveZones,
  loadSongRules,
  saveSongRules,
  loadDevices,
  saveDevices,
  loadGuardrails,
  saveGuardrails,
  loadCircadian,
  saveCircadian,
  loadVisualizerSettings,
  saveVisualizerSettings,
  loadProLicense,
  saveProLicense,
  loadDspCalibration,
  saveDspCalibration,
  decodeVibeFromUrlHash,
} from './utils/storage';
import { globalAudioEngine, computeCalibratedLightOutput } from './audio/AudioEngine';
import { companionBridge } from './utils/companionBridgeClient';
import { VibeCanvas } from './components/VibeCanvas';
import { AudioDeck } from './components/AudioDeck';
import { AudioPulseMeter } from './components/AudioPulseMeter';
import { VirtualRoom } from './components/VirtualRoom';
import { VisualizerStage } from './visualizer/VisualizerStage';
import { StageWindow } from './visualizer/StageWindow';
import { StudioDrawer } from './components/StudioDrawer';
import { SmartHomeBridgeModal } from './components/SmartHomeBridgeModal';
import { GuardrailsModal } from './components/GuardrailsModal';
import { CircadianModal } from './components/CircadianModal';
import { ShareVibeModal } from './components/ShareVibeModal';
import { SettingsModal } from './components/SettingsModal';
import { UpgradeModal } from './components/UpgradeModal';
import { ZoneManagerModal } from './components/ZoneManagerModal';
import { CustomVisualizerModal } from './components/CustomVisualizerModal';
import { AboutDownloadModal } from './components/AboutDownloadModal';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { DownloadPortal } from './components/DownloadPortal';
import { AdminKeyGeneratorModal } from './components/AdminKeyGeneratorModal';
import { QuickSetupModal } from './components/QuickSetupModal';
import {
  loadPersistentLicense,
  savePersistentLicense,
  validateLicenseKey,
  normalizeLicenseKey,
  formatTrialRemaining,
} from './utils/licenseEngine';
import {
  Sliders,
  Tv,
  Cpu,
  ShieldAlert,
  Sun,
  Share2,
  Settings,
  Sparkles,
  Layers,
  CheckCircle2,
  Lock,
  Paintbrush,
  Plus,
  Download,
  Keyboard,
  Volume2,
} from 'lucide-react';

export const App: React.FC = () => {
  // Check if we are running in standalone Stage Window mode
  const [isStageMode, setIsStageMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('stage') === 'true';
  });

  // View mode: 'download_portal' for new web visitors, 'studio' for native apps and returning studio users
  const [viewMode, setViewMode] = useState<'studio' | 'download_portal'>(() => {
    if (typeof window === 'undefined') return 'studio';
    // Native Electron or Capacitor mobile shell bypasses download portal directly into Studio
    if ((window as any).electronAPI?.isElectron) return 'studio';
    if ((window as any).Capacitor?.isNativePlatform?.()) return 'studio';
    const path = window.location.pathname.toLowerCase().replace(/\/+$/, '');
    if (path === '/studio') return 'studio';
    const params = new URLSearchParams(window.location.search);
    if (params.get('stage') === 'true' || params.get('studio') === 'true') return 'studio';
    const saved = localStorage.getItem('omnivibe_view_mode');
    if (saved === 'studio') return 'studio';
    return 'download_portal';
  });

  // Admin Key Generator Modal state (triggered by ?admin=keygen or Ctrl+Shift+K)
  const [isAdminKeygenOpen, setIsAdminKeygenOpen] = useState<boolean>(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('admin') === 'keygen';
  });

  // State Management
  const [theme, setTheme] = useState<SkinTheme>(loadTheme);
  const [presets, setPresets] = useState<VibePreset[]>(loadPresets);
  const [activePresetId, setActivePresetId] = useState<string>(loadActivePresetId);
  const [zones, setZones] = useState<RoomZone[]>(loadZones);
  const [visualizerMode, setVisualizerMode] = useState<VisualizerMode>('liquid_waveforms');
  const [visualizerSettings, setVisualizerSettings] = useState<VisualizerSettings>(loadVisualizerSettings);
  const [songRules, setSongRules] = useState<SongVibeRule[]>(loadSongRules);
  const [devices, setDevices] = useState<SmartDevice[]>(loadDevices);
  const [guardrails, setGuardrails] = useState<Guardrails>(loadGuardrails);
  const [circadian, setCircadian] = useState<CircadianRule>(loadCircadian);
  const [dspCalibration, setDspCalibration] = useState<DspCalibrationSettings>(loadDspCalibration);

  // Pro Licensing State
  const [proLicense, setProLicense] = useState<ProLicenseState>(loadProLicense);
  const [proCelebrationToast, setProCelebrationToast] = useState<string | null>(null);

  // Audio Telemetry (60fps)
  const [telemetry, setTelemetry] = useState<AudioTelemetry>({
    bass: 0,
    mids: 0,
    treble: 0,
    overall: 0,
    peakHold: 0,
    isSilent: false,
  });

  // Modal open states
  const [isQuickSetupOpen, setIsQuickSetupOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isStudioDrawerOpen, setIsStudioDrawerOpen] = useState(false);
  const [isBridgeModalOpen, setIsBridgeModalOpen] = useState(false);
  const [isGuardrailsModalOpen, setIsGuardrailsModalOpen] = useState(false);
  const [isCircadianModalOpen, setIsCircadianModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isZoneManagerModalOpen, setIsZoneManagerModalOpen] = useState(false);
  const [isCustomVisualizerModalOpen, setIsCustomVisualizerModalOpen] = useState(false);
  const [isAboutDownloadModalOpen, setIsAboutDownloadModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [audioStandbyNotice, setAudioStandbyNotice] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Screen Wake Lock API
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const wakeLockRef = useRef<any>(null);

  const requestWakeLock = useCallback(async () => {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        const sentinel = await (navigator as any).wakeLock.request('screen');
        wakeLockRef.current = sentinel;
        setIsWakeLockActive(true);
        sentinel.addEventListener('release', () => {
          setIsWakeLockActive(false);
          wakeLockRef.current = null;
        });
      } catch {
        setIsWakeLockActive(false);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {}
      wakeLockRef.current = null;
      setIsWakeLockActive(false);
    }
  }, []);

  const handleToggleWakeLock = useCallback(async () => {
    if (isWakeLockActive) {
      await releaseWakeLock();
    } else {
      await requestWakeLock();
    }
  }, [isWakeLockActive, releaseWakeLock, requestWakeLock]);

  // Re-acquire wake lock on visibilitychange when user returns to app tab
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isWakeLockActive) {
        await requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isWakeLockActive, requestWakeLock]);

  // Panel visit tracking to eliminate simultaneous yellow notification dots
  const [visitedPanels, setVisitedPanels] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('omnivibe_visited_panels');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  const markPanelVisited = (panelKey: string) => {
    setVisitedPanels((prev) => {
      if (prev[panelKey]) return prev;
      const updated = { ...prev, [panelKey]: true };
      try {
        localStorage.setItem('omnivibe_visited_panels', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleTriggerTestScreenVibe = () => {
    const prevBrightness = activePreset.maxBrightness;
    handleUpdateActivePreset({ ...activePreset, maxBrightness: 100 });
    setTimeout(() => {
      handleUpdateActivePreset({ ...activePreset, maxBrightness: prevBrightness });
    }, 3500);
  };

  // Auto-detect browser Web Audio standby status
  useEffect(() => {
    const handleFirstInteraction = () => {
      globalAudioEngine.initAudioContext().catch(() => {});
      setAudioStandbyNotice(false);
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };

    window.addEventListener('pointerdown', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);

    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);

  // Load persistent license or 7-day offline Electron trial from native storage on mount
  useEffect(() => {
    loadPersistentLicense().then((rec) => {
      if (rec && (rec.isPro || rec.trialStatus)) {
        setProLicense({
          isPro: rec.isPro,
          licenseKey: rec.licenseKey,
          activatedAt: rec.unlockedAt,
          isTrial: rec.isTrial,
          trialStatus: rec.trialStatus,
        });
      }
    });
  }, []);

  // Capture PWA desktop install prompt
  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  // Active preset object
  const activePreset =
    presets.find((p) => p.id === activePresetId) || presets[0];

  const isElectronEnv = Boolean((window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron);
  // Web Studio acts as an open interactive demo; Desktop App enforces the 3-day offline trial + $9.99 lifetime key
  const hasStudioAccess = !isElectronEnv || proLicense.isPro;

  // Subscribe to real-time audio FFT telemetry & stream calibrated frames to Local Companion Bridge
  useEffect(() => {
    const unsubscribe = globalAudioEngine.subscribeTelemetry((t) => {
      setTelemetry(t);
      if (companionBridge.isConnected) {
        const primaryHex = (activePreset.colors[0] || '#38bdf8').replace('#', '');
        const r = parseInt(primaryHex.slice(0, 2), 16) || 56;
        const g = parseInt(primaryHex.slice(2, 4), 16) || 189;
        const b = parseInt(primaryHex.slice(4, 6), 16) || 248;
        const energy = t.bass * 0.5 + t.mids * 0.3 + t.treble * 0.2;
        const brightness = computeCalibratedLightOutput(
          energy,
          dspCalibration.masterBrightness,
          dspCalibration.minBlackFloor,
          dspCalibration.experienceMode
        );
        const goveeIps = devices.filter((d) => d.enabled && d.type === 'govee').map((d) => d.ip);
        const wizIps = devices.filter((d) => d.enabled && d.type === 'wiz').map((d) => d.ip);
        companionBridge.sendSyncFrame({
          r,
          g,
          b,
          brightness,
          goveeIps,
          wizIps,
          smoothing: dspCalibration.experienceMode === 'party' ? 0.55 : 0.25,
        });
      }
    });
    return () => unsubscribe();
  }, [activePreset.colors, devices, dspCalibration]);

  // Update theme class on HTML document root
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove(
      'theme-obsidian',
      'theme-warm-amber',
      'theme-cool-slate',
      'theme-signal-industrial',
      'theme-nordic-pine',
      'theme-mcintosh-hifi',
      'theme-tokyo-neon',
      'theme-clean-daylight',
      'theme-winamp-classic'
    );
    root.classList.add(`theme-${theme}`);
    saveTheme(theme);
  }, [theme]);

  // Check URL query parameters on mount:
  // 1. Detect Stripe checkout return (?pro_activated=true or ?session_id=...)
  // 2. Detect URL hash shareable vibe (#vibe=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check Stripe checkout return
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('pro_activated') === 'true' || urlParams.has('session_id')) {
      const sessionId = urlParams.get('session_id') || '';
      window.history.replaceState({}, document.title, window.location.pathname);

      const activateWithKey = async (key: string, tier: 'LIFETIME_PRO' | 'FOUNDER_VIP' | 'ENTERPRISE_STUDIO' = 'LIFETIME_PRO') => {
        const nowIso = new Date().toISOString();
        const newState: ProLicenseState = {
          isPro: true,
          licenseKey: key,
          activatedAt: nowIso,
        };
        saveProLicense(newState);
        setProLicense(newState);
        await savePersistentLicense({
          isPro: true,
          licenseKey: key,
          unlockedAt: nowIso,
          tier,
          buyerName: 'Verified Pro Member',
        });
        setProCelebrationToast(`Welcome to OmniVibe Pro! License ${key} is active offline.`);
        setTimeout(() => setProCelebrationToast(null), 6000);
      };

      if (sessionId && sessionId.length >= 8) {
        fetch(`/api/checkout-status?session_id=${encodeURIComponent(sessionId)}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data && data.paid && data.licenseKey) {
              return activateWithKey(data.licenseKey, data.tier || 'LIFETIME_PRO');
            }
            return undefined;
          })
          .catch(() => {});
      }
    }

    // Check URL Hash for shared preset
    const hash = window.location.hash;
    if (hash && hash.startsWith('#vibe=')) {
      const code = hash.replace('#vibe=', '');
      const imported = decodeVibeFromUrlHash(code);
      if (imported) {
        const newPreset: VibePreset = {
          id: `shared-${Date.now()}`,
          name: imported.name || 'Shared Vibe',
          pack: 'Imported',
          tagline: imported.tagline || 'Imported via shared link',
          icon: 'Sparkles',
          colors: imported.colors || ['#38bdf8', '#818cf8', '#f59e0b'],
          transitionSpeedMs: imported.transitionSpeedMs || 3000,
          maxBrightness: imported.maxBrightness || 80,
          audioReactivity: imported.audioReactivity || {
            bassWeight: 1,
            midWeight: 1,
            trebleWeight: 1,
            mode: 'harmonic_flow',
            smoothing: 0.8,
          },
          soundscapeMix: imported.soundscapeMix || { rain: 20, fire: 0, brownNoise: 20, drone: 20 },
        };
        setPresets((prev) => [newPreset, ...prev]);
        setActivePresetId(newPreset.id);
        saveActivePresetId(newPreset.id);
      }
    }
  }, []);

  // Handle Preset Selection
  const handleSelectPreset = useCallback((preset: VibePreset) => {
    if (preset.isPro && !hasStudioAccess) {
      setIsUpgradeModalOpen(true);
      return;
    }

    setActivePresetId(preset.id);
    saveActivePresetId(preset.id);

    globalAudioEngine.updateSoundscapeMix(preset.soundscapeMix);
    globalAudioEngine.bassGain = preset.audioReactivity.bassWeight;
    globalAudioEngine.midGain = preset.audioReactivity.midWeight;
    globalAudioEngine.trebleGain = preset.audioReactivity.trebleWeight;
  }, [hasStudioAccess]);

  // Toggle Room Zones
  const handleToggleZone = (zoneId: string) => {
    if (!hasStudioAccess) {
      const updated = zones.map((z) => ({
        ...z,
        active: z.id === zoneId ? !z.active : false,
      }));
      setZones(updated);
      saveZones(updated);
      return;
    }

    const updated = zones.map((z) => (z.id === zoneId ? { ...z, active: !z.active } : z));
    setZones(updated);
    saveZones(updated);
  };

  // Launch Stage Window (Broadcast Sync)
  const handleLaunchStageWindow = () => {
    if (!hasStudioAccess) {
      setIsUpgradeModalOpen(true);
      return;
    }
    if (isElectronEnv && (window as unknown as { electronAPI?: { launchStage?: () => void } }).electronAPI?.launchStage) {
      (window as unknown as { electronAPI: { launchStage: () => void } }).electronAPI.launchStage();
      return;
    }
    window.open(`${window.location.origin}/?stage=true`, 'OmniVibeStage', 'width=1280,height=720,menubar=no,toolbar=no');
  };

  // Open Studio Drawer
  const handleOpenStudioDrawer = () => {
    if (!hasStudioAccess) {
      setIsUpgradeModalOpen(true);
      return;
    }
    setIsStudioDrawerOpen(true);
  };

  // Open Smart Home Bridge
  const handleOpenBridge = () => {
    setIsBridgeModalOpen(true);
  };

  // Open Circadian Scheduler
  const handleOpenCircadian = () => {
    if (!hasStudioAccess) {
      setIsUpgradeModalOpen(true);
      return;
    }
    setIsCircadianModalOpen(true);
  };

  // Open Share Modal
  const handleOpenShare = () => {
    if (!hasStudioAccess) {
      setIsUpgradeModalOpen(true);
      return;
    }
    setIsShareModalOpen(true);
  };

  // Activate Pro License Key
  const handleActivatePro = (key: string) => {
    const validation = validateLicenseKey(key);
    const normalized = normalizeLicenseKey(key);
    const newState: ProLicenseState = {
      isPro: true,
      licenseKey: normalized,
      activatedAt: new Date().toISOString(),
    };
    saveProLicense(newState);
    setProLicense(newState);
    savePersistentLicense({
      isPro: true,
      licenseKey: normalized,
      unlockedAt: newState.activatedAt || new Date().toISOString(),
      tier: validation.tier || 'LIFETIME_PRO',
      buyerName: validation.buyerName,
    });
    setProCelebrationToast(`Welcome to OmniVibe Pro! (${validation.tier || 'LIFETIME_PRO'}) Lifetime license active.`);
    setTimeout(() => setProCelebrationToast(null), 5000);
  };

  const handleUpdateActivePreset = (updated: VibePreset) => {
    const nextPresets = presets.map((p) => (p.id === updated.id ? updated : p));
    setPresets(nextPresets);
    savePresets(nextPresets);
  };

  const handleSaveAsNewPreset = (newPreset: VibePreset) => {
    const nextPresets = [newPreset, ...presets];
    setPresets(nextPresets);
    savePresets(nextPresets);
    setActivePresetId(newPreset.id);
    saveActivePresetId(newPreset.id);
  };

  const handleMixChange = (mix: SoundscapeMix) => {
    const updated = { ...activePreset, soundscapeMix: mix };
    handleUpdateActivePreset(updated);
  };

  const handleDataResetOrImported = () => {
    setTheme(loadTheme());
    setPresets(loadPresets());
    setActivePresetId(loadActivePresetId());
    setZones(loadZones());
    setSongRules(loadSongRules());
    setDevices(loadDevices());
    setGuardrails(loadGuardrails());
    setCircadian(loadCircadian());
    setVisualizerSettings(loadVisualizerSettings());
    setProLicense(loadProLicense());
  };

  // Global Hardware Studio Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl instanceof HTMLInputElement ||
        activeEl instanceof HTMLTextAreaElement ||
        (activeEl as HTMLElement)?.isContentEditable;

      if (e.key === 'Escape') {
        setIsUpgradeModalOpen(false);
        setIsStudioDrawerOpen(false);
        setIsBridgeModalOpen(false);
        setIsGuardrailsModalOpen(false);
        setIsCircadianModalOpen(false);
        setIsShareModalOpen(false);
        setIsSettingsModalOpen(false);
        setIsZoneManagerModalOpen(false);
        setIsCustomVisualizerModalOpen(false);
        setIsAboutDownloadModalOpen(false);
        setIsShortcutsModalOpen(false);
        setIsAdminKeygenOpen(false);
        return;
      }

      // Secret Admin Keygen Shortcut: Ctrl+Shift+K or Cmd+Shift+K (Dev only)
      if (import.meta.env.DEV && (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsAdminKeygenOpen((prev) => !prev);
        return;
      }

      if (isInput) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (globalAudioEngine.isPlaying) {
          globalAudioEngine.pause();
        } else {
          globalAudioEngine.playSoundscapes(activePreset.soundscapeMix);
        }
      } else if (e.key === 'm' || e.key === 'M') {
        globalAudioEngine.toggleMute();
      } else if (e.key === 'f' || e.key === 'F') {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      } else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setIsShortcutsModalOpen((prev) => !prev);
      } else if (e.key === 'z' || e.key === 'Z') {
        setIsZoneManagerModalOpen((prev) => !prev);
      } else if (e.key === 'b' || e.key === 'B') {
        setIsBridgeModalOpen((prev) => !prev);
      } else if (e.key === 'c' || e.key === 'C') {
        if (proLicense.isPro) setIsCircadianModalOpen((prev) => !prev);
        else setIsUpgradeModalOpen(true);
      } else if (e.key === 's' || e.key === 'S') {
        if (proLicense.isPro) setIsShareModalOpen((prev) => !prev);
        else setIsUpgradeModalOpen(true);
      } else if (e.key === 'd' || e.key === 'D') {
        setIsAboutDownloadModalOpen((prev) => !prev);
      } else if (e.key >= '1' && e.key <= '9') {
        const modes: VisualizerMode[] = [
          'winamp_milkdrop',
          'cyber_tunnel_3d',
          'cube_matrix_3d',
          'lava_blobs_3d',
          'spectrum_3d',
          'liquid_waveforms',
          'geometric_particles',
          'harmonic_nebula',
          'custom_user',
        ];
        const targetMode = modes[parseInt(e.key, 10) - 1];
        if (targetMode) {
          setVisualizerMode(targetMode);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePreset.soundscapeMix, proLicense.isPro]);

  // If in stage window mode, render dedicated zero-chrome stage view
  if (isStageMode) {
    return <StageWindow />;
  }

  // If in web download portal mode, render landing & download hub
  if (viewMode === 'download_portal') {
    return (
      <>
        <DownloadPortal
          onEnterStudio={() => {
            setViewMode('studio');
            localStorage.setItem('omnivibe_view_mode', 'studio');
          }}
          onOpenUnlockModal={() => setIsUpgradeModalOpen(true)}
          isPro={proLicense.isPro}
          deferredPrompt={deferredPrompt}
        />
        <UpgradeModal
          isOpen={isUpgradeModalOpen}
          onClose={() => setIsUpgradeModalOpen(false)}
          onActivatePro={handleActivatePro}
          isPro={proLicense.isPro}
          currentLicenseKey={proLicense.licenseKey}
        />
        {import.meta.env.DEV && (
          <AdminKeyGeneratorModal
            isOpen={isAdminKeygenOpen}
            onClose={() => setIsAdminKeygenOpen(false)}
            onApplyKeyToCurrentSession={handleActivatePro}
          />
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-studio-bg text-studio-text flex flex-col font-sans transition-colors duration-300">
      {/* PRO CELEBRATION TOAST */}
      {proCelebrationToast && (
        <div className="bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-500 text-black px-4 py-2.5 text-center text-xs font-mono font-bold flex items-center justify-center gap-2 shadow-lg animate-in fade-in duration-300">
          <CheckCircle2 className="w-4 h-4 fill-black text-white" />
          <span>{proCelebrationToast}</span>
        </div>
      )}

      {/* MASTER TOP CONTROL BAR */}
      <header className="sticky top-0 z-40 bg-studio-surface/90 backdrop-blur-md border-b border-studio-border px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2.5 select-none">
        {/* Brand, Live Pulse Aura & Top Status Pill */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div
            className="w-10 h-10 rounded-xl bg-[#0B111A] border border-cyan-400/40 overflow-hidden flex items-center justify-center transition-all duration-200 shrink-0"
            style={{
              boxShadow: `0 0 18px ${activePreset.colors[0] || '#22d3ee'}45, 0 0 10px rgba(217, 70, 239, 0.28)`,
            }}
          >
            <img
              src="/omnivibe-logo.jpg"
              alt="OmniVibe Studio Logo"
              className="w-full h-full object-cover scale-110"
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-heading tracking-widest text-[#E2E8F0] uppercase leading-none truncate">
                OMNIVIBE
              </h1>
            </div>
            <p className="text-[9px] sm:text-[10px] font-subheading tracking-wider uppercase text-[#A6B0BF] truncate whitespace-nowrap">
              <span className="hidden sm:inline">ATMOSPHERE &amp; </span>VISUAL MOOD STUDIO
            </p>
          </div>

          {/* Quick Setup Mode Status Pill (● Browser Mode / ● Lights Linked) */}
          <button
            onClick={() => setIsQuickSetupOpen(true)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold transition-all border shadow-sm ${
              devices.filter((d) => d.enabled).length > 0
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                : 'bg-studio-card border-studio-border hover:border-studio-accent text-studio-accent hover:bg-studio-surface'
            }`}
            title="Open Quick Setup Flow (Browser Mode, Light Link & Fullscreen App)"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                devices.filter((d) => d.enabled).length > 0
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-cyan-400 animate-pulse'
              }`}
            />
            <span>
              {devices.filter((d) => d.enabled).length > 0
                ? `● Lights Linked (${devices.filter((d) => d.enabled).length})`
                : '● Browser Mode'}
            </span>
          </button>
        </div>

        {/* Quick Room Zones Selector Bar */}
        <div className="hidden xl:flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-studio-borderSubtle">
          <span className="text-[10px] font-mono text-studio-textMuted px-2 flex items-center gap-1">
            <Layers className="w-3 h-3" /> ZONES:
          </span>
          {zones.map((zone) => (
            <button
              key={zone.id}
              onClick={() => handleToggleZone(zone.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
                zone.active
                  ? 'bg-studio-surface text-studio-text border border-studio-accent font-semibold shadow-sm'
                  : 'text-studio-textMuted hover:text-studio-text hover:bg-studio-card/60'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  zone.active ? 'bg-studio-accent' : 'bg-gray-600'
                }`}
              />
              <span>{zone.name}</span>
            </button>
          ))}
          <button
            onClick={() => setIsZoneManagerModalOpen(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-mono text-studio-accent hover:bg-studio-accent/20 border border-studio-accent/30 transition-all ml-1"
            title="Customize House Zones (Add / Remove / Configure Rooms)"
          >
            <Plus className="w-3 h-3" />
            <span>Edit Zones</span>
          </button>
        </div>

        {/* Action Toolset: 5 Unlabeled-to-Labeled Toolbar Buttons + Right-aligned PRO Pill */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* 1. TV Mode */}
          <button
            onClick={() => {
              markPanelVisited('tv_mode');
              handleLaunchStageWindow();
            }}
            className="group flex flex-col items-center justify-center p-1.5 sm:px-2 rounded-xl bg-studio-card border border-studio-border hover:border-studio-accent text-studio-text transition-all relative min-w-[44px]"
            title={hasStudioAccess ? 'Launch Zero-Chrome Visualizer on TV or 2nd Monitor' : '3-Day Trial Ended — Unlock for $9.99'}
          >
            <Tv className="w-4 h-4 text-studio-accent group-hover:scale-105 transition-transform" />
            <span className="text-[10px] font-mono text-studio-text/90 group-hover:text-studio-text mt-0.5 leading-none whitespace-nowrap">
              TV Mode
            </span>
            {!hasStudioAccess && <Lock className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-amber-400" aria-label="Locked" />}
            {hasStudioAccess && !visitedPanels['tv_mode'] && (
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
            )}
          </button>

          {/* 2. Lights */}
          <button
            onClick={() => {
              markPanelVisited('lights');
              handleOpenBridge();
            }}
            className="group flex flex-col items-center justify-center p-1.5 sm:px-2 rounded-xl bg-studio-card border border-studio-border hover:border-studio-accent text-studio-text transition-all relative min-w-[44px]"
            title="Local Companion Bridge (Hue DTLS, Govee LAN, WiZ UDP)"
          >
            <Cpu className="w-4 h-4 text-studio-accent group-hover:scale-105 transition-transform" />
            <span className="text-[10px] font-mono text-studio-text/90 group-hover:text-studio-text mt-0.5 leading-none whitespace-nowrap">
              Lights
            </span>
            {!hasStudioAccess && <Lock className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-amber-400" aria-label="Locked" />}
            {hasStudioAccess && devices.length === 0 && !visitedPanels['lights'] && (
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
            )}
          </button>

          {/* 3. Safety */}
          <button
            onClick={() => {
              markPanelVisited('safety');
              setIsGuardrailsModalOpen(true);
            }}
            className="group flex flex-col items-center justify-center p-1.5 sm:px-2 rounded-xl bg-studio-card border border-studio-border hover:border-studio-accent text-studio-text transition-all relative min-w-[44px]"
            title="Photosensitivity & Quiet Hours Guardrails"
          >
            <ShieldAlert className="w-4 h-4 text-purple-400 group-hover:scale-105 transition-transform" />
            <span className="text-[10px] font-mono text-studio-text/90 group-hover:text-studio-text mt-0.5 leading-none whitespace-nowrap">
              Safety
            </span>
          </button>

          {/* 4. Bright */}
          <button
            onClick={() => {
              markPanelVisited('brightness');
              handleOpenCircadian();
            }}
            className="group flex flex-col items-center justify-center p-1.5 sm:px-2 rounded-xl bg-studio-card border border-studio-border hover:border-studio-accent text-studio-text transition-all relative min-w-[44px]"
            title="Circadian Biological Clock & Max Brightness Scheduler"
          >
            <Sun className="w-4 h-4 text-amber-400 group-hover:scale-105 transition-transform" />
            <span className="text-[10px] font-mono text-studio-text/90 group-hover:text-studio-text mt-0.5 leading-none whitespace-nowrap">
              Bright
            </span>
            {!hasStudioAccess && <Lock className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-amber-400" aria-label="Locked" />}
            {hasStudioAccess && !circadian.enabled && !visitedPanels['brightness'] && (
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
            )}
          </button>

          {/* 5. Share */}
          <button
            onClick={() => {
              markPanelVisited('share');
              handleOpenShare();
            }}
            className="group flex flex-col items-center justify-center p-1.5 sm:px-2 rounded-xl bg-studio-card border border-studio-border hover:border-studio-accent text-studio-text transition-all relative min-w-[44px]"
            title="Share Vibe Code & Party Guest QR"
          >
            <Share2 className="w-4 h-4 text-studio-accent group-hover:scale-105 transition-transform" />
            <span className="text-[10px] font-mono text-studio-text/90 group-hover:text-studio-text mt-0.5 leading-none whitespace-nowrap">
              Share
            </span>
            {!hasStudioAccess && <Lock className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-amber-400" aria-label="Locked" />}
          </button>

          {/* Right Header License / Trial / Download Pill */}
          {!isElectronEnv && !proLicense.isPro ? (
            <button
              onClick={() => setViewMode('download_portal')}
              className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 text-amber-400 font-mono font-bold text-[11px] transition-all shadow-sm shadow-amber-500/10 ml-1 cursor-pointer whitespace-nowrap"
              title="Download 100% Offline Desktop App (3-Day Free Trial, then $9.99)"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>GET APP · $9.99</span>
            </button>
          ) : !proLicense.isPro ? (
            <button
              onClick={() => setIsUpgradeModalOpen(true)}
              className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 text-amber-400 font-mono font-bold text-xs transition-all shadow-sm shadow-amber-500/10 ml-1 cursor-pointer whitespace-nowrap"
              title="3-Day Free Trial Ended — Enter $9.99 Offline License Key"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>TRIAL ENDED · $9.99</span>
            </button>
          ) : proLicense.isTrial ? (
            <button
              onClick={() => setIsUpgradeModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-sky-500/15 border border-sky-400/40 hover:bg-sky-500/25 text-sky-300 font-mono font-bold text-[11px] ml-1 cursor-pointer whitespace-nowrap"
              title="3-Day Offline Free Trial Active — Click to Enter $9.99 Lifetime Key"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>TRIAL · {formatTrialRemaining(proLicense.trialStatus)}</span>
            </button>
          ) : (
            <button
              onClick={() => setIsUpgradeModalOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 text-emerald-400 font-mono font-bold text-xs ml-1 cursor-pointer whitespace-nowrap"
              title="Offline Lifetime License Active — Manage or Copy Key"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>LICENSED</span>
            </button>
          )}

          {/* Settings & Skins */}
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="p-2 rounded-xl bg-studio-card border border-studio-border hover:border-studio-accent text-studio-textMuted hover:text-studio-text transition-all ml-0.5 cursor-pointer"
            title="Studio Settings, Skins & Backup"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Studio Drawer Toggle */}
          <button
            onClick={handleOpenStudioDrawer}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-500 via-fuchsia-500 to-amber-500 hover:brightness-110 text-white font-mono font-bold text-xs shadow-md shadow-fuchsia-500/25 transition-all ml-0.5 cursor-pointer"
            title="Open Interactive Studio Drawer"
          >
            <Sliders className="w-3.5 h-3.5 text-white" />
            <span className="hidden sm:inline">Studio</span>
            {!hasStudioAccess && <Lock className="w-2.5 h-2.5 text-white/90" />}
          </button>
        </div>
      </header>

      {/* Web Audio Standby Banner (if browser requires gesture to unlock audio) */}
      {audioStandbyNotice && (
        <div
          onClick={() => {
            globalAudioEngine.initAudioContext().catch(() => {});
            setAudioStandbyNotice(false);
          }}
          className="bg-studio-accent/15 border-b border-studio-accent/30 text-studio-accent px-4 py-1.5 text-xs font-mono flex items-center justify-between cursor-pointer hover:bg-studio-accent/25 transition-colors select-none"
        >
          <div className="flex items-center gap-2">
            <Volume2 className="w-3.5 h-3.5 animate-pulse" />
            <span>Browser Audio Standby: Tap anywhere to unlock hardware audio synthesis &amp; 60fps telemetry.</span>
          </div>
          <span className="text-[10px] uppercase font-bold underline">Dismiss</span>
        </div>
      )}

      {/* MAIN TWO-COLUMN STUDIO WORKBENCH */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Vibe Presets Canvas & Audio Engine (7 Cols) */}
        <section className="lg:col-span-7 flex flex-col gap-5">
          {/* Preset Cards & Starter Packs */}
          <VibeCanvas
            presets={presets}
            activePresetId={activePresetId}
            isPro={hasStudioAccess}
            onSelectPreset={handleSelectPreset}
            onOpenStudioDrawer={handleOpenStudioDrawer}
            onOpenUpgradeModal={() => setIsUpgradeModalOpen(true)}
          />

          {/* Multi-Source Audio Engine & Generative Soundscape Deck */}
          <AudioDeck
            soundscapeMix={activePreset.soundscapeMix}
            onMixChange={handleMixChange}
            dspCalibration={dspCalibration}
            onUpdateDspCalibration={(next) => {
              setDspCalibration(next);
              saveDspCalibration(next);
            }}
          />
        </section>

        {/* RIGHT COLUMN: Sticky Visualizer Stage, Virtual Room & Telemetry (5 Cols) */}
        <section className="lg:col-span-5 flex flex-col gap-5 lg:sticky lg:top-20 lg:self-start">
          {/* WMP-Style Visualizer Stage (60fps Canvas) */}
          <div className="w-full aspect-video">
            <VisualizerStage
              mode={visualizerMode}
              preset={activePreset}
              telemetry={telemetry}
              settings={visualizerSettings}
              isPro={hasStudioAccess}
              onModeChange={(m) => setVisualizerMode(m)}
              onOpenUpgradeModal={() => setIsUpgradeModalOpen(true)}
              onOpenCustomBuilder={() => setIsCustomVisualizerModalOpen(true)}
            />
          </div>

          {/* Virtual 2.5D Room Telemetry */}
          <VirtualRoom
            preset={activePreset}
            telemetry={telemetry}
            zones={zones}
            onToggleZone={handleToggleZone}
          />

          {/* Live Frequency Telemetry & Light Flux Meter */}
          <AudioPulseMeter
            telemetry={telemetry}
            preset={activePreset}
            dspCalibration={dspCalibration}
          />
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-studio-border px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-studio-textMuted select-none">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>OmniVibe Studio • 100% Local-First Web Audio &amp; Lighting Console</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Active Skin: <strong className="text-studio-accent uppercase">{theme}</strong></span>
          <span>Status: <strong className={proLicense.isPro ? 'text-amber-400' : 'text-studio-text'}>{proLicense.isPro ? 'PRO (LIFETIME)' : 'FREE STARTER'}</strong></span>
          <span>Zero Server Calls • LocalStorage Persisted</span>
        </div>
      </footer>

      {/* INTERACTIVE STUDIO DRAWER (SLIDE-OVER) */}
      <StudioDrawer
        isOpen={isStudioDrawerOpen}
        onClose={() => setIsStudioDrawerOpen(false)}
        activePreset={activePreset}
        onUpdatePreset={handleUpdateActivePreset}
        onSaveAsNewPreset={handleSaveAsNewPreset}
        visualizerSettings={visualizerSettings}
        onUpdateVisualizerSettings={(s) => {
          setVisualizerSettings(s);
          saveVisualizerSettings(s);
        }}
        songRules={songRules}
        onUpdateSongRules={(rules) => {
          setSongRules(rules);
          saveSongRules(rules);
        }}
        allPresets={presets}
      />

      {/* MODALS */}
      <SmartHomeBridgeModal
        isOpen={isBridgeModalOpen}
        onClose={() => setIsBridgeModalOpen(false)}
        devices={devices}
        onUpdateDevices={(d) => {
          setDevices(d);
          saveDevices(d);
        }}
        zones={zones}
        isPro={hasStudioAccess}
        onOpenUpgradeModal={() => {
          setIsBridgeModalOpen(false);
          setIsUpgradeModalOpen(true);
        }}
      />

      <GuardrailsModal
        isOpen={isGuardrailsModalOpen}
        onClose={() => setIsGuardrailsModalOpen(false)}
        guardrails={guardrails}
        onUpdateGuardrails={(g) => {
          setGuardrails(g);
          saveGuardrails(g);
        }}
      />

      <CircadianModal
        isOpen={isCircadianModalOpen}
        onClose={() => setIsCircadianModalOpen(false)}
        circadian={circadian}
        onUpdateCircadian={(c) => {
          setCircadian(c);
          saveCircadian(c);
        }}
      />

      <ShareVibeModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        preset={activePreset}
        allPresets={presets}
        onSelectPreset={handleSelectPreset}
      />

      <QuickSetupModal
        isOpen={isQuickSetupOpen}
        onClose={() => setIsQuickSetupOpen(false)}
        activePreset={activePreset}
        devices={devices}
        onUpdateDevices={(newDevices) => {
          setDevices(newDevices);
          saveDevices(newDevices);
        }}
        deferredPrompt={deferredPrompt}
        onTriggerTestScreenVibe={handleTriggerTestScreenVibe}
        isWakeLockActive={isWakeLockActive}
        onToggleWakeLock={handleToggleWakeLock}
        onOpenAdvancedBridge={() => {
          setIsQuickSetupOpen(false);
          setIsBridgeModalOpen(true);
        }}
      />

      <ZoneManagerModal
        isOpen={isZoneManagerModalOpen}
        onClose={() => setIsZoneManagerModalOpen(false)}
        zones={zones}
        onUpdateZones={(newZones) => {
          setZones(newZones);
          saveZones(newZones);
        }}
        isPro={proLicense.isPro}
        onOpenUpgradeModal={() => setIsUpgradeModalOpen(true)}
      />

      <CustomVisualizerModal
        isOpen={isCustomVisualizerModalOpen}
        onClose={() => setIsCustomVisualizerModalOpen(false)}
        settings={visualizerSettings}
        onSaveConfig={(cfg) => {
          const updated: VisualizerSettings = {
            ...visualizerSettings,
            customConfig: cfg,
          };
          setVisualizerSettings(updated);
          saveVisualizerSettings(updated);
          setVisualizerMode('custom_user');
        }}
      />

      <AboutDownloadModal
        isOpen={isAboutDownloadModalOpen}
        onClose={() => setIsAboutDownloadModalOpen(false)}
        deferredPrompt={deferredPrompt}
      />

      <KeyboardShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />

      <UpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        onActivatePro={handleActivatePro}
        isPro={proLicense.isPro}
        currentLicenseKey={proLicense.licenseKey}
        isTrial={proLicense.isTrial}
        trialStatus={proLicense.trialStatus}
      />

      {import.meta.env.DEV && (
        <AdminKeyGeneratorModal
          isOpen={isAdminKeygenOpen}
          onClose={() => setIsAdminKeygenOpen(false)}
          onApplyKeyToCurrentSession={handleActivatePro}
        />
      )}

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        currentTheme={theme}
        isPro={hasStudioAccess}
        onSelectTheme={(t) => setTheme(t)}
        onDataResetOrImported={handleDataResetOrImported}
        onOpenUpgradeModal={() => setIsUpgradeModalOpen(true)}
        onToggleProMode={
          import.meta.env.DEV
            ? (enablePro) => {
                const newState: ProLicenseState = {
                  isPro: enablePro,
                  licenseKey: enablePro ? 'OMNI-FOUNDER-2026-FOREVER' : 'SIMULATED-FREE-TIER',
                  activatedAt: new Date().toISOString(),
                };
                saveProLicense(newState);
                setProLicense(newState);
              }
            : undefined
        }
      />
    </div>
  );
};
