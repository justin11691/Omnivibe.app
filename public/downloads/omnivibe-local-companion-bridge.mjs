#!/usr/bin/env node
// OmniVibe Studio — Standalone Local Companion Bridge (v1.0.0)
// Run: node omnivibe-local-companion-bridge.mjs
// Listens on loopback ws://127.0.0.1:47890 (with strict Origin CSWSH validation)
// Protocols: Philips Hue DTLS 1.2 PSK (UDP 2100), Govee LAN (UDP 4001-4003), WiZ UDP (38899)
import dgram from 'node:dgram';
import https from 'node:https';
import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';

// === bridge/drivers/hueEntertainment.mjs ===
// OmniVibe Studio — Philips Hue Entertainment API v2 Driver (Bridge v2, API >= 1.22)
// Uses RFC 6347 / RFC 4279 / RFC 5487 DTLS 1.2 PSK (TLS_PSK_WITH_AES_128_GCM_SHA256, 0x00A8)
// over UDP 2100 with big-endian HueStream v2.0 binary frames. Never falls back to REST polling.


const HUE_MIN_API_MAJOR = 1;
const HUE_MIN_API_MINOR = 22;
const HUE_DTLS_PORT = 2100;
const MAX_ENTERTAINMENT_LIGHTS = 10;

const DTLS_VERSION_1_2 = 0xfefd;
const DTLS_CONTENT_CCS = 20;
const DTLS_CONTENT_ALERT = 21;
const DTLS_CONTENT_HANDSHAKE = 22;
const DTLS_CONTENT_APPDATA = 23;

const HS_CLIENT_HELLO = 1;
const HS_SERVER_HELLO = 2;
const HS_HELLO_VERIFY_REQUEST = 3;
const HS_SERVER_HELLO_DONE = 14;
const HS_CLIENT_KEY_EXCHANGE = 16;
const HS_FINISHED = 20;

const CIPHER_PSK_AES_128_GCM_SHA256 = 0x00a8;

function isPrivateLanIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const trimmed = ip.trim();
  return (
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(trimmed) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(trimmed)
  );
}

/** Allows RFC-1918 LAN IPs and loopback (strictly for automated local unit testing when opted in). */
function isPrivateOrLoopbackIp(ip, allowLoopback = false) {
  if (isPrivateLanIp(ip)) return true;
  if (allowLoopback && typeof ip === 'string' && ip.trim() === '127.0.0.1') return true;
  return false;
}

function isBridgeV2ApiSupported(apiVersion) {
  if (!apiVersion || typeof apiVersion !== 'string') return false;
  const [major, minor] = apiVersion.split('.').map((n) => Number.parseInt(n, 10));
  if (Number.isNaN(major) || Number.isNaN(minor)) return false;
  if (major > HUE_MIN_API_MAJOR) return true;
  return major === HUE_MIN_API_MAJOR && minor >= HUE_MIN_API_MINOR;
}

/**
 * RFC 5246 §5 TLS 1.2 PRF using HMAC-SHA256 (P_SHA256).
 */
function tls12PrfSha256(secret, label, seed, length) {
  const labelBuf = Buffer.from(label, 'ascii');
  const combinedSeed = Buffer.concat([labelBuf, seed]);
  const out = [];
  let a = crypto.createHmac('sha256', secret).update(combinedSeed).digest();
  let collected = 0;

  while (collected < length) {
    const block = crypto
      .createHmac('sha256', secret)
      .update(Buffer.concat([a, combinedSeed]))
      .digest();
    out.push(block);
    collected += block.length;
    a = crypto.createHmac('sha256', secret).update(a).digest();
  }

  return Buffer.concat(out).subarray(0, length);
}

function buildDtlsRecord(contentType, epoch, seqNum, fragment) {
  const header = Buffer.alloc(13);
  header.writeUInt8(contentType, 0);
  header.writeUInt16BE(DTLS_VERSION_1_2, 1);
  header.writeUInt16BE(epoch & 0xffff, 3);
  header.writeUIntBE(seqNum, 5, 6);
  header.writeUInt16BE(fragment.length, 11);
  return Buffer.concat([header, fragment]);
}

function parseDtlsRecords(datagram) {
  const records = [];
  let offset = 0;
  while (offset + 13 <= datagram.length) {
    const contentType = datagram.readUInt8(offset);
    const version = datagram.readUInt16BE(offset + 1);
    const epoch = datagram.readUInt16BE(offset + 3);
    const seqNum = datagram.readUIntBE(offset + 5, 6);
    const length = datagram.readUInt16BE(offset + 11);
    if (offset + 13 + length > datagram.length) break;
    records.push({
      contentType,
      version,
      epoch,
      seqNum,
      fragment: datagram.subarray(offset + 13, offset + 13 + length),
    });
    offset += 13 + length;
  }
  return records;
}

function buildHandshakeMessage(msgType, messageSeq, body) {
  const header = Buffer.alloc(12);
  header.writeUInt8(msgType, 0);
  header.writeUIntBE(body.length, 1, 3);
  header.writeUInt16BE(messageSeq & 0xffff, 4);
  header.writeUIntBE(0, 6, 3); // fragment_offset = 0
  header.writeUIntBE(body.length, 9, 3); // fragment_length = body.length
  return Buffer.concat([header, body]);
}

function buildClientHelloBody(clientRandom, cookie = Buffer.alloc(0)) {
  const ver = Buffer.alloc(2);
  ver.writeUInt16BE(DTLS_VERSION_1_2, 0);
  const sessionIdLen = Buffer.from([0x00]);
  const cookieLen = Buffer.from([cookie.length & 0xff]);
  const cipherSuites = Buffer.alloc(4);
  cipherSuites.writeUInt16BE(2, 0);
  cipherSuites.writeUInt16BE(CIPHER_PSK_AES_128_GCM_SHA256, 2);
  const compression = Buffer.from([0x01, 0x00]); // null compression
  return Buffer.concat([ver, clientRandom, sessionIdLen, cookieLen, cookie, cipherSuites, compression]);
}

function buildClientKeyExchangePskBody(identity) {
  const idBuf = Buffer.from(String(identity || ''), 'utf8');
  const lenPrefix = Buffer.alloc(2);
  lenPrefix.writeUInt16BE(idBuf.length, 0);
  return Buffer.concat([lenPrefix, idBuf]);
}

function buildPskPremasterSecret(pskBytes) {
  const n = pskBytes.length;
  const out = Buffer.alloc(4 + n * 2);
  out.writeUInt16BE(n, 0);
  // out[2 .. 2+n) left as zero-filled
  out.writeUInt16BE(n, 2 + n);
  pskBytes.copy(out, 4 + n);
  return out;
}

