// OmniVibe Studio — Philips Hue Entertainment API v2 Driver (Bridge v2, API >= 1.22)
// Uses RFC 6347 / RFC 4279 / RFC 5487 DTLS 1.2 PSK (TLS_PSK_WITH_AES_128_GCM_SHA256, 0x00A8)
// over UDP 2100 with big-endian HueStream v2.0 binary frames. Never falls back to REST polling.

import dgram from 'node:dgram';
import https from 'node:https';
import http from 'node:http';
import crypto from 'node:crypto';

const HUE_MIN_API_MAJOR = 1;
const HUE_MIN_API_MINOR = 22;
export const HUE_DTLS_PORT = 2100;
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

export function isPrivateLanIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const trimmed = ip.trim();
  return (
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(trimmed) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(trimmed)
  );
}

/** Allows RFC-1918 LAN IPs and loopback (strictly for automated local unit testing when opted in). */
export function isPrivateOrLoopbackIp(ip, allowLoopback = false) {
  if (isPrivateLanIp(ip)) return true;
  if (allowLoopback && typeof ip === 'string' && ip.trim() === '127.0.0.1') return true;
  return false;
}

export function isBridgeV2ApiSupported(apiVersion) {
  if (!apiVersion || typeof apiVersion !== 'string') return false;
  const [major, minor] = apiVersion.split('.').map((n) => Number.parseInt(n, 10));
  if (Number.isNaN(major) || Number.isNaN(minor)) return false;
  if (major > HUE_MIN_API_MAJOR) return true;
  return major === HUE_MIN_API_MAJOR && minor >= HUE_MIN_API_MINOR;
}

/**
 * RFC 5246 §5 TLS 1.2 PRF using HMAC-SHA256 (P_SHA256).
 */
export function tls12PrfSha256(secret, label, seed, length) {
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

export function buildPskPremasterSecret(pskBytes) {
  const n = pskBytes.length;
  const out = Buffer.alloc(4 + n * 2);
  out.writeUInt16BE(n, 0);
  // out[2 .. 2+n) left as zero-filled
  out.writeUInt16BE(n, 2 + n);
  pskBytes.copy(out, 4 + n);
  return out;
}

export function encryptDtlsAeadRecord({ contentType, epoch, seqNum, writeKey, writeIvSalt, plaintext }) {
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

export function decryptDtlsAeadRecord({ record, readKey, readIvSalt }) {
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
export class Dtls12PskClient {
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
export async function discoverHueBridges(timeoutMs = 2500) {
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
export async function pairHueBridge(ip) {
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
export async function listHueEntertainmentAreas(ip, username) {
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
export function buildHueStreamV2Frame(entertainmentAreaId, channels, sequence = 0) {
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
export class HueEntertainmentSession {
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

export { http };
