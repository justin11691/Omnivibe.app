import {
  SkinTheme,
  VibePreset,
  RoomZone,
  SongVibeRule,
  SmartDevice,
  Guardrails,
  CircadianRule,
  VisualizerSettings,
  ProLicenseState,
  DspCalibrationSettings,
} from '../types';
import {
  DEFAULT_PRESETS,
  DEFAULT_ZONES,
  DEFAULT_GUARDRAILS,
  DEFAULT_CIRCADIAN,
  DEFAULT_VISUALIZER_SETTINGS,
  DEMO_PRO_TEST_KEY,
} from '../data/defaultPresets';

const STORAGE_KEYS = {
  THEME: 'omnivibe_theme',
  PRESETS: 'omnivibe_presets',
  ACTIVE_PRESET_ID: 'omnivibe_active_preset_id',
  ZONES: 'omnivibe_zones',
  SONG_RULES: 'omnivibe_song_rules',
  DEVICES: 'omnivibe_devices',
  GUARDRAILS: 'omnivibe_guardrails',
  CIRCADIAN: 'omnivibe_circadian',
  VISUALIZER: 'omnivibe_visualizer',
  PRO_LICENSE: 'omnivibe_pro_license',
  DSP_CALIBRATION: 'omnivibe_dsp_calibration',
};

export const DEFAULT_DSP_CALIBRATION: DspCalibrationSettings = {
  experienceMode: 'calm',
  latencyOffsetMs: 0,
  latencyProfile: 'wired',
  masterBrightness: 80,
  minBlackFloor: 2,
  micNoiseGate: 8,
  micSensitivity: 1.2,
};

export function loadDspCalibration(): DspCalibrationSettings {
  const loaded = safeParse<Partial<DspCalibrationSettings>>(
    STORAGE_KEYS.DSP_CALIBRATION,
    DEFAULT_DSP_CALIBRATION
  );
  return {
    ...DEFAULT_DSP_CALIBRATION,
    ...loaded,
  };
}

export function saveDspCalibration(settings: DspCalibrationSettings): void {
  try {
    localStorage.setItem(STORAGE_KEYS.DSP_CALIBRATION, JSON.stringify(settings));
  } catch {}
}

// Safe JSON parser
function safeParse<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`[OmniVibe Storage] Failed to parse ${key}:`, e);
    return fallback;
  }
}

// PRO LICENSE MANAGEMENT
export function loadProLicense(): ProLicenseState {
  const loaded = safeParse<ProLicenseState>(STORAGE_KEYS.PRO_LICENSE, {
    isPro: false,
    licenseKey: '',
  });
  if (
    !loaded ||
    loaded.licenseKey === 'OMNI-BETA-TESTER' ||
    loaded.licenseKey === 'SIMULATED-FREE-TIER'
  ) {
    return {
      isPro: false,
      licenseKey: '',
    };
  }
  return {
    isPro: Boolean(loaded.isPro),
    licenseKey: loaded.licenseKey || '',
    activatedAt: loaded.activatedAt,
  };
}

export function saveProLicense(state: ProLicenseState): void {
  localStorage.setItem(STORAGE_KEYS.PRO_LICENSE, JSON.stringify(state));
}

export function validateLicenseKey(inputKey: string): boolean {
  if (!inputKey) return false;
  const clean = inputKey.trim().toUpperCase();
  if (clean === DEMO_PRO_TEST_KEY) return true;
  // Format check: OMNI-PRO-XXXX-XXXX
  const pattern = /^OMNI-PRO-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  return pattern.test(clean);
}

// THEME
export function loadTheme(): SkinTheme {
  const t = localStorage.getItem(STORAGE_KEYS.THEME) as SkinTheme;
  if (
    [
      'obsidian',
      'warm-amber',
      'cool-slate',
      'signal-industrial',
      'nordic-pine',
      'mcintosh-hifi',
      'tokyo-neon',
      'clean-daylight',
      'winamp-classic',
    ].includes(t)
  ) {
    return t;
  }
  return 'obsidian';
}