function encryptDtlsAeadRecord({ contentType, epoch, seqNum, writeKey, writeIvSalt, plaintext }) {
  const explicitNonce = Buffer.alloc(8);
  explicitNonce.writeUInt16BE(epoch & 0xffff, 0);
  explicitNonce.writeUIntBE(seqNum, 2, 6);

  const nonce12 = Buffer.concat([writeIvSalt, explicitNonce]);
  const aad = Buffer.alloc(13);
  aad.writeUInt16BE(epoch & 0xffff, 0);
  aad.writeUIntBE(seqNum, 2, 6);
  aad.writeUInt8(contentType, 8);
  aad.writeUInt16BE(DTLS_VERSION_1_2, 9);
  aad.writeUInt16BE(plaintext.length, 11);

  const cipher = crypto.createCipheriv('aes-128-gcm', writeKey, nonce12);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const fragment = Buffer.concat([explicitNonce, ciphertext, authTag]);
  return buildDtlsRecord(contentType, epoch, seqNum, fragment);
}

function decryptDtlsAeadRecord({ record, readKey, readIvSalt }) {
  const { contentType, epoch, seqNum, fragment } = record;
  if (fragment.length < 8 + 16) {
    throw new Error('DTLS AEAD fragment too short');
  }
  const explicitNonce = fragment.subarray(0, 8);
  const authTag = fragment.subarray(fragment.length - 16);
  const ciphertext = fragment.subarray(8, fragment.length - 16);

  const nonce12 = Buffer.concat([readIvSalt, explicitNonce]);
  const aad = Buffer.alloc(13);
  aad.writeUInt16BE(epoch & 0xffff, 0);
  aad.writeUIntBE(seqNum, 2, 6);
  aad.writeUInt8(contentType, 8);
  aad.writeUInt16BE(DTLS_VERSION_1_2, 9);
  aad.writeUInt16BE(ciphertext.length, 11);

  const decipher = crypto.createDecipheriv('aes-128-gcm', readKey, nonce12);
  decipher.setAAD(aad);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Pure Node.js RFC 6347 / RFC 4279 / RFC 5487 DTLS 1.2 PSK Client for Hue Entertainment UDP:2100.
 */
class Dtls12PskClient {
  constructor({ host, port = HUE_DTLS_PORT, pskIdentity, pskHex, allowLoopback = false }) {
    this.host = host;
    this.port = port;
    this.pskIdentity = pskIdentity;
    this.pskBytes = Buffer.from(String(pskHex || '').replace(/[^a-fA-F0-9]/g, ''), 'hex');
    this.allowLoopback = allowLoopback;

    this.socket = null;
    this.connected = false;
    this.epoch0Seq = 0;
    this.epoch1Seq = 0;
    this.msgSeq = 0;

    this.clientWriteKey = null;
    this.serverWriteKey = null;
    this.clientWriteIvSalt = null;
    this.serverWriteIvSalt = null;
  }

  connect(timeoutMs = 4500) {
    if (!isPrivateOrLoopbackIp(this.host, this.allowLoopback)) {
      return Promise.reject(new Error(`Refusing DTLS connection to non-LAN IP: ${this.host}`));
    }
    if (this.pskBytes.length === 0) {
      return Promise.reject(new Error('Hue Entertainment requires a valid hex PSK clientkey.'));
    }

    return new Promise((resolve, reject) => {
      const sock = dgram.createSocket('udp4');
      this.socket = sock;

      const clientRandom = crypto.randomBytes(32);
      let serverRandom = null;
      let transcript = [];
      let masterSecret = null;
      let keys = null;
      let serverCcsReceived = false;
      let serverHelloDoneReceived = false;
      let sentFlight5 = false;
      let settled = false;
      let retryTimer = null;

      const cleanup = () => {
        if (overallTimer) clearTimeout(overallTimer);
        if (retryTimer) clearTimeout(retryTimer);
        sock.removeAllListeners('message');
      };

      const fail = (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        this.close();
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      const overallTimer = setTimeout(() => {
        fail(new Error(`DTLS 1.2 PSK handshake timed out with ${this.host}:${this.port}`));
      }, timeoutMs);

      const sendRaw = (buf) => {
        try {
          sock.send(buf, 0, buf.length, this.port, this.host);
        } catch (err) {
          fail(err);
        }
      };

      const sendClientHello = (cookie = Buffer.alloc(0)) => {
        const body = buildClientHelloBody(clientRandom, cookie);
        const hsMsg = buildHandshakeMessage(HS_CLIENT_HELLO, this.msgSeq++, body);
        // Reset transcript to the cookie-carrying ClientHello (RFC 6347 §4.2.1)
        transcript = [hsMsg];
        sendRaw(buildDtlsRecord(DTLS_CONTENT_HANDSHAKE, 0, this.epoch0Seq++, hsMsg));
      };

      const sendFlight5 = () => {
        if (sentFlight5 || !serverRandom) return;
        sentFlight5 = true;

        const ckeBody = buildClientKeyExchangePskBody(this.pskIdentity);
        const ckeMsg = buildHandshakeMessage(HS_CLIENT_KEY_EXCHANGE, this.msgSeq++, ckeBody);
        transcript.push(ckeMsg);

        const premaster = buildPskPremasterSecret(this.pskBytes);
        masterSecret = tls12PrfSha256(
          premaster,
          'master secret',
          Buffer.concat([clientRandom, serverRandom]),
          48
        );
        const keyBlock = tls12PrfSha256(
          masterSecret,
          'key expansion',
          Buffer.concat([serverRandom, clientRandom]),
          40
        );

        keys = {
          clientWriteKey: keyBlock.subarray(0, 16),
          serverWriteKey: keyBlock.subarray(16, 32),
          clientWriteIvSalt: keyBlock.subarray(32, 36),
          serverWriteIvSalt: keyBlock.subarray(36, 40),
        };
        this.clientWriteKey = keys.clientWriteKey;
        this.serverWriteKey = keys.serverWriteKey;
        this.clientWriteIvSalt = keys.clientWriteIvSalt;
        this.serverWriteIvSalt = keys.serverWriteIvSalt;

        const transcriptHash = crypto.createHash('sha256').update(Buffer.concat(transcript)).digest();
        const clientVerifyData = tls12PrfSha256(masterSecret, 'client finished', transcriptHash, 12);
        const clientFinMsg = buildHandshakeMessage(HS_FINISHED, this.msgSeq++, clientVerifyData);
        transcript.push(clientFinMsg);

        const r1 = buildDtlsRecord(DTLS_CONTENT_HANDSHAKE, 0, this.epoch0Seq++, ckeMsg);
        const r2 = buildDtlsRecord(DTLS_CONTENT_CCS, 0, this.epoch0Seq++, Buffer.from([0x01]));
        const r3 = encryptDtlsAeadRecord({
          contentType: DTLS_CONTENT_HANDSHAKE,
          epoch: 1,
          seqNum: this.epoch1Seq++,
          writeKey: keys.clientWriteKey,
          writeIvSalt: keys.clientWriteIvSalt,
          plaintext: clientFinMsg,
        });

        sendRaw(Buffer.concat([r1, r2, r3]));
      };

      sock.on('error', (err) => fail(err));

      sock.on('message', (datagram) => {
        try {
          const records = parseDtlsRecords(datagram);
          for (const rec of records) {
            if (rec.contentType === DTLS_CONTENT_ALERT) {
              const level = rec.fragment[0];
              const desc = rec.fragment[1];
              if (level === 2) {
                fail(new Error(`DTLS fatal alert received (desc=${desc})`));
                return;
              }
              continue;
            }

            if (rec.contentType === DTLS_CONTENT_CCS) {
              serverCcsReceived = true;
              continue;
            }

            if (rec.contentType === DTLS_CONTENT_HANDSHAKE) {
              let hsBuf = rec.fragment;
              if (rec.epoch >= 1) {
                if (!serverCcsReceived || !keys) continue;
                hsBuf = decryptDtlsAeadRecord({
                  record: rec,
                  readKey: keys.serverWriteKey,
                  readIvSalt: keys.serverWriteIvSalt,
                });
              }

              if (hsBuf.length < 12) continue;
              const msgType = hsBuf.readUInt8(0);
              const msgBodyLen = hsBuf.readUIntBE(1, 3);
              const body = hsBuf.subarray(12, 12 + msgBodyLen);
              const fullHsMsg = hsBuf.subarray(0, 12 + msgBodyLen);

              if (msgType === HS_HELLO_VERIFY_REQUEST) {
                if (retryTimer) {
                  clearTimeout(retryTimer);
                  retryTimer = null;
                }
                const cookieLen = body.readUInt8(2);
                const cookie = body.subarray(3, 3 + cookieLen);
                sendClientHello(cookie);
              } else if (msgType === HS_SERVER_HELLO) {
                if (retryTimer) {
                  clearTimeout(retryTimer);
                  retryTimer = null;
                }
                if (body.length < 35) {
                  fail(new Error('Malformed DTLS ServerHello'));
                  return;
                }
                serverRandom = Buffer.from(body.subarray(2, 34));
                const sidLen = body.readUInt8(34);
                const selectedCipher = body.readUInt16BE(35 + sidLen);
                if (selectedCipher !== CIPHER_PSK_AES_128_GCM_SHA256) {
                  fail(new Error(`Unexpected DTLS cipher suite 0x${selectedCipher.toString(16)}`));
                  return;
                }
                transcript.push(fullHsMsg);
              } else if (msgType === HS_SERVER_HELLO_DONE) {
                if (!serverHelloDoneReceived) {
                  serverHelloDoneReceived = true;
                  transcript.push(fullHsMsg);
                  sendFlight5();
                }
              } else if (msgType === HS_FINISHED && rec.epoch >= 1 && masterSecret) {
                const expectedHash = crypto.createHash('sha256').update(Buffer.concat(transcript)).digest();
                const expectedVerifyData = tls12PrfSha256(
                  masterSecret,
                  'server finished',
                  expectedHash,
                  12
                );
                if (
                  body.length !== expectedVerifyData.length ||
                  !crypto.timingSafeEqual(body, expectedVerifyData)
                ) {
                  fail(new Error('DTLS server Finished verification failed'));
                  return;
                }
                if (!settled) {
                  settled = true;
                  cleanup();
                  this.connected = true;
                  resolve({ ok: true, cipherSuite: 'TLS_PSK_WITH_AES_128_GCM_SHA256' });
                  return;
                }
              }
            }
          }
        } catch (err) {
          fail(err);
        }
      });

      sock.bind(0, () => {
        sendClientHello();
        // One UDP retransmission in case Hue Bridge UDP:2100 is still warming up after CLIP start
        retryTimer = setTimeout(() => {
          if (!settled && !serverRandom) {
            this.msgSeq = 0;
            sendClientHello();
          }
        }, 350);
      });
    });
  }

  sendApplicationData(plaintextBuffer) {
    if (!this.connected || !this.socket || !this.clientWriteKey || !this.clientWriteIvSalt) {
      return false;
    }
    const record = encryptDtlsAeadRecord({
      contentType: DTLS_CONTENT_APPDATA,
      epoch: 1,
      seqNum: this.epoch1Seq++,
      writeKey: this.clientWriteKey,
      writeIvSalt: this.clientWriteIvSalt,
      plaintext: plaintextBuffer,
    });
    try {
      this.socket.send(record, 0, record.length, this.port, this.host);
      return true;
    } catch {
      return false;
    }
  }

  close() {
    if (this.connected && this.socket && this.clientWriteKey && this.clientWriteIvSalt) {
      try {
        const alertRecord = encryptDtlsAeadRecord({
          contentType: DTLS_CONTENT_ALERT,
          epoch: 1,
          seqNum: this.epoch1Seq++,
          writeKey: this.clientWriteKey,
          writeIvSalt: this.clientWriteIvSalt,
          plaintext: Buffer.from([0x01, 0x00]), // warning, close_notify
        });
        this.socket.send(alertRecord, 0, alertRecord.length, this.port, this.host);
      } catch {}
    }
    this.connected = false;
    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
      this.socket = null;
    }
  }
}

/**
 * Local HTTPS request scoped strictly to a LAN Hue Bridge IP.
 * Hue Bridges serve a bridge-signed local TLS certificate; native bridge handles it cleanly.
 */
function hueLocalRequest(ip, path, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    if (!isPrivateLanIp(ip)) {
      return reject(new Error(`Refusing Hue request to non-LAN IP: ${ip}`));
    }
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname: ip,
        port: 443,
        path,
        method,
        rejectUnauthorized: false,
        timeout: 4000,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 0, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode || 0, data: raw });
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error(`Hue Bridge ${ip} timed out`));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Discover Philips Hue Bridges on LAN via SSDP multicast (239.255.255.250:1900).
 */
