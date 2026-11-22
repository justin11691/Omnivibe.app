import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { formatTrialRemaining } from '../src/utils/licenseEngine';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const trialManager = require('../electron/trialManager.cjs');

describe('OmniVibe 7-Day Offline Free Trial Engine', () => {
  let tempDir: string;
  const fixedFingerprint = 'test-machine-fp-123456';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omnivibe-trial-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a signed 7-day offline trial on first launch', () => {
    const t0 = 1_795_000_000_000;
    const status = trialManager.getOrInitTrialStatus({
      userDataPath: tempDir,
      nowMs: t0,
      fingerprint: fixedFingerprint,
    });

    expect(status.isActive).toBe(true);
    expect(status.isExpired).toBe(false);
    expect(status.tampered).toBe(false);
    expect(status.daysRemaining).toBe(7);
    expect(status.remainingMs).toBe(trialManager.TRIAL_DURATION_MS);
    expect(fs.existsSync(path.join(tempDir, 'omnivibe_trial.json'))).toBe(true);
  });

  it('tracks elapsed time accurately and expires after 7 days', () => {
    const t0 = 1_795_000_000_000;
    trialManager.getOrInitTrialStatus({
      userDataPath: tempDir,
      nowMs: t0,
      fingerprint: fixedFingerprint,
    });

    // Advance 3 days + 5 hours
    const tMid = t0 + 3 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000;
    const midStatus = trialManager.getOrInitTrialStatus({
      userDataPath: tempDir,
      nowMs: tMid,
      fingerprint: fixedFingerprint,
    });
    expect(midStatus.isActive).toBe(true);
    expect(midStatus.daysRemaining).toBe(3);
    expect(midStatus.hoursRemaining).toBe(19);
    expect(formatTrialRemaining(midStatus)).toBe('3d 19h left');

    // Advance past 7 days
    const tEnd = t0 + 7 * 24 * 60 * 60 * 1000 + 1000;
    const endStatus = trialManager.getOrInitTrialStatus({
      userDataPath: tempDir,
      nowMs: tEnd,
      fingerprint: fixedFingerprint,
    });
    expect(endStatus.isActive).toBe(false);
    expect(endStatus.isExpired).toBe(true);
    expect(endStatus.remainingMs).toBe(0);
    expect(formatTrialRemaining(endStatus)).toBe('Trial Expired');
  });

  it('prevents extending the trial by rolling back the system clock', () => {
    const t0 = 1_795_000_000_000;
    trialManager.getOrInitTrialStatus({
      userDataPath: tempDir,
      nowMs: t0,
      fingerprint: fixedFingerprint,
    });

    // Advance 6 days
    const day6 = t0 + 6 * 24 * 60 * 60 * 1000;
    trialManager.getOrInitTrialStatus({
      userDataPath: tempDir,
      nowMs: day6,
      fingerprint: fixedFingerprint,
    });

    // User rolls system clock back to day 0!
    const rolledBackStatus = trialManager.getOrInitTrialStatus({
      userDataPath: tempDir,
      nowMs: t0,
      fingerprint: fixedFingerprint,
    });
    expect(rolledBackStatus.clockTampered).toBe(true);
    // Effective remaining time remains 1 day (cannot be reset to 7 days)
    expect(rolledBackStatus.daysRemaining).toBe(1);
  });

  it('rejects manually tampered trial files with invalid HMAC signature', () => {
    const t0 = 1_795_000_000_000;
    trialManager.getOrInitTrialStatus({
      userDataPath: tempDir,
      nowMs: t0,
      fingerprint: fixedFingerprint,
    });

    const filePath = path.join(tempDir, 'omnivibe_trial.json');
    const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    json.installedAt = t0 + 999999999; // tamper without updating HMAC signature
    fs.writeFileSync(filePath, JSON.stringify(json), 'utf8');

    const tamperedStatus = trialManager.getOrInitTrialStatus({
      userDataPath: tempDir,
      nowMs: t0 + 1000,
      fingerprint: fixedFingerprint,
    });
    expect(tamperedStatus.tampered).toBe(true);
    expect(tamperedStatus.isActive).toBe(false);
    expect(tamperedStatus.isExpired).toBe(true);
  });
});
