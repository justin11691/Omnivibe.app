import { describe, it, expect } from 'vitest';
import dgram from 'node:dgram';
import crypto from 'node:crypto';
import net from 'node:net';
import worker from '../src/worker';
import { computeCalibratedLightOutput } from '../src/audio/AudioEngine';
// @ts-ignore - ESM Node driver module
import { buildHueStreamV2Frame, isBridgeV2ApiSupported, isPrivateLanIp, Dtls12PskClient, tls12PrfSha256, buildPskPremasterSecret, encryptDtlsAeadRecord, decryptDtlsAeadRecord } from '../bridge/drivers/hueEntertainment.mjs';
// @ts-ignore - ESM Node driver module
import { buildGoveeRazerPacket, runGoveePreFlightDiagnostics, GoveeLanController } from '../bridge/drivers/goveeLan.mjs';
// @ts-ignore - ESM Node driver module
import { WizUdpController } from '../bridge/drivers/wizUdp.mjs';
// @ts-ignore - ESM Node server module
import { isAllowedBridgeOrigin, startBridgeServer } from '../bridge/server.mjs';

function buildServerRecord(contentType: number, epoch: number, seqNum: number, fragment: Buffer) {
  const hdr = Buffer.alloc(13);
  hdr.writeUInt8(contentType, 0);
  hdr.writeUInt16BE(0xfefd, 1);
  hdr.writeUInt16BE(epoch, 3);
  hdr.writeUIntBE(seqNum, 5, 6);
  hdr.writeUInt16BE(fragment.length, 11);
  return Buffer.concat([hdr, fragment]);
}

function buildServerHsMsg(msgType: number, msgSeq: number, body: Buffer) {
  const hdr = Buffer.alloc(12);
  hdr.writeUInt8(msgType, 0);
  hdr.writeUIntBE(body.length, 1, 3);
  hdr.writeUInt16BE(msgSeq, 4);
  hdr.writeUIntBE(0, 6, 3);
  hdr.writeUIntBE(body.length, 9, 3);
  return Buffer.concat([hdr, body]);
}