async function discoverHueBridges(timeoutMs = 2500) {
  const bridges = new Map();

  // 1. Local SSDP M-SEARCH
  await new Promise((resolve) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const searchMsg = Buffer.from(
      [
        'M-SEARCH * HTTP/1.1',
        'HOST: 239.255.255.250:1900',
        'MAN: "ssdp:discover"',
        'MX: 2',
        'ST: urn:schemas-upnp-org:device:basic:1',
        '',
        '',
      ].join('\r\n')
    );

    sock.on('message', (msg, rinfo) => {
      const text = msg.toString('utf8');
      if (/IpBridge|hue-bridgeid/i.test(text) && isPrivateLanIp(rinfo.address)) {
        const idMatch = text.match(/hue-bridgeid:\s*([A-Fa-f0-9]+)/i);
        bridges.set(rinfo.address, {
          ip: rinfo.address,
          bridgeId: idMatch ? idMatch[1].toUpperCase() : rinfo.address,
          discoveryMethod: 'ssdp_lan',
        });
      }
    });

    sock.on('error', () => {
      try {
        sock.close();
      } catch {}
      resolve();
    });

    sock.bind(0, () => {
      try {
        sock.send(searchMsg, 0, searchMsg.length, 1900, '239.255.255.250');
      } catch {}
    });

    setTimeout(() => {
      try {
        sock.close();
      } catch {}
      resolve();
    }, timeoutMs);
  });

  // 2. Verify Bridge v2 capability & API >= 1.22 on each discovered IP
  const verified = [];
  for (const b of bridges.values()) {
    try {
      const cfg = await hueLocalRequest(b.ip, '/api/config', 'GET');
      const info = cfg.data || {};
      const supported = isBridgeV2ApiSupported(info.apiversion);
      verified.push({
        ip: b.ip,
        bridgeId: info.bridgeid || b.bridgeId,
        name: info.name || 'Philips Hue Bridge',
        modelId: info.modelid || 'UNKNOWN',
        apiVersion: info.apiversion || '0.0.0',
        entertainmentSupported: supported && info.modelid !== 'BSB001',
        reason:
          info.modelid === 'BSB001'
            ? 'Hue Bridge v1 (BSB001) does not support Entertainment API.'
            : !supported
            ? `Bridge API ${info.apiversion || 'unknown'} is below required 1.22.`
            : 'Bridge v2 Entertainment API ready.',
      });
    } catch {
      verified.push({
        ip: b.ip,
        bridgeId: b.bridgeId,
        name: 'Philips Hue Bridge (Unverified)',
        modelId: 'UNKNOWN',
        apiVersion: 'unknown',
        entertainmentSupported: false,
        reason: 'Could not reach local HTTPS /api/config endpoint.',
      });
    }
  }

  return verified;
}

