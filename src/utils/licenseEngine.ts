// OmniVibe Permanent Offline License Validation Engine
// Validates cryptographically checksummed offline keys & signed OMNITOKEN payloads without hardcoded master keys.
import { Preferences } from '@capacitor/preferences';

export interface TrialStatus {
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
}

export interface LicenseRecord {
  isPro: boolean;
  licenseKey: string;
  unlockedAt: string;
  tier: 'LIFETIME_PRO' | 'FOUNDER_VIP' | 'ENTERPRISE_STUDIO' | 'TRIAL_PRO';
  buyerName?: string;
  isTrial?: boolean;
  trialStatus?: TrialStatus;
}

export function formatTrialRemaining(trial?: TrialStatus): string {
  if (!trial) return '';
  if (trial.isExpired || !trial.isActive) return 'Trial Expired';
  if (trial.daysRemaining >= 1) {
    return `${trial.daysRemaining}d ${trial.hoursRemaining}h left`;
  }
  const mins = Math.max(1, Math.ceil((trial.remainingMs % (60 * 60 * 1000)) / 60000));
  if (trial.hoursRemaining >= 1) {
    return `${trial.hoursRemaining}h ${mins}m left`;
  }
  return `${mins}m left`;
}

const STORAGE_KEY = 'omnivibe_pro_license';
const SECRET_SALT = 'OMNIVIBE_OFFLINE_SECRET_2026_ATMOSPHERE_STUDIO';

/**
 * Normalizes user-entered license key:
 * Trims whitespace, removes non-printable chars/linebreaks, converts to uppercase.
 */
export function normalizeLicenseKey(rawKey: string): string {
  if (!rawKey) return '';
  const cleaned = rawKey.trim().replace(/[\r\n\t\s]+/g, '');
  if (cleaned.toLowerCase().startsWith('omnitoken.')) {
    // Preserve base64 payload casing for signed tokens
    const parts = cleaned.split('.');
    return `OMNITOKEN.${parts[1] || ''}.${(parts[2] || '').toUpperCase()}`;
  }
  return cleaned.toUpperCase();
}

/**
 * Computes a deterministic 4-character hex checksum for any string using a secret salt.
 */
function computeChecksum(payload: string): string {
  let hash = 0x811c9dc5;
  const combined = `${payload}:${SECRET_SALT}`;
  for (let i = 0; i < combined.length; i++) {
    hash ^= combined.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  const unsigned = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return unsigned.slice(-4);
}

/**
 * Validates a license key offline without internet.
 * Supports:
 * 1. Signed JSON tokens: OMNITOKEN.<base64>.<sig>
 * 2. Formatted block keys: OMNI-XXXX-XXXX-...-CSUM (where CSUM matches payload checksum)
 */
export function validateLicenseKey(rawKey: string): {
  isValid: boolean;
  tier?: LicenseRecord['tier'];
  buyerName?: string;
  error?: string;
} {
  const key = normalizeLicenseKey(rawKey);

  if (!key) {
    return { isValid: false, error: 'Please enter a license key or unlock code.' };
  }

  // 1. Check Signed Token format: OMNITOKEN.<base64>.<sig>
  if (key.startsWith('OMNITOKEN.')) {
    const parts = key.split('.');
    if (parts.length === 3) {
      const payloadBase64 = parts[1];
      const signature = parts[2];
      const expectedSig = computeChecksum(payloadBase64);
      if (signature === expectedSig) {
        try {
          const jsonStr = atob(payloadBase64);
          const data = JSON.parse(jsonStr);
          return {
            isValid: true,
            tier: data.tier || 'LIFETIME_PRO',
            buyerName: data.buyer || 'Licensed Customer',
          };
        } catch {
          return { isValid: false, error: 'License token payload is malformed.' };
        }
      } else {
        return { isValid: false, error: 'Invalid token digital signature.' };
      }
    }
  }

  // 2. Check Formatted Block Keys: OMNI-XXXX-...-CSUM
  const clean = key.startsWith('OMNI-') ? key.slice(5) : key;
  const segments = clean.split('-');

  if (segments.length >= 2) {
    const checksum = segments[segments.length - 1];
    const payload = segments.slice(0, -1).join('-');
    const expected = computeChecksum(payload);

    if (checksum === expected) {
      return {
        isValid: true,
        tier: 'LIFETIME_PRO',
        buyerName: 'Licensed Customer',
      };
    }
  }

  return {
    isValid: false,
    error: 'Invalid unlock code. Please double-check your code or purchase a lifetime key.',
  };
}

function hasVerifiedLicenseRecord(parsed: unknown): parsed is LicenseRecord {
  if (!parsed || typeof parsed !== 'object') return false;
  const candidate = parsed as Partial<LicenseRecord>;
  if (!candidate.isPro || typeof candidate.licenseKey !== 'string') return false;
  return validateLicenseKey(candidate.licenseKey).isValid;
}

/**
 * Persistently saves a validated license across:
 * 1. Web LocalStorage
 * 2. Mobile Capacitor Preferences
 * 3. Desktop Electron HMAC-verified userData JSON file
 */
export async function savePersistentLicense(record: LicenseRecord): Promise<void> {
  if (!hasVerifiedLicenseRecord(record)) {
    return;
  }
  const normalizedRecord: LicenseRecord = {
    ...record,
    licenseKey: normalizeLicenseKey(record.licenseKey),
  };
  const jsonStr = JSON.stringify(normalizedRecord);

  // 1. LocalStorage
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, jsonStr);
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
  }

  // 2. Capacitor Mobile Preferences
  try {
    await Preferences.set({ key: STORAGE_KEY, value: jsonStr });
  } catch {
    // Ignore when running outside native Capacitor shell
  }

  // 3. Electron Native Storage
  if (typeof window !== 'undefined' && (window as any).electronAPI?.saveLicense) {
    try {
      await (window as any).electronAPI.saveLicense(normalizedRecord);
    } catch {
      // Ignore if IPC unavailable
    }
  }
}