export function saveTheme(theme: SkinTheme): void {
  localStorage.setItem(STORAGE_KEYS.THEME, theme);
}

// PRESETS
export function loadPresets(): VibePreset[] {
  const loaded = safeParse<VibePreset[]>(STORAGE_KEYS.PRESETS, []);
  if (!loaded || loaded.length === 0) {
    return DEFAULT_PRESETS;
  }

  // Synchronize built-in presets with latest canonical taglines (<= 40 chars) & mood categories
  const defaultMap = new Map(DEFAULT_PRESETS.map((p) => [p.id, p]));
  const synced = loaded.map((p) => {
    const def = defaultMap.get(p.id);
    if (def) {
      return {
        ...p,
        name: def.name,
        pack: def.pack,
        tagline: def.tagline,
        icon: def.icon,
      };
    }
    return p;
  });

  const existingIds = new Set(synced.map((p) => p.id));
  DEFAULT_PRESETS.forEach((def) => {
    if (!existingIds.has(def.id)) {
      synced.push(def);
    }
  });

  return synced;
}

export function savePresets(presets: VibePreset[]): void {
  localStorage.setItem(STORAGE_KEYS.PRESETS, JSON.stringify(presets));
}

// ACTIVE PRESET ID
export function loadActivePresetId(): string {
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_PRESET_ID) || 'deep-focus';
}

export function saveActivePresetId(id: string): void {
  localStorage.setItem(STORAGE_KEYS.ACTIVE_PRESET_ID, id);
}

// ZONES
export function loadZones(): RoomZone[] {
  return safeParse<RoomZone[]>(STORAGE_KEYS.ZONES, DEFAULT_ZONES);
}

export function saveZones(zones: RoomZone[]): void {
  localStorage.setItem(STORAGE_KEYS.ZONES, JSON.stringify(zones));
}

// SONG RULES
export function loadSongRules(): SongVibeRule[] {
  return safeParse<SongVibeRule[]>(STORAGE_KEYS.SONG_RULES, [
    {
      id: 'rule-lofi',
      songQuery: 'lofi',
      artist: 'Chillhop',
      presetId: 'rainy-cyberpunk',
      mode: 'harmonic_flow',
    },
    {
      id: 'rule-electronic',
      songQuery: 'bass',
      artist: '',
      presetId: 'bass-drop',
      mode: 'party_reactive',
    },
    {
      id: 'rule-acoustic',
      songQuery: 'acoustic',
      artist: '',
      presetId: 'cozy-cabin',
      mode: 'ambient_drift',
    },
  ]);
}

export function saveSongRules(rules: SongVibeRule[]): void {
  localStorage.setItem(STORAGE_KEYS.SONG_RULES, JSON.stringify(rules));
}

// SMART DEVICES (Only genuine user-paired hardware; zero mock/filler entries)
export function loadDevices(): SmartDevice[] {
  return safeParse<SmartDevice[]>(STORAGE_KEYS.DEVICES, []);
}

export function saveDevices(devices: SmartDevice[]): void {
  localStorage.setItem(STORAGE_KEYS.DEVICES, JSON.stringify(devices));
}

// GUARDRAILS
export function loadGuardrails(): Guardrails {
  return safeParse<Guardrails>(STORAGE_KEYS.GUARDRAILS, DEFAULT_GUARDRAILS);
}

export function saveGuardrails(g: Guardrails): void {
  localStorage.setItem(STORAGE_KEYS.GUARDRAILS, JSON.stringify(g));
}

// CIRCADIAN
export function loadCircadian(): CircadianRule {
  return safeParse<CircadianRule>(STORAGE_KEYS.CIRCADIAN, DEFAULT_CIRCADIAN);
}

export function saveCircadian(c: CircadianRule): void {
  localStorage.setItem(STORAGE_KEYS.CIRCADIAN, JSON.stringify(c));
}