/**
 * Step 2 of Wizard: Pair with Bridge v2 after physical Link button press.
 * Generates and returns both `username` and 32-hex `clientkey` (DTLS 1.2 PSK).
 */
async function pairHueBridge(ip) {
  const cfg = await hueLocalRequest(ip, '/api/config', 'GET');
  const info = cfg.data || {};
  if (info.modelid === 'BSB001' || !isBridgeV2ApiSupported(info.apiversion)) {
    return {
      ok: false,
      code: 'UNSUPPORTED_BRIDGE',
      message: `Hue Bridge v2 (API >= 1.22) is required. Detected model=${info.modelid || 'unknown'}, api=${info.apiversion || 'unknown'}.`,
    };
  }

  const res = await hueLocalRequest(ip, '/api', 'POST', {
    devicetype: 'omnivibe_studio#bridge',
    generateclientkey: true,
  });

  const first = Array.isArray(res.data) ? res.data[0] : res.data;
  if (first?.error) {
    if (first.error.type === 101) {
      return {
        ok: false,
        code: 'LINK_BUTTON_REQUIRED',
        message: 'Press the physical Link button on top of your Hue Bridge v2, then click Pair again within 30 seconds.',
      };
    }
    return { ok: false, code: 'PAIR_ERROR', message: first.error.description || 'Hue Bridge pairing failed.' };
  }

  if (first?.success?.username && first?.success?.clientkey) {
    return {
      ok: true,
      ip,
      username: first.success.username,
      clientkey: first.success.clientkey,
      apiVersion: info.apiversion,
      bridgeName: info.name || 'Philips Hue Bridge v2',
    };
  }

  return { ok: false, code: 'INVALID_RESPONSE', message: 'Bridge did not return both username and clientkey.' };
}

/**
 * Step 3 of Wizard: Query Entertainment Areas (enforces max 10 color lights & max 1 active area).
 */
async function listHueEntertainmentAreas(ip, username) {
  const res = await hueLocalRequest(ip, '/clip/v2/resource/entertainment_configuration', 'GET', null, {
    'hue-application-key': username,
  });

  const rawAreas = Array.isArray(res.data?.data) ? res.data.data : [];
  const areas = rawAreas.map((area) => {
    const channels = Array.isArray(area.channels) ? area.channels.slice(0, MAX_ENTERTAINMENT_LIGHTS) : [];
    return {
      id: area.id,
      name: area.metadata?.name || area.name || 'Entertainment Area',
      status: area.status || 'inactive',
      channelCount: channels.length,
      channels: channels.map((ch) => ({
        channelId: ch.channel_id,
        position: ch.position || { x: 0, y: 0, z: 0 },
      })),
    };
  });

  if (areas.length === 0) {
    return {
      ok: true,
      areas: [],
      guidance:
        'No Entertainment Areas found on this Hue Bridge. Open the official Philips Hue mobile app → Settings → Entertainment Areas → Create Area (up to 10 color-capable lights), then click Refresh.',
    };
  }

  return {
    ok: true,
    areas,
    activeCount: areas.filter((a) => a.status === 'active').length,
    notice:
      'Normal Philips Hue app control is locked for bulbs in the active Entertainment Area while streaming and automatically restored when streaming stops.',
  };
}

/**
 * Build a protocol-compliant HueStream v2.0 binary big-endian frame (for DTLS 1.2 PSK UDP:2100).
 * Spec: "HueStream" (9B) + version 0x02 0x00 (2B) + seq (1B) + reserved (2B) + colorSpace 0x00 RGB (1B)
 * + reserved (1B) + entertainmentAreaId UUID ASCII (36B) + N * [channelId (1B) + R16 (2B) + G16 (2B) + B16 (2B)].
 */
function buildHueStreamV2Frame(entertainmentAreaId, channels, sequence = 0) {
  const safeChannels = channels.slice(0, MAX_ENTERTAINMENT_LIGHTS);
  const headerLen = 52;
  const buf = Buffer.alloc(headerLen + safeChannels.length * 7);

  buf.write('HueStream', 0, 'ascii');
  buf.writeUInt8(0x02, 9); // Major v2
  buf.writeUInt8(0x00, 10); // Minor v0
  buf.writeUInt8(sequence & 0xff, 11);
  buf.writeUInt16BE(0x0000, 12); // Reserved
  buf.writeUInt8(0x00, 14); // Color space: 0x00 = RGB
  buf.writeUInt8(0x00, 15); // Reserved
  buf.write(String(entertainmentAreaId).padEnd(36, ' ').slice(0, 36), 16, 'ascii');

  let offset = headerLen;
  for (const ch of safeChannels) {
    const r16 = Math.round((Math.max(0, Math.min(255, ch.r)) / 255) * 65535);
    const g16 = Math.round((Math.max(0, Math.min(255, ch.g)) / 255) * 65535);
    const b16 = Math.round((Math.max(0, Math.min(255, ch.b)) / 255) * 65535);
    buf.writeUInt8(ch.channelId & 0xff, offset);
    buf.writeUInt16BE(r16, offset + 1);
    buf.writeUInt16BE(g16, offset + 3);
    buf.writeUInt16BE(b16, offset + 5);
    offset += 7;
  }

  return buf;
}

/**
 * Stateful Hue Entertainment Streaming Controller.
 * Enforces max 1 active Entertainment Area per bridge, snapshots previous bulb states,
 * establishes an authenticated DTLS 1.2 PSK session over UDP 2100 at 35 Hz,
 * and restores bulb states automatically on stop.
 */
class HueEntertainmentSession {
  constructor() {
    this.active = false;
    this.ip = null;
    this.username = null;
    this.clientkey = null;
    this.areaId = null;
    this.channels = [];
    this.sequence = 0;
    this.dtlsClient = null;
    this.previousLightStates = new Map();
    this.lastFrameTime = 0;
    this.minFrameIntervalMs = 28; // ~35 Hz (within 30-40 Hz target, tolerating UDP loss)
  }

