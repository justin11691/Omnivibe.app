import { describe, it, expect } from 'vitest';
import worker from '../src/worker';
import { computeCalibratedLightOutput } from '../src/audio/AudioEngine';
// @ts-ignore - ESM Node driver module
import { buildHueStreamV2Frame, isBridgeV2ApiSupported, isPrivateLanIp } from '../bridge/drivers/hueEntertainment.mjs';
// @ts-ignore - ESM Node driver module
import { buildGoveeRazerPacket, runGoveePreFlightDiagnostics } from '../bridge/drivers/goveeLan.mjs';

describe('OmniVibe Studio — Local Companion Bridge Drivers & DSP Calibration', () => {
  it('validates Hue Bridge v2 API >= 1.22 and private LAN IP enforcement', () => {
    expect(isBridgeV2ApiSupported('1.22.0')).toBe(true);
    expect(isBridgeV2ApiSupported('1.60.0')).toBe(true);
    expect(isBridgeV2ApiSupported('2.0.0')).toBe(true);
    expect(isBridgeV2ApiSupported('1.21.0')).toBe(false);
    expect(isBridgeV2ApiSupported('0.9.0')).toBe(false);

    expect(isPrivateLanIp('192.168.1.25')).toBe(true);
    expect(isPrivateLanIp('10.0.0.12')).toBe(true);
    expect(isPrivateLanIp('8.8.8.8')).toBe(false);
  });

  it('builds protocol-compliant big-endian HueStream v2.0 frames capped at 10 channels', () => {
    const areaId = '12345678-1234-1234-1234-1234567890ab';
    const channels = Array.from({ length: 12 }, (_, idx) => ({
      channelId: idx,
      r: 255,
      g: 128,
      b: 0,
    }));

    const frame: Buffer = buildHueStreamV2Frame(areaId, channels, 7);
    // 52-byte header + 10 capped channels * 7 bytes = 122 bytes
    expect(frame.length).toBe(122);
    expect(frame.subarray(0, 9).toString('ascii')).toBe('HueStream');
    expect(frame.readUInt8(9)).toBe(0x02); // Major v2
    expect(frame.readUInt8(10)).toBe(0x00); // Minor v0
    expect(frame.readUInt8(11)).toBe(7); // Sequence
    expect(frame.readUInt8(14)).toBe(0x00); // RGB color space
    expect(frame.subarray(16, 52).toString('ascii')).toBe(areaId);
    // First channel R16 = 65535 (0xFFFF), B16 = 0
    expect(frame.readUInt8(52)).toBe(0);
    expect(frame.readUInt16BE(53)).toBe(65535);
    expect(frame.readUInt16BE(57)).toBe(0);
  });

  it('builds valid XOR-checksummed Govee Razer/Dreamview 0xB1 UDP payload', () => {
    const b64: string = buildGoveeRazerPacket(true);
    const raw = Buffer.from(b64, 'base64');
    expect(raw.length).toBe(20);
    expect(raw[0]).toBe(0xbb);
    expect(raw[3]).toBe(0xb1);
    expect(raw[4]).toBe(0x01);

    let xor = 0;
    for (let i = 0; i < 19; i++) xor ^= raw[i];
    expect(raw[19]).toBe(xor);
  });

  it('runs Govee pre-flight network diagnostics returning checklist and port 4002 status', async () => {
    const diag = await runGoveePreFlightDiagnostics();
    expect(typeof diag.port4002Available).toBe('boolean');
    expect(Array.isArray(diag.warnings)).toBe(true);
    expect(diag.checklist.length).toBeGreaterThanOrEqual(3);
  });

  it('computes decoupled Master Brightness and enforces Minimum-Black Floor across Calm & Party modes', () => {
    // At 0% audio energy, lights stay above Minimum-Black Floor and respect decoupled Master Brightness
    const calmQuiet = computeCalibratedLightOutput(0, 80, 3, 'calm');
    const partyQuiet = computeCalibratedLightOutput(0, 80, 3, 'party');
    const partyPeak = computeCalibratedLightOutput(100, 80, 3, 'party');
    const lowMasterFloor = computeCalibratedLightOutput(0, 10, 8, 'party');

    expect(calmQuiet).toBeGreaterThanOrEqual(3);
    expect(partyQuiet).toBeGreaterThanOrEqual(3);
    expect(partyPeak).toBeGreaterThan(partyQuiet);
    expect(lowMasterFloor).toBeGreaterThanOrEqual(8);
  });

  it('purges legacy unrelated routes (/guide/f150-alternator, /guide/2015-honda-civic-brakes) with 410 Gone and noindex', async () => {
    for (const path of ['/guide/f150-alternator', '/guide/2015-honda-civic-brakes']) {
      const req = new Request(`https://omnivibe.app${path}`);
      const res = await worker.fetch(req, {}, {} as any);
      expect(res.status).toBe(410);
      expect(res.headers.get('X-Robots-Tag')).toContain('noindex');
    }
  });
});
