// OmniVibe Permanent Offline License Validation & Generation Engine
// Supports keys of any length, offline deterministic signatures, and persistent native storage sync.
import { Preferences } from '@capacitor/preferences';

export interface LicenseRecord {
  isPro: boolean;
  licenseKey: string;
  unlockedAt: string;
  tier: 'LIFETIME_PRO' | 'FOUNDER_VIP' | 'ENTERPRISE_STUDIO';
  buyerName?: string;
}

const STORAGE_KEY = 'omnivibe_pro_license';
const SECRET_SALT = 'OMNIVIBE_OFFLINE_SECRET_2026_ATMOSPHERE_STUDIO';
export const OWNER_PIN = '2026';

// Built-in Lifetime Founder & Master Keys
const MASTER_KEYS: Record<string, { tier: LicenseRecord['tier']; name: string }> = {
  'OMNI-FOUNDER-2026-FOREVER': { tier: 'FOUNDER_VIP', name: 'OmniVibe Founder / Owner' },
  'OMNI-PRO-UNLIMITED-VIP': { tier: 'FOUNDER_VIP', name: 'VIP Lifetime Member' },
  'OMNI-BETA-TESTER': { tier: 'LIFETIME_PRO', name: 'Beta Program Tester' },
  'OMNI-LIFETIME-STUDIO-PRO': { tier: 'LIFETIME_PRO', name: 'Studio Lifetime License' },
};

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
 * Validates a license key of any length offline without internet.
 * Supports:
 * 1. Master/founder keys (instant unlock)
 * 2. Standard format keys: OMNI-XXXX-XXXX-...-CSUM (where CSUM matches payload checksum)
 * 3. Base64 / Signed JSON tokens: OMNITOKEN.<base64>.<sig>
 * 4. Raw deterministic codes with checksum suffix
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

  // 1. Check Master / Founder Keys
  if (MASTER_KEYS[key]) {
    const meta = MASTER_KEYS[key];
    return { isValid: true, tier: meta.tier, buyerName: meta.name };
  }

  // 2. Check Signed Token format: OMNITOKEN.<base64>.<sig>
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

  // 3. Check Formatted Block Keys: OMNI-XXXX-...-CSUM
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

  // 4. Check arbitrary length keys with embedded checksum suffix (last 4 chars)
  if (key.length >= 12) {
    const csum = key.slice(-4);
    const body = key.slice(0, -4);
    if (csum === computeChecksum(body)) {
      return {
        isValid: true,
        tier: 'LIFETIME_PRO',
        buyerName: 'Verified Offline Licensee',
      };
    }
  }

  return {
    isValid: false,
    error: 'Invalid unlock code. Please double-check your code or purchase a lifetime key.',
  };
}

/**
 * Persistently saves a validated license across:
 * 1. Web LocalStorage
 * 2. Mobile Capacitor Preferences (iOS / Android persistent keychain/preferences)
 * 3. Desktop Electron userData JSON file (if running under Electron)
 */
export async function savePersistentLicense(record: LicenseRecord): Promise<void> {
  const jsonStr = JSON.stringify(record);

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
      await (window as any).electronAPI.saveLicense(record);
    } catch {
      // Ignore if IPC unavailable
    }
  }
}

/**
 * Reads persistent license from native storage, mobile preferences, or localStorage.
 */
export async function loadPersistentLicense(): Promise<LicenseRecord> {
  const defaultFree: LicenseRecord = {
    isPro: false,
    licenseKey: '',
    unlockedAt: '',
    tier: 'LIFETIME_PRO',
  };

  // Try Electron native storage first if in desktop app
  if (typeof window !== 'undefined' && (window as any).electronAPI?.readLicense) {
    try {
      const electronData = await (window as any).electronAPI.readLicense();
      if (electronData && electronData.isPro) {
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
      if (
        parsed &&
        parsed.isPro &&
        parsed.licenseKey !== 'OMNI-BETA-TESTER' &&
        parsed.licenseKey !== 'SIMULATED-FREE-TIER'
      ) {
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
        if (
          parsed &&
          parsed.isPro &&
          parsed.licenseKey !== 'OMNI-BETA-TESTER' &&
          parsed.licenseKey !== 'SIMULATED-FREE-TIER'
        ) {
          return parsed;
        }
      }
    } catch {
      // fallback
    }
  }

  return defaultFree;
}

/**
 * OWNER KEY GENERATOR UTILITY (ADMIN TOOL)
 * Generates mathematically valid unlock codes of customizable format and length.
 */
export function generateCustomerLicenseKey(
  type: 'standard_4' | 'long_6' | 'signed_token' = 'standard_4',
  buyerName = 'Valued Customer',
  tier: LicenseRecord['tier'] = 'LIFETIME_PRO'
): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excluding ambiguous chars (0, O, 1, I)

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