  async start({ ip, username, clientkey, areaId, channels }) {
    if (!isPrivateLanIp(ip)) {
      throw new Error(`Refusing Hue Entertainment start on non-LAN IP: ${ip}`);
    }
    if (this.active) {
      await this.stop();
    }

    this.ip = ip;
    this.username = username;
    this.clientkey = clientkey;
    this.areaId = areaId;
    this.channels = (channels || []).slice(0, MAX_ENTERTAINMENT_LIGHTS);
    this.sequence = 0;

    // 1. Snapshot previous bulb states so we can restore them on stop
    try {
      const lightsRes = await hueLocalRequest(ip, `/api/${username}/lights`, 'GET');
      if (lightsRes.data && typeof lightsRes.data === 'object') {
        this.previousLightStates.clear();
        for (const [lightId, lightObj] of Object.entries(lightsRes.data)) {
          if (lightObj?.state) {
            this.previousLightStates.set(lightId, {
              on: Boolean(lightObj.state.on),
              bri: lightObj.state.bri,
              xy: lightObj.state.xy,
              ct: lightObj.state.ct,
            });
          }
        }
      }
    } catch {
      // Non-fatal if snapshot fails
    }

    // 2. Activate Entertainment Area via CLIP v2
    const activateRes = await hueLocalRequest(
      ip,
      `/clip/v2/resource/entertainment_configuration/${areaId}`,
      'PUT',
      { action: 'start' },
      { 'hue-application-key': username }
    );

    if (activateRes.status >= 400) {
      throw new Error(`Failed to activate Hue Entertainment Area (${activateRes.status}).`);
    }

    // 3. Complete full RFC 6347 DTLS 1.2 PSK handshake (TLS_PSK_WITH_AES_128_GCM_SHA256)
    const dtls = new Dtls12PskClient({
      host: ip,
      port: HUE_DTLS_PORT,
      pskIdentity: username,
      pskHex: clientkey,
    });

    try {
      await dtls.connect(4500);
    } catch (err) {
      // Unlock Entertainment Area if DTLS handshake failed so user isn't left locked
      await hueLocalRequest(
        ip,
        `/clip/v2/resource/entertainment_configuration/${areaId}`,
        'PUT',
        { action: 'stop' },
        { 'hue-application-key': username }
      ).catch(() => {});
      throw err;
    }

    this.dtlsClient = dtls;
    this.active = true;

    return {
      ok: true,
      port: HUE_DTLS_PORT,
      cipherSuite: 'TLS_PSK_WITH_AES_128_GCM_SHA256',
      targetHz: 35,
      appControlLocked: true,
      snapshotCount: this.previousLightStates.size,
    };
  }

  sendColorFrame(r, g, b) {
    if (!this.active || !this.dtlsClient || !this.ip || !this.areaId) return false;
    const now = Date.now();
    if (now - this.lastFrameTime < this.minFrameIntervalMs) return false;
    this.lastFrameTime = now;

    this.sequence = (this.sequence + 1) & 0xff;
    const channelPayloads = this.channels.map((ch) => ({
      channelId: ch.channelId,
      r,
      g,
      b,
    }));

    const frame = buildHueStreamV2Frame(this.areaId, channelPayloads, this.sequence);
    return this.dtlsClient.sendApplicationData(frame);
  }

  async stop() {
    if (!this.active && !this.dtlsClient) return { ok: true, restored: 0 };
    this.active = false;

    if (this.dtlsClient) {
      this.dtlsClient.close();
      this.dtlsClient = null;
    }

    // 1. Deactivate Entertainment Area
    if (this.ip && this.username && this.areaId) {
      try {
        await hueLocalRequest(
          this.ip,
          `/clip/v2/resource/entertainment_configuration/${this.areaId}`,
          'PUT',
          { action: 'stop' },
          { 'hue-application-key': this.username }
        );
      } catch {}
    }

    // 2. Restore every bulb's previous color/brightness state
    let restored = 0;
    if (this.ip && this.username) {
      for (const [lightId, prev] of this.previousLightStates.entries()) {
        try {
          const restoreBody = { on: prev.on };
          if (typeof prev.bri === 'number') restoreBody.bri = prev.bri;
          if (Array.isArray(prev.xy)) restoreBody.xy = prev.xy;
          else if (typeof prev.ct === 'number') restoreBody.ct = prev.ct;
          await hueLocalRequest(this.ip, `/api/${this.username}/lights/${lightId}/state`, 'PUT', restoreBody);
          restored += 1;
        } catch {}
      }
    }
    this.previousLightStates.clear();

    return { ok: true, restored, appControlLocked: false };
  }
}


// === bridge/drivers/goveeLan.mjs ===
// OmniVibe Studio — Govee Local LAN UDP Driver (Ports 4001/4002/4003 + Razer/Dreamview 0xB1)
// Strictly local RFC-1918 LAN UDP only — zero fallback to Govee cloud HTTP API (10,000 req/24h limit).


const GOVEE_MULTICAST_ADDR = '239.255.255.250';
const GOVEE_SCAN_PORT = 4001;
const GOVEE_LISTEN_PORT = 4002;
const GOVEE_CONTROL_PORT = 4003;

const VPN_INTERFACE_REGEX = /tun|tap|wg|wireguard|tailscale|nordlynx|utun|ppp|vpn|zerotier|hamachi/i;
const WIFI_REGEX = /wi-?fi|wlan|airport|wireless/i;
const ETH_REGEX = /eth|en0|ethernet|local area/i;

/**
 * Pre-Flight Network Diagnostics for Govee LAN UDP:
 * - Probes UDP port 4002 bindability to surface EADDRINUSE conflicts (Home Assistant, Homebridge, Govee Desktop)
 * - Detects active VPN tunnels and Wi-Fi + Ethernet dual-homing issues
 * - Includes IoT VLAN multicast drop advisory and Govee Home app "LAN Control" reminder
 */
