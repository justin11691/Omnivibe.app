const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 days in ms
const CLOCK_ROLLBACK_TOLERANCE_MS = 60 * 60 * 1000; // 1 hour DST/NTP drift allowance
const TRIAL_SECRET = 'OMNIVIBE_OFFLINE_TRIAL_2026_HMAC_KEY';
const LICENSE_CHECKSUM_SALT = 'OMNIVIBE_OFFLINE_SECRET_2026_ATMOSPHERE_STUDIO';
const TRIAL_FILENAME = 'omnivibe_trial.json';
const LICENSE_FILENAME = 'omnivibe_license.json';

function normalizeOfflineKey(rawKey) {
  if (!rawKey || typeof rawKey !== 'string') return '';
  const cleaned = rawKey.trim().replace(/[\r\n\t\s]+/g, '');
  if (cleaned.toLowerCase().startsWith('omnitoken.')) {
    const parts = cleaned.split('.');
    return `OMNITOKEN.${parts[1] || ''}.${(parts[2] || '').toUpperCase()}`;
  }
  return cleaned.toUpperCase();
}

function computeLicenseChecksum(payload) {
  let hash = 0x811c9dc5;
  const combined = `${payload}:${LICENSE_CHECKSUM_SALT}`;
  for (let i = 0; i < combined.length; i++) {
    hash ^= combined.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0').slice(-4);
}

function isValidOfflineLicenseKey(rawKey) {
  const key = normalizeOfflineKey(rawKey);
  if (!key) return false;

  if (key.startsWith('OMNITOKEN.')) {
    const parts = key.split('.');
    if (parts.length === 3 && parts[2] === computeLicenseChecksum(parts[1])) {
      try {
        JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  const clean = key.startsWith('OMNI-') ? key.slice(5) : key;
  const segments = clean.split('-');
  if (segments.length >= 2) {
    const checksum = segments[segments.length - 1];
    const payload = segments.slice(0, -1).join('-');
    return checksum === computeLicenseChecksum(payload);
  }

  return false;
}

function signLicenseRecord(record, fingerprint) {
  const canonical = JSON.stringify({
    isPro: Boolean(record.isPro),
    licenseKey: normalizeOfflineKey(record.licenseKey),
    unlockedAt: String(record.unlockedAt || ''),
    tier: String(record.tier || 'LIFETIME_PRO'),
    buyerName: String(record.buyerName || ''),
    fingerprint,
  });
  return crypto
    .createHmac('sha256', `${TRIAL_SECRET}:${fingerprint}:LICENSE`)
    .update(canonical)
    .digest('hex');
}

function saveSignedLicense({ userDataPath, licenseData, fingerprint } = {}) {
  const dir = userDataPath || os.tmpdir();
  const fp = fingerprint || getMachineFingerprint();
  if (!licenseData || !licenseData.isPro || !isValidOfflineLicenseKey(licenseData.licenseKey)) {
    return { success: false, error: 'Invalid offline license key signature.' };
  }
  const normalizedRecord = {
    isPro: true,
    licenseKey: normalizeOfflineKey(licenseData.licenseKey),
    unlockedAt: String(licenseData.unlockedAt || new Date().toISOString()),
    tier: String(licenseData.tier || 'LIFETIME_PRO'),
    buyerName: String(licenseData.buyerName || 'Licensed Customer'),
  };
  const signedPayload = {
    ...normalizedRecord,
    hmac: signLicenseRecord(normalizedRecord, fp),
  };
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(path.join(dir, LICENSE_FILENAME), JSON.stringify(signedPayload, null, 2), 'utf8');
  return { success: true };
}

function readVerifiedLicense({ userDataPath, fingerprint } = {}) {
  const dir = userDataPath || os.tmpdir();
  const fp = fingerprint || getMachineFingerprint();
  const filePath = path.join(dir, LICENSE_FILENAME);
  try {
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || !parsed.isPro || typeof parsed.hmac !== 'string') return null;
    if (!isValidOfflineLicenseKey(parsed.licenseKey)) return null;

    const expectedHmac = signLicenseRecord(parsed, fp);
    if (
      parsed.hmac.length !== expectedHmac.length ||
      !crypto.timingSafeEqual(Buffer.from(parsed.hmac, 'utf8'), Buffer.from(expectedHmac, 'utf8'))
    ) {
      return null;
    }

    return {
      isPro: true,
      licenseKey: normalizeOfflineKey(parsed.licenseKey),
      unlockedAt: String(parsed.unlockedAt || ''),
      tier: parsed.tier || 'LIFETIME_PRO',
      buyerName: parsed.buyerName || 'Licensed Customer',
    };
  } catch {
    return null;
  }
}

function getMachineFingerprint() {
  const cpuModel = (os.cpus() && os.cpus()[0] && os.cpus()[0].model) || 'generic-cpu';
  const raw = `${os.hostname()}|${os.platform()}|${os.arch()}|${cpuModel}|${os.homedir()}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function signTrialPayload(payload, fingerprint) {
  const canonical = JSON.stringify({
    installedAt: payload.installedAt,
    lastSeenAt: payload.lastSeenAt,
    maxSeenAt: payload.maxSeenAt,
    trialDurationMs: payload.trialDurationMs,
    clockTampered: Boolean(payload.clockTampered),
    fingerprint,
  });
  return crypto
    .createHmac('sha256', `${TRIAL_SECRET}:${fingerprint}`)
    .update(canonical)
    .digest('hex');
}

function formatTrialStatus(record, effectiveNow, tampered = false) {
  if (tampered) {
    return {
      isActive: false,
      isExpired: true,
      tampered: true,
      clockTampered: true,
      installedAt: 0,
      expiresAt: 0,
      remainingMs: 0,
      daysRemaining: 0,
      hoursRemaining: 0,
      trialDurationDays: 3,
    };
  }

  const duration = record.trialDurationMs || TRIAL_DURATION_MS;
  const expiresAt = record.installedAt + duration;
  const remainingMs = Math.max(0, expiresAt - effectiveNow);
  const isActive = remainingMs > 0;
  const totalHours = Math.ceil(remainingMs / (60 * 60 * 1000));
  const daysRemaining = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
  const hoursRemaining = Math.floor((remainingMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

  return {
    isActive,
    isExpired: !isActive,
    tampered: false,
    clockTampered: Boolean(record.clockTampered),
    installedAt: record.installedAt,
    expiresAt,
    remainingMs,
    daysRemaining,
    hoursRemaining,
    totalHoursRemaining: totalHours,
    trialDurationDays: 3,
  };
}

function getOrInitTrialStatus(options = {}) {
  const userDataPath = options.userDataPath || os.tmpdir();
  const nowMs = typeof options.nowMs === 'number' ? options.nowMs : Date.now();
  const fingerprint = options.fingerprint || getMachineFingerprint();
  const trialPath = path.join(userDataPath, TRIAL_FILENAME);

  try {
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    if (!fs.existsSync(trialPath)) {
      const freshRecord = {
        installedAt: nowMs,
        lastSeenAt: nowMs,
        maxSeenAt: nowMs,
        trialDurationMs: TRIAL_DURATION_MS,
        clockTampered: false,
      };
      const signed = {
        ...freshRecord,
        signature: signTrialPayload(freshRecord, fingerprint),
      };
      fs.writeFileSync(trialPath, JSON.stringify(signed, null, 2), 'utf8');
      return formatTrialStatus(signed, nowMs, false);
    }

    const raw = fs.readFileSync(trialPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed.installedAt !== 'number' ||
      typeof parsed.maxSeenAt !== 'number' ||
      typeof parsed.signature !== 'string'
    ) {
      return formatTrialStatus(null, nowMs, true);
    }

    const expectedSig = signTrialPayload(parsed, fingerprint);
    if (
      parsed.signature.length !== expectedSig.length ||
      !crypto.timingSafeEqual(Buffer.from(parsed.signature, 'utf8'), Buffer.from(expectedSig, 'utf8'))
    ) {
      return formatTrialStatus(null, nowMs, true);
    }

    const rolledBack = nowMs < parsed.maxSeenAt - CLOCK_ROLLBACK_TOLERANCE_MS;
    const effectiveNow = rolledBack ? parsed.maxSeenAt : Math.max(nowMs, parsed.maxSeenAt);

    const updatedRecord = {
      installedAt: parsed.installedAt,
      lastSeenAt: nowMs,
      maxSeenAt: Math.max(parsed.maxSeenAt, nowMs),
      trialDurationMs: parsed.trialDurationMs || TRIAL_DURATION_MS,
      clockTampered: Boolean(parsed.clockTampered || rolledBack),
    };

    const reSigned = {
      ...updatedRecord,
      signature: signTrialPayload(updatedRecord, fingerprint),
    };
    fs.writeFileSync(trialPath, JSON.stringify(reSigned, null, 2), 'utf8');

    return formatTrialStatus(reSigned, effectiveNow, false);
  } catch {
    return formatTrialStatus(null, nowMs, true);
  }
}

module.exports = {
  TRIAL_DURATION_MS,
  CLOCK_ROLLBACK_TOLERANCE_MS,
  getMachineFingerprint,
  signTrialPayload,
  getOrInitTrialStatus,
  isValidOfflineLicenseKey,
  signLicenseRecord,
  saveSignedLicense,
  readVerifiedLicense,
};