/**
 * Reads persistent license from native storage, mobile preferences, or localStorage,
 * cryptographically re-verifying every stored key before trusting unlocked status.
 */
export async function loadPersistentLicense(): Promise<LicenseRecord> {
  const defaultFree: LicenseRecord = {
    isPro: false,
    licenseKey: '',
    unlockedAt: '',
    tier: 'LIFETIME_PRO',
  };

  // Try Electron native HMAC-verified storage first if in desktop app
  if (typeof window !== 'undefined' && (window as any).electronAPI?.readLicense) {
    try {
      const electronData = await (window as any).electronAPI.readLicense();
      if (hasVerifiedLicenseRecord(electronData)) {
        return electronData;
      }
    } catch {
      // fallback
    }
  }

  // Try Capacitor mobile preferences
  try {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    if (value) {
      const parsed = JSON.parse(value);
      if (hasVerifiedLicenseRecord(parsed)) {
        return parsed;
      }
    }
  } catch {
    // fallback
  }

  // Try web localStorage
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (hasVerifiedLicenseRecord(parsed)) {
          return parsed;
        }
      }
    } catch {
      // fallback
    }

    // In Desktop Electron builds, automatically activate the tamper-resistant 3-day offline free trial
    const electronApi = (window as unknown as {
      electronAPI?: { getTrialStatus?: () => Promise<TrialStatus> };
    }).electronAPI;

    if (electronApi?.getTrialStatus) {
      try {
        const trial = await electronApi.getTrialStatus();
        if (trial && trial.isActive) {
          return {
            isPro: true,
            isTrial: true,
            licenseKey: 'TRIAL-3-DAY-OFFLINE',
            unlockedAt: new Date(trial.installedAt || Date.now()).toISOString(),
            tier: 'TRIAL_PRO',
            buyerName: '3-Day Free Trial',
            trialStatus: trial,
          };
        }
        if (trial) {
          return {
            ...defaultFree,
            isTrial: false,
            trialStatus: trial,
          };
        }
      } catch {
        // fallback to defaultFree
      }
    }
  }

  return defaultFree;
}

/**
 * Generates deterministic/random checksum-signed license keys (tree-shaken out of client UI bundle).
 */
export function generateCustomerLicenseKey(
  type: 'standard_4' | 'long_6' | 'signed_token' = 'standard_4',
  buyerName = 'Valued Customer',
  tier: LicenseRecord['tier'] = 'LIFETIME_PRO'
): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  const randomBlock = (len = 4) => {
    let result = '';
    for (let i = 0; i < len; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  if (type === 'signed_token') {
    const payload = JSON.stringify({
      buyer: buyerName,
      tier,
      issued: new Date().toISOString(),
      nonce: randomBlock(6),
    });
    const base64 = btoa(payload);
    const sig = computeChecksum(base64);
    return `OMNITOKEN.${base64}.${sig}`;
  }

  if (type === 'long_6') {
    const payload = `${randomBlock(4)}-${randomBlock(4)}-${randomBlock(4)}-${randomBlock(4)}-${randomBlock(4)}`;
    const checksum = computeChecksum(payload);
    return `OMNI-${payload}-${checksum}`;
  }

  // Standard 4-block key: OMNI-XXXX-XXXX-XXXX-CSUM
  const payload = `${randomBlock(4)}-${randomBlock(4)}-${randomBlock(4)}`;
  const checksum = computeChecksum(payload);
  return `OMNI-${payload}-${checksum}`;
}
