export type SkinTheme =
  | 'obsidian'
  | 'warm-amber'
  | 'cool-slate'
  | 'signal-industrial'
  | 'nordic-pine'
  | 'mcintosh-hifi'
  | 'tokyo-neon'
  | 'clean-daylight'
  | 'winamp-classic';

export type ReactivityMode = 'ambient_drift' | 'harmonic_flow' | 'party_reactive';

export type ExperienceMode = 'calm' | 'party';

export type LatencyProfileId = 'wired' | 'bluetooth' | 'tv_soundbar' | 'custom';

export interface DspCalibrationSettings {
  experienceMode: ExperienceMode;
  latencyOffsetMs: number; // 0 - 250 ms
  latencyProfile: LatencyProfileId;
  masterBrightness: number; // 10 - 100 % (decoupled from reactive modulation)
  minBlackFloor: number; // 0.5 - 15 % (prevents snapping completely dark between beats)
  micNoiseGate: number; // 0 - 50 %
  micSensitivity: number; // 0.5 - 3.0 x
  selectedInputDeviceId?: string;
}

export type VisualizerMode =
  | 'liquid_waveforms'
  | 'spectrum_3d'
  | 'geometric_particles'
  | 'harmonic_nebula'
  | 'winamp_milkdrop'
  | 'cyber_tunnel_3d'
  | 'cube_matrix_3d'
  | 'lava_blobs_3d'
  | 'custom_user';

export interface CustomVisualizerConfig {
  name: string;
  baseStyle: 'tunnel' | 'cubes' | 'waves' | 'particles' | 'lava' | 'equalizer';
  colorScheme: string[]; // Custom hex stops
  speed: number; // 0.2 - 3.0
  density: number; // 0.5 - 3.0
  audioSensitivity: number; // 0.5 - 3.0
  wireframe: boolean;
  crtScanlines: boolean;
  bloom: number; // 0 - 2.5
  rotationSpeed: number; // 0 - 2.0
}

export interface SoundscapeMix {
  rain: number; // 0 - 100
  fire: number; // 0 - 100
  brownNoise: number; // 0 - 100
  drone: number; // 0 - 100
  thunder?: number; // 0 - 100 (Rolling Thunder)
  train?: number; // 0 - 100 (Night Train on Rails)
  waves?: number; // 0 - 100 (Ocean Waves)
  vinyl?: number; // 0 - 100 (Vinyl & Tape Saturation)
}

export interface AudioReactivityConfig {
  bassWeight: number; // 0 - 2
  midWeight: number; // 0 - 2
  trebleWeight: number; // 0 - 2
  mode: ReactivityMode;
  smoothing: number; // 0 - 1
}

export interface VibePreset {
  id: string;
  name: string;
  pack: string;
  tagline: string;
  icon: string;
  colors: string[]; // 3-5 hex colors
  transitionSpeedMs: number;
  maxBrightness: number; // 0 - 100
  audioReactivity: AudioReactivityConfig;
  soundscapeMix: SoundscapeMix;
  isPro?: boolean;
}

export interface RoomZone {
  id: string;
  name: string;
  active: boolean;
  lightCount: number;
  brightness: number; // 0 - 100
}

export interface AudioTelemetry {
  bass: number; // 0 - 100
  mids: number; // 0 - 100
  treble: number; // 0 - 100
  overall: number; // 0 - 100
  peakHold: number; // 0 - 100
  isSilent: boolean;
}

export interface SongVibeRule {
  id: string;
  songQuery: string;
  artist?: string;
  presetId: string;
  mode: ReactivityMode;
}

export type SmartDeviceType =
  | 'philips_hue'
  | 'govee'
  | 'wled'
  | 'wiz'
  | 'nanoleaf'
  | 'home_assistant_plug'
  | 'bluetooth_ble';

export interface BleDeviceDetails {
  manufacturer?: string;
  model?: string;
  batteryLevel?: number;
  firmwareRevision?: string;
  servicesFound?: string[];
  connectedGatt?: boolean;
}

export interface SmartDevice {
  id: string;
  name: string;
  type: SmartDeviceType;
  ip: string;
  token?: string;
  enabled: boolean;
  targetZone: string;
  status: 'connected' | 'disconnected' | 'testing';
  lastPingMs?: number;
  bleDetails?: BleDeviceDetails;
}

export interface Guardrails {
  photosensitivityLimit: number; // Max flash transitions / sec (1 - 10)
  smoothTransitions: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // "22:00"
  quietHoursEnd: string; // "07:00"
  quietHoursMaxBrightness: number; // 0 - 100
  quietHoursBassDamping: number; // 0 - 1 (multiplier)
}

export interface CircadianRule {
  enabled: boolean;
  sunriseTime: string;
  sunsetTime: string;
  autoShiftTemp: boolean;
  dayTempKelvin: number;
  nightTempKelvin: number;
}

export interface VisualizerSettings {
  particleDensity: number; // 0.2 - 2.0
  cameraDriftSpeed: number; // 0.1 - 2.0
  bloomIntensity: number; // 0.0 - 2.0
  waveThickness: number; // 1 - 10
  oledBurnInProtection: boolean;
  customConfig?: CustomVisualizerConfig;
}

export interface StageBroadcastMessage {
  type: 'STAGE_SYNC' | 'PING' | 'PONG';
  preset: VibePreset;
  telemetry: AudioTelemetry;
  visualizerMode: VisualizerMode;
  visualizerSettings: VisualizerSettings;
  activeZones: RoomZone[];
  timestamp: number;
}

export interface ProLicenseState {
  isPro: boolean;
  licenseKey?: string;
  activatedAt?: string;
  isTrial?: boolean;
  trialStatus?: {
    isActive: boolean;
    isExpired: boolean;
    tampered: boolean;
    clockTampered: boolean;
    installedAt: number;
    expiresAt: number;
    remainingMs: number;
    daysRemaining: number;
    hoursRemaining: number;
    trialDurationDays: number;
  };
}