async function runGoveePreFlightDiagnostics() {
  const warnings = [];
  let port4002Available = true;
  let port4002ConflictDetail = null;

  // 1. Test UDP 4002 bind
  await new Promise((resolve) => {
    const testSock = dgram.createSocket({ type: 'udp4', reuseAddr: false });
    testSock.once('error', (err) => {
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        port4002Available = false;
        port4002ConflictDetail =
          'UDP port 4002 is already in use on this machine (common if Home Assistant, Homebridge, or Govee Desktop is running). Stop the conflicting service or use Static IP Unicast below.';
        warnings.push({
          code: 'PORT_4002_CONFLICT',
          severity: 'high',
          message: port4002ConflictDetail,
        });
      }
      try {
        testSock.close();
      } catch {}
      resolve();
    });
    testSock.bind(GOVEE_LISTEN_PORT, () => {
      try {
        testSock.close();
      } catch {}
      resolve();
    });
  });

  // 2. Inspect network interfaces for VPNs & Wi-Fi/Ethernet dual-homing
  const ifaces = os.networkInterfaces();
  const activeVpnInterfaces = [];
  const activeIpv4Lan = [];
  let hasWifi = false;
  let hasEthernet = false;

  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.internal || addr.family !== 'IPv4') continue;
      if (VPN_INTERFACE_REGEX.test(name)) {
        activeVpnInterfaces.push({ name, address: addr.address });
      } else {
        activeIpv4Lan.push({ name, address: addr.address });
        if (WIFI_REGEX.test(name)) hasWifi = true;
        if (ETH_REGEX.test(name)) hasEthernet = true;
      }
    }
  }

  if (activeVpnInterfaces.length > 0) {
    warnings.push({
      code: 'VPN_ACTIVE',
      severity: 'medium',
      message: `Active VPN interface detected (${activeVpnInterfaces.map((v) => v.name).join(', ')}). VPN split-tunneling often blocks LAN multicast discovery (239.255.255.250:4001). Disconnect VPN or enter static device IPs.`,
    });
  }

  if (hasWifi && hasEthernet) {
    warnings.push({
      code: 'DUAL_HOMED_NETWORK',
      severity: 'medium',
      message:
        'Both Wi-Fi and Ethernet adapters are active. Multicast discovery packets may leave on the wrong interface or be dropped across router WLAN/LAN bridges. Use Static IP Unicast if auto-discovery returns empty.',
    });
  }

  return {
    ok: port4002Available && warnings.length === 0,
    port4002Available,
    port4002ConflictDetail,
    lanInterfaces: activeIpv4Lan,
    activeVpnInterfaces,
    warnings,
    checklist: [
      'Open the Govee Home mobile app → Select each device → Settings → Toggle "LAN Control" ON.',
      'Ensure your router does not drop UDP multicast between 2.4 GHz IoT VLANs and your main desktop LAN.',
      'Unsupported models (e.g., Govee H6006, H605C, Bluetooth-only strips) do not expose LAN Control.',
    ],
  };
}

/**
 * Discover Govee LAN-enabled devices via UDP multicast (239.255.255.250:4001) listening on UDP 4002.
 */
async function discoverGoveeDevices(timeoutMs = 2500) {
  const devices = new Map();

  return new Promise((resolve) => {
    const listener = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    let bindError = null;

    listener.on('error', (err) => {
      bindError =
        err.code === 'EADDRINUSE'
          ? 'UDP port 4002 is occupied by another app (Home Assistant / Govee Desktop).'
          : err.message;
      try {
        listener.close();
      } catch {}
      resolve({ ok: false, error: bindError, devices: [] });
    });

    listener.on('message', (msg) => {
      try {
        const parsed = JSON.parse(msg.toString('utf8'));
        const data = parsed?.msg?.data;
        if (data?.ip && isPrivateLanIp(data.ip)) {
          devices.set(data.ip, {
            ip: data.ip,
            sku: data.sku || 'GOVEE-LAN',
            deviceId: data.device || data.ip,
            bleVersionHard: data.bleVersionHard,
            wifiVersionSoft: data.wifiVersionSoft,
          });
        }
      } catch {}
    });

    listener.bind(GOVEE_LISTEN_PORT, () => {
      const scanPacket = Buffer.from(
        JSON.stringify({
          msg: {
            cmd: 'scan',
            data: { account_topic: 'reserve' },
          },
        })
      );

      const sender = dgram.createSocket('udp4');
      sender.bind(() => {
        try {
          sender.setMulticastTTL(2);
          sender.send(scanPacket, 0, scanPacket.length, GOVEE_SCAN_PORT, GOVEE_MULTICAST_ADDR, () => {
            try {
              sender.close();
            } catch {}
          });
        } catch {
          try {
            sender.close();
          } catch {}
        }
      });

      setTimeout(() => {
        try {
          listener.close();
        } catch {}
        resolve({ ok: true, devices: Array.from(devices.values()) });
      }, timeoutMs);
    });
  });
}

/**
 * Build Govee Razer/Dreamview 0xB1 activation or streaming payload (XOR checksummed 20-byte packet, Base64 encoded).
 */
function buildGoveeRazerPacket(enable = true) {
  const bytes = Buffer.alloc(20, 0);
  bytes[0] = 0xbb;
  bytes[1] = 0x00;
  bytes[2] = 0x01;
  bytes[3] = 0xb1; // Razer / Dreamview high-speed mode command
  bytes[4] = enable ? 0x01 : 0x00;
  let xor = 0;
  for (let i = 0; i < 19; i++) xor ^= bytes[i];
  bytes[19] = xor;
  return bytes.toString('base64');
}

class GoveeLanController {
  constructor() {
    this.socket = dgram.createSocket('udp4');
    this.lastSendAt = new Map();
    this.lastBrightnessByIp = new Map();
    this.minIntervalMs = 40; // ~25 Hz cap to prevent UDP packet drops on ESP8266/Wi-Fi bulbs
  }

  sendRaw(ip, payloadObj) {
    if (!isPrivateLanIp(ip)) return false;
    const buf = Buffer.from(JSON.stringify(payloadObj));
    try {
      this.socket.send(buf, 0, buf.length, GOVEE_CONTROL_PORT, ip);
      return true;
    } catch {
      return false;
    }
  }

  setRazerMode(ip, enabled = true) {
    if (!isPrivateLanIp(ip)) return false;
    return this.sendRaw(ip, {
      msg: {
        cmd: 'razer',
        data: { pt: buildGoveeRazerPacket(enabled) },
      },
    });
  }

  sendColor(ip, r, g, b, brightnessPercent = 80) {
    if (!isPrivateLanIp(ip)) return false;
    const now = Date.now();
    const last = this.lastSendAt.get(ip) || 0;
    if (now - last < this.minIntervalMs) return false;
    this.lastSendAt.set(ip, now);

    // Handle explicit blackout / panic (0%)
    if (brightnessPercent <= 0) {
      this.lastBrightnessByIp.set(ip, 0);
      return this.sendRaw(ip, {
        msg: { cmd: 'turn', data: { value: 0 } },
      });
    }

    const clampedBri = Math.max(1, Math.min(100, Math.round(brightnessPercent)));
    const prevBri = this.lastBrightnessByIp.get(ip);

    if (prevBri === 0) {
      this.sendRaw(ip, { msg: { cmd: 'turn', data: { value: 1 } } });
    }

    // Delta-skip unchanged brightness (< 2%) to cut UDP traffic in half
    if (prevBri === undefined || Math.abs(clampedBri - prevBri) >= 2) {
      this.lastBrightnessByIp.set(ip, clampedBri);
      this.sendRaw(ip, {
        msg: {
          cmd: 'brightness',
          data: { value: clampedBri },
        },
      });
    }

    return this.sendRaw(ip, {
      msg: {
        cmd: 'colorwc',
        data: {
          color: {
            r: Math.max(0, Math.min(255, Math.round(r))),
            g: Math.max(0, Math.min(255, Math.round(g))),
            b: Math.max(0, Math.min(255, Math.round(b))),
          },
          colorTemInKelvin: 0,
        },
      },
    });
  }

  close() {
    try {
      this.socket.close();
    } catch {}
  }
}


// === bridge/drivers/wizUdp.mjs ===
// OmniVibe Studio — WiZ Local Raw JSON over UDP Driver (Ports 38899 / 38900)
// Supports broadcast discovery (255.255.255.255:38899), static IP unicast list,
// strict RFC-1918 LAN IP validation, and exponential smoothing to eliminate step jitter.