describe('OmniVibe Studio — Local Companion Bridge Drivers, DTLS 1.2 PSK & CSWSH Security', () => {
  it('validates Hue Bridge v2 API >= 1.22 and private LAN IP enforcement', () => {
    expect(isBridgeV2ApiSupported('1.22.0')).toBe(true);
    expect(isBridgeV2ApiSupported('1.60.0')).toBe(true);
    expect(isBridgeV2ApiSupported('2.0.0')).toBe(true);
    expect(isBridgeV2ApiSupported('1.21.0')).toBe(false);
    expect(isBridgeV2ApiSupported('0.9.0')).toBe(false);

    expect(isPrivateLanIp('192.168.1.25')).toBe(true);
    expect(isPrivateLanIp('10.0.0.12')).toBe(true);
    expect(isPrivateLanIp('172.16.5.10')).toBe(true);
    expect(isPrivateLanIp('8.8.8.8')).toBe(false);
    expect(isPrivateLanIp('172.32.0.1')).toBe(false);
  });

  it('blocks UDP SSRF to public IPs inside GoveeLanController and WizUdpController', () => {
    const govee = new GoveeLanController();
    const wiz = new WizUdpController(0.35);
    try {
      expect(govee.sendRaw('8.8.8.8', { msg: { cmd: 'turn', data: { value: 1 } } })).toBe(false);
      expect(govee.setRazerMode('1.1.1.1', true)).toBe(false);
      expect(wiz.sendPilotSmoothed('8.8.8.8', 255, 0, 128, 80)).toBe(false);
    } finally {
      govee.close();
      wiz.close();
    }
  });

  it('completes a real RFC 6347 / RFC 4279 DTLS 1.2 PSK handshake and decrypts HueStream v2 frames', async () => {
    const pskHex = '00112233445566778899aabbccddeeff';
    const pskBytes = Buffer.from(pskHex, 'hex');
    const cookie = Buffer.from('hue_dtls_cookie_2026', 'ascii');
    const serverRandom = crypto.randomBytes(32);

    const serverSock = dgram.createSocket('udp4');
    await new Promise<void>((resolve) => serverSock.bind(0, '127.0.0.1', () => resolve()));
    const serverPort = (serverSock.address() as any).port;

    let clientRandom: Buffer = Buffer.alloc(32);
    let transcript: Buffer[] = [];
    let masterSecret: Buffer | null = null;
    let clientKey: Buffer = Buffer.alloc(16);
    let clientIvSalt: Buffer = Buffer.alloc(4);
    let serverKey: Buffer = Buffer.alloc(16);
    let serverIvSalt: Buffer = Buffer.alloc(4);
    let receivedAppFrame: Buffer | null = null;

    serverSock.on('message', (dgramBuf, rinfo) => {
      let off = 0;
      while (off + 13 <= dgramBuf.length) {
        const contentType = dgramBuf.readUInt8(off);
        const epoch = dgramBuf.readUInt16BE(off + 3);
        const seqNum = dgramBuf.readUIntBE(off + 5, 6);
        const len = dgramBuf.readUInt16BE(off + 11);
        const frag = dgramBuf.subarray(off + 13, off + 13 + len);
        off += 13 + len;

        if (contentType === 22 && epoch === 0) {
          const msgType = frag.readUInt8(0);
          const bodyLen = frag.readUIntBE(1, 3);
          const body = frag.subarray(12, 12 + bodyLen);
          const fullMsg = frag.subarray(0, 12 + bodyLen);

          if (msgType === 1) {
            clientRandom = Buffer.from(body.subarray(2, 34));
            const sidLen = body.readUInt8(34);
            const recCookieLen = body.readUInt8(35 + sidLen);

            if (recCookieLen === 0) {
              const hvrBody = Buffer.concat([Buffer.from([0xfe, 0xfd, cookie.length]), cookie]);
              const hvrMsg = buildServerHsMsg(3, 0, hvrBody);
              serverSock.send(buildServerRecord(22, 0, 0, hvrMsg), rinfo.port, rinfo.address);
            } else {
              transcript = [fullMsg];
              const shBody = Buffer.concat([
                Buffer.from([0xfe, 0xfd]),
                serverRandom,
                Buffer.from([0x00]),
                Buffer.from([0x00, 0xa8, 0x00]), // TLS_PSK_WITH_AES_128_GCM_SHA256 + null comp
              ]);
              const shMsg = buildServerHsMsg(2, 1, shBody);
              const shdMsg = buildServerHsMsg(14, 2, Buffer.alloc(0));
              transcript.push(shMsg, shdMsg);

              const pkt = Buffer.concat([
                buildServerRecord(22, 0, 1, shMsg),
                buildServerRecord(22, 0, 2, shdMsg),
              ]);
              serverSock.send(pkt, rinfo.port, rinfo.address);
            }
          } else if (msgType === 16) {
            transcript.push(fullMsg);
            const premaster = buildPskPremasterSecret(pskBytes);
            masterSecret = tls12PrfSha256(
              premaster,
              'master secret',
              Buffer.concat([clientRandom, serverRandom]),
              48
            );
            const kb = tls12PrfSha256(
              masterSecret,
              'key expansion',
              Buffer.concat([serverRandom, clientRandom]),
              40
            );
            clientKey = kb.subarray(0, 16);
            serverKey = kb.subarray(16, 32);
            clientIvSalt = kb.subarray(32, 36);
            serverIvSalt = kb.subarray(36, 40);
          }
        } else if (contentType === 22 && epoch === 1 && masterSecret) {
          const hsPlain = decryptDtlsAeadRecord({
            record: { contentType, epoch, seqNum, fragment: frag },
            readKey: clientKey,
            readIvSalt: clientIvSalt,
          });
          transcript.push(hsPlain);

          const serverHash = crypto.createHash('sha256').update(Buffer.concat(transcript)).digest();
          const serverVerifyData = tls12PrfSha256(masterSecret, 'server finished', serverHash, 12);
          const serverFinMsg = buildServerHsMsg(20, 3, serverVerifyData);

          const ccsRec = buildServerRecord(20, 0, 3, Buffer.from([0x01]));
          const finRec = encryptDtlsAeadRecord({
            contentType: 22,
            epoch: 1,
            seqNum: 0,
            writeKey: serverKey,
            writeIvSalt: serverIvSalt,
            plaintext: serverFinMsg,
          });
          serverSock.send(Buffer.concat([ccsRec, finRec]), rinfo.port, rinfo.address);
        } else if (contentType === 23 && epoch === 1) {
          receivedAppFrame = decryptDtlsAeadRecord({
            record: { contentType, epoch, seqNum, fragment: frag },
            readKey: clientKey,
            readIvSalt: clientIvSalt,
          });
        }
      }
    });

    const dtls = new Dtls12PskClient({
      host: '127.0.0.1',
      port: serverPort,
      pskIdentity: 'omnivibe_test_user',
      pskHex,
      allowLoopback: true,
    });

    try {
      const hsResult = await dtls.connect(3000);
      expect(hsResult.ok).toBe(true);
      expect(hsResult.cipherSuite).toBe('TLS_PSK_WITH_AES_128_GCM_SHA256');

      const areaId = '12345678-1234-1234-1234-1234567890ab';
      const hueFrame = buildHueStreamV2Frame(areaId, [{ channelId: 0, r: 34, g: 211, b: 238 }], 9);
      expect(dtls.sendApplicationData(hueFrame)).toBe(true);

      await new Promise((r) => setTimeout(r, 60));
      expect(receivedAppFrame).not.toBeNull();
      expect(receivedAppFrame!.subarray(0, 9).toString('ascii')).toBe('HueStream');
      expect(receivedAppFrame!.readUInt8(11)).toBe(9);
    } finally {
      dtls.close();
      serverSock.close();
    }
  });

  it('rejects malicious browser origins against CSWSH while permitting OmniVibe origins', async () => {
    expect(isAllowedBridgeOrigin('https://evil.example')).toBe(false);
    expect(isAllowedBridgeOrigin('http://malicious.local')).toBe(false);
    expect(isAllowedBridgeOrigin(undefined)).toBe(false);
    expect(isAllowedBridgeOrigin('https://omnivibe.app')).toBe(true);
    expect(isAllowedBridgeOrigin('https://www.omnivibe.app')).toBe(true);
    expect(isAllowedBridgeOrigin('app://omnivibe.local')).toBe(true);
    expect(isAllowedBridgeOrigin('http://localhost:5173')).toBe(true);

    const bridge = startBridgeServer(0, { embedded: true });
    await new Promise<void>((r) => bridge.server.once('listening', () => r()));
    const port = bridge.server.address().port;

    try {
      const rawResponse = await new Promise<string>((resolve) => {
        const sock = net.createConnection({ host: '127.0.0.1', port }, () => {
          sock.write(
            [
              'GET / HTTP/1.1',
              `Host: 127.0.0.1:${port}`,
              'Upgrade: websocket',
              'Connection: Upgrade',
              'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
              'Sec-WebSocket-Version: 13',
              'Origin: https://evil.example',
              '',
              '',
            ].join('\r\n')
          );
        });
        let buf = '';
        sock.on('data', (d) => {
          buf += d.toString('utf8');
        });
        sock.on('close', () => resolve(buf));
      });
      expect(rawResponse).toContain('403 Forbidden');
    } finally {
      await bridge.cleanup();
    }
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
    expect(frame.length).toBe(122);
    expect(frame.subarray(0, 9).toString('ascii')).toBe('HueStream');
    expect(frame.readUInt8(9)).toBe(0x02);
    expect(frame.readUInt8(10)).toBe(0x00);
    expect(frame.readUInt8(11)).toBe(7);
    expect(frame.readUInt8(14)).toBe(0x00);
    expect(frame.subarray(16, 52).toString('ascii')).toBe(areaId);
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