// VISUALIZER SETTINGS
export function loadVisualizerSettings(): VisualizerSettings {
  return safeParse<VisualizerSettings>(STORAGE_KEYS.VISUALIZER, DEFAULT_VISUALIZER_SETTINGS);
}

export function saveVisualizerSettings(s: VisualizerSettings): void {
  localStorage.setItem(STORAGE_KEYS.VISUALIZER, JSON.stringify(s));
}

// RESET TO FACTORY DEFAULTS
export function resetToFactoryDefaults(): void {
  Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
}

// JSON BACKUP EXPORT / IMPORT
export interface OmniVibeBackup {
  version: 1;
  timestamp: string;
  theme: SkinTheme;
  presets: VibePreset[];
  activePresetId: string;
  zones: RoomZone[];
  songRules: SongVibeRule[];
  devices: SmartDevice[];
  guardrails: Guardrails;
  circadian: CircadianRule;
  visualizerSettings: VisualizerSettings;
  proLicense?: ProLicenseState;
}

export function exportAllToJson(): string {
  const data: OmniVibeBackup = {
    version: 1,
    timestamp: new Date().toISOString(),
    theme: loadTheme(),
    presets: loadPresets(),
    activePresetId: loadActivePresetId(),
    zones: loadZones(),
    songRules: loadSongRules(),
    devices: loadDevices(),
    guardrails: loadGuardrails(),
    circadian: loadCircadian(),
    visualizerSettings: loadVisualizerSettings(),
    proLicense: loadProLicense(),
  };
  return JSON.stringify(data, null, 2);
}

export function importFromJson(jsonStr: string): boolean {
  try {
    const data = JSON.parse(jsonStr) as Partial<OmniVibeBackup>;
    if (data.theme) saveTheme(data.theme);
    if (data.presets && Array.isArray(data.presets)) savePresets(data.presets);
    if (data.activePresetId) saveActivePresetId(data.activePresetId);
    if (data.zones && Array.isArray(data.zones)) saveZones(data.zones);
    if (data.songRules && Array.isArray(data.songRules)) saveSongRules(data.songRules);
    if (data.devices && Array.isArray(data.devices)) saveDevices(data.devices);
    if (data.guardrails) saveGuardrails(data.guardrails);
    if (data.circadian) saveCircadian(data.circadian);
    if (data.visualizerSettings) saveVisualizerSettings(data.visualizerSettings);
    if (data.proLicense) saveProLicense(data.proLicense);
    return true;
  } catch (e) {
    console.error('[OmniVibe Storage] Import error:', e);
    return false;
  }
}

// URL HASH SHAREABLE VIBE CODES
export function encodeVibeToUrlHash(preset: VibePreset): string {
  try {
    const payload = JSON.stringify({
      n: preset.name,
      c: preset.colors,
      t: preset.transitionSpeedMs,
      b: preset.maxBrightness,
      r: preset.audioReactivity,
      s: preset.soundscapeMix,
    });
    return btoa(encodeURIComponent(payload));
  } catch (e) {
    console.error('Failed to encode vibe hash', e);
    return '';
  }
}

export function decodeVibeFromUrlHash(hash: string): Partial<VibePreset> | null {
  try {
    const json = decodeURIComponent(atob(hash));
    const obj = JSON.parse(json);
    return {
      name: obj.n || 'Imported Vibe',
      tagline: 'Custom imported atmosphere via shared link',
      colors: obj.c || ['#38bdf8', '#818cf8', '#f59e0b'],
      transitionSpeedMs: obj.t || 3000,
      maxBrightness: obj.b || 80,
      audioReactivity: obj.r || {
        bassWeight: 1,
        midWeight: 1,
        trebleWeight: 1,
        mode: 'harmonic_flow',
        smoothing: 0.8,
      },
      soundscapeMix: obj.s || { rain: 20, fire: 0, brownNoise: 20, drone: 20 },
    };
  } catch (e) {
    console.warn('Failed to decode vibe hash', e);
    return null;
  }
}