const WIZ_CONTROL_PORT = 38899;
const WIZ_DISCOVERY_REPLY_PORT = 38900;

/**
 * Broadcast discovery for WiZ Wi-Fi RGB bulbs on LAN (255.255.255.255:38899).
 */
async function discoverWizBulbs(timeoutMs = 2200) {
  const found = new Map();

  return new Promise((resolve) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    sock.on('message', (msg, rinfo) => {
      try {
        const parsed = JSON.parse(msg.toString('utf8'));
        if ((parsed?.result?.mac || parsed?.method === 'getPilot') && isPrivateLanIp(rinfo.address)) {
          found.set(rinfo.address, {
            ip: rinfo.address,
            mac: parsed.result?.mac || rinfo.address,
            rssi: parsed.result?.rssi,
            dimming: parsed.result?.dimming ?? 100,
            state: Boolean(parsed.result?.state),
          });
        }
      } catch {}
    });

    sock.on('error', () => {
      try {
        sock.close();
      } catch {}
      resolve({ ok: false, devices: Array.from(found.values()) });
    });

    sock.bind(0, () => {
      try {
        sock.setBroadcast(true);
        const probe = Buffer.from(JSON.stringify({ method: 'getPilot', params: {} }));
        sock.send(probe, 0, probe.length, WIZ_CONTROL_PORT, '255.255.255.255');
        sock.send(probe, 0, probe.length, WIZ_DISCOVERY_REPLY_PORT, '255.255.255.255');
      } catch {}
    });

    setTimeout(() => {
      try {
        sock.close();
      } catch {}
      resolve({
        ok: true,
        devices: Array.from(found.values()),
        recommendation:
          'For best reliability across router reboots, assign DHCP IP reservations to your WiZ bulbs and save them in the Static Unicast IP list.',
      });
    }, timeoutMs);
  });
}

/**
 * Exponential smoothing controller for WiZ setPilot UDP packets.
 * Prevents visible color/brightness step jitter during rapid FFT changes.
 */
class WizUdpController {
  constructor(smoothingAlpha = 0.35) {
    this.socket = dgram.createSocket('udp4');
    this.smoothingAlpha = Math.max(0.05, Math.min(1, smoothingAlpha));
    this.bulbState = new Map(); // ip -> { r, g, b, dimming }
    this.lastSendAt = new Map();
    this.minIntervalMs = 28; // ~35 Hz
  }

  setSmoothing(alpha) {
    this.smoothingAlpha = Math.max(0.05, Math.min(1, alpha));
  }

  sendPilotSmoothed(ip, targetR, targetG, targetB, targetDimming) {
    if (!isPrivateLanIp(ip)) return false;

    const now = Date.now();
    const last = this.lastSendAt.get(ip) || 0;
    if (now - last < this.minIntervalMs) return false;
    this.lastSendAt.set(ip, now);

    // Explicit blackout / panic turns bulb off cleanly
    if (targetDimming <= 0) {
      const offPacket = Buffer.from(
        JSON.stringify({ id: 1, method: 'setPilot', params: { state: false } })
      );
      try {
        this.socket.send(offPacket, 0, offPacket.length, WIZ_CONTROL_PORT, ip);
        return true;
      } catch {
        return false;
      }
    }

    const prev = this.bulbState.get(ip) || {
      r: targetR,
      g: targetG,
      b: targetB,
      dimming: targetDimming,
    };

    const a = this.smoothingAlpha;
    const next = {
      r: prev.r + (targetR - prev.r) * a,
      g: prev.g + (targetG - prev.g) * a,
      b: prev.b + (targetB - prev.b) * a,
      dimming: prev.dimming + (targetDimming - prev.dimming) * a,
    };
    this.bulbState.set(ip, next);

    // WiZ setPilot dimming accepts 10..100
    const dimming = Math.max(10, Math.min(100, Math.round(next.dimming)));
    const packet = Buffer.from(
      JSON.stringify({
        id: 1,
        method: 'setPilot',
        params: {
          state: true,
          r: Math.max(0, Math.min(255, Math.round(next.r))),
          g: Math.max(0, Math.min(255, Math.round(next.g))),
          b: Math.max(0, Math.min(255, Math.round(next.b))),
          dimming,
        },
      })
    );

    try {
      this.socket.send(packet, 0, packet.length, WIZ_CONTROL_PORT, ip);
      return true;
    } catch {
      return false;
    }
  }

  close() {
    try {
      this.socket.close();
    } catch {}
  }
}


// === bridge/server.mjs ===
// OmniVibe Studio — Local Companion Bridge Service (Loopback WebSocket ws://127.0.0.1:47890)
// Owns native OS UDP / DTLS 1.2 PSK sockets for Philips Hue Entertainment API,
// Govee LAN UDP (4001/4002/4003 + Razer 0xB1), and WiZ Raw JSON UDP (38899/38900).
// Protected against Cross-Site WebSocket Hijacking (CSWSH) via strict Origin allowlist.


const BRIDGE_HOST = '127.0.0.1';
const BRIDGE_PORT = Number(process.env.OMNIVIBE_BRIDGE_PORT || 47890);
const MAX_WS_PAYLOAD_BYTES = 64 * 1024; // 64 KB frame size cap

const hueSession = new HueEntertainmentSession();
const goveeController = new GoveeLanController();
const wizController = new WizUdpController(0.35);

/**
 * Validates HTTP / WebSocket Origin headers against strictly authorized OmniVibe surfaces
 * to block Cross-Site WebSocket Hijacking (CSWSH) from arbitrary third-party websites.
 */
function isAllowedBridgeOrigin(origin, { allowNoOrigin = false } = {}) {
  if (!origin || typeof origin !== 'string') {
    return Boolean(allowNoOrigin);
  }
  const normalized = origin.trim();
  if (
    normalized === 'https://omnivibe.app' ||
    normalized === 'https://www.omnivibe.app' ||
    normalized === 'app://omnivibe.local'
  ) {
    return true;
  }
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/i.test(normalized)) {
    return true;
  }
  return false;
}

// Minimal RFC 6455 WebSocket frame helpers (text + ping/pong + close)
function encodeWsFrame(opcode, payloadBuf) {
  const len = payloadBuf.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x80 | (opcode & 0x0f), len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | (opcode & 0x0f);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payloadBuf]);
}

function encodeWsTextFrame(text) {
  return encodeWsFrame(0x01, Buffer.from(text, 'utf8'));
}

