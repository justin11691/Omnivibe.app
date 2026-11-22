const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const TRIAL_DURATION_MS = 3 * 24 * 60 * 60 * 1000; // 3 days in ms
const CLOCK_ROLLBACK_TOLERANCE_MS = 60 * 60 * 1000; // 1 hour DST/NTP drift allowance
const TRIAL_SECRET = 'OMNIVIBE_OFFLINE_TRIAL_2026_HMAC_KEY';
const TRIAL_FILENAME = 'omnivibe_trial.json';

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
};