function decodeWsFrames(buffer) {
  const messages = [];
  let offset = 0;
  let oversized = false;

  while (offset + 2 <= buffer.length) {
    const opcode = buffer[offset] & 0x0f;
    const masked = (buffer[offset + 1] & 0x80) !== 0;
    let payloadLen = buffer[offset + 1] & 0x7f;
    let cursor = offset + 2;

    if (payloadLen === 126) {
      if (cursor + 2 > buffer.length) break;
      payloadLen = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (payloadLen === 127) {
      if (cursor + 8 > buffer.length) break;
      const bigLen = buffer.readBigUInt64BE(cursor);
      if (bigLen > BigInt(MAX_WS_PAYLOAD_BYTES)) {
        oversized = true;
        break;
      }
      payloadLen = Number(bigLen);
      cursor += 8;
    }

    if (payloadLen > MAX_WS_PAYLOAD_BYTES) {
      oversized = true;
      break;
    }

    const maskLen = masked ? 4 : 0;
    if (cursor + maskLen + payloadLen > buffer.length) break;

    const maskKey = masked ? buffer.subarray(cursor, cursor + 4) : null;
    cursor += maskLen;

    const payload = Buffer.alloc(payloadLen);
    for (let i = 0; i < payloadLen; i++) {
      payload[i] = masked ? buffer[cursor + i] ^ maskKey[i % 4] : buffer[cursor + i];
    }

    offset = cursor + payloadLen;
    if (opcode === 0x08) {
      messages.push({ close: true });
    } else if (opcode === 0x09) {
      messages.push({ ping: payload });
    } else if (opcode === 0x01) {
      messages.push({ text: payload.toString('utf8') });
    }
  }
  return { messages, remaining: buffer.subarray(offset), oversized };
}

async function handleRpcCommand(cmd) {
  const { id, type, payload = {} } = cmd || {};
  try {
    switch (type) {
      case 'ping':
        return {
          id,
          ok: true,
          bridgeVersion: '1.0.0',
          hueStreaming: hueSession.active,
        };

      case 'govee:diagnostics':
        return { id, ok: true, data: await runGoveePreFlightDiagnostics() };

      case 'govee:discover':
        return { id, ok: true, data: await discoverGoveeDevices(payload.timeoutMs || 2500) };

      case 'govee:razer':
        if (!isPrivateLanIp(payload.ip)) {
          return { id, ok: false, error: 'Refusing Govee Razer mode on non-LAN IP.' };
        }
        return { id, ok: goveeController.setRazerMode(payload.ip, Boolean(payload.enabled)) };

      case 'hue:discover':
        return { id, ok: true, data: await discoverHueBridges(payload.timeoutMs || 2500) };

      case 'hue:pair':
        if (!isPrivateLanIp(payload.ip)) {
          return { id, ok: false, error: 'Refusing Hue pairing on non-LAN IP.' };
        }
        return { id, ok: true, data: await pairHueBridge(payload.ip) };

      case 'hue:areas':
        if (!isPrivateLanIp(payload.ip)) {
          return { id, ok: false, error: 'Refusing Hue query on non-LAN IP.' };
        }
        return { id, ok: true, data: await listHueEntertainmentAreas(payload.ip, payload.username) };

      case 'hue:start':
        if (!isPrivateLanIp(payload.ip)) {
          return { id, ok: false, error: 'Refusing Hue Entertainment start on non-LAN IP.' };
        }
        return { id, ok: true, data: await hueSession.start(payload) };

      case 'hue:stop':
        return { id, ok: true, data: await hueSession.stop() };

      case 'wiz:discover':
        return { id, ok: true, data: await discoverWizBulbs(payload.timeoutMs || 2200) };

      case 'sync:frame': {
        const {
          r = 56,
          g = 189,
          b = 248,
          brightness = 80,
          goveeIps = [],
          wizIps = [],
          smoothing = 0.35,
        } = payload;
        wizController.setSmoothing(smoothing);

        let sentHue = false;
        if (hueSession.active) {
          sentHue = hueSession.sendColorFrame(r, g, b);
        }
        let sentGovee = 0;
        if (Array.isArray(goveeIps)) {
          for (const ip of goveeIps) {
            if (isPrivateLanIp(ip) && goveeController.sendColor(ip, r, g, b, brightness)) {
              sentGovee += 1;
            }
          }
        }
        let sentWiz = 0;
        if (Array.isArray(wizIps)) {
          for (const ip of wizIps) {
            if (isPrivateLanIp(ip) && wizController.sendPilotSmoothed(ip, r, g, b, brightness)) {
              sentWiz += 1;
            }
          }
        }
        return { id, ok: true, sentHue, sentGovee, sentWiz };
      }

      default:
        return { id, ok: false, error: `Unknown command: ${type}` };
    }
  } catch (err) {
    return { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function startBridgeServer(port = BRIDGE_PORT, options = {}) {
  const server = http.createServer((req, res) => {
    const origin = req.headers.origin || '';
    if (isAllowedBridgeOrigin(origin, { allowNoOrigin: false })) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Vary', 'Origin');
    res.setHeader('Content-Type', 'application/json');

    if (req.url === '/health') {
      res.writeHead(200);
      res.end(
        JSON.stringify({
          ok: true,
          service: 'omnivibe-local-bridge',
          version: '1.0.0',
          wsUrl: `ws://${BRIDGE_HOST}:${port}`,
          hueStreaming: hueSession.active,
        })
      );
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ ok: false, error: 'Not Found' }));
  });

  server.on('upgrade', (req, socket) => {
    const origin = req.headers.origin;
    if (!isAllowedBridgeOrigin(origin, { allowNoOrigin: Boolean(options.allowNoOrigin) })) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const acceptKey = crypto
      .createHash('sha1')
      .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');

    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptKey}`,
        '',
        '',
      ].join('\r\n')
    );

    let pending = Buffer.alloc(0);
    socket.on('data', async (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      if (pending.length > MAX_WS_PAYLOAD_BYTES * 2) {
        socket.destroy();
        return;
      }

      const { messages, remaining, oversized } = decodeWsFrames(pending);
      if (oversized) {
        socket.write('HTTP/1.1 1009 Message Too Big\r\n');
        socket.destroy();
        return;
      }
      pending = remaining;

      for (const m of messages) {
        if (m.close) {
          socket.end();
          return;
        }
        if (m.ping && !socket.destroyed) {
          socket.write(encodeWsFrame(0x0a, m.ping));
          continue;
        }
        if (m.text) {
          try {
            const parsed = JSON.parse(m.text);
            const result = await handleRpcCommand(parsed);
            if (!socket.destroyed) {
              socket.write(encodeWsTextFrame(JSON.stringify(result)));
            }
          } catch {}
        }
      }
    });
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.warn(`[OmniVibe Local Bridge] Port ${port} already in use; reusing existing bridge instance.`);
    } else {
      console.error('[OmniVibe Local Bridge] Server error:', err);
    }
  });

  server.listen(port, BRIDGE_HOST, () => {
    console.log(
      `[OmniVibe Local Bridge] Listening on ws://${BRIDGE_HOST}:${port} (Hue DTLS:2100, Govee UDP:4001-4003, WiZ UDP:38899)`
    );
  });

  const cleanup = async () => {
    await hueSession.stop();
    goveeController.close();
    wizController.close();
    try {
      server.close();
    } catch {}
  };

  if (!options.embedded) {
    process.on('SIGINT', () => cleanup().finally(() => process.exit(0)));
    process.on('SIGTERM', () => cleanup().finally(() => process.exit(0)));
  }

  return { server, cleanup };
}

startBridgeServer();

