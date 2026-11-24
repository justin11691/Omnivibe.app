// OmniVibe Studio — Local Companion Bridge Service (Loopback WebSocket ws://127.0.0.1:47890)
// Owns native OS UDP / DTLS 1.2 PSK sockets for Philips Hue Entertainment API,
// Govee LAN UDP (4001/4002/4003 + Razer 0xB1), and WiZ Raw JSON UDP (38899/38900).
// Protected against Cross-Site WebSocket Hijacking (CSWSH) via strict Origin allowlist.

import http from 'node:http';
import crypto from 'node:crypto';
import {
  discoverHueBridges,
  pairHueBridge,
  listHueEntertainmentAreas,
  HueEntertainmentSession,
  isPrivateLanIp,
} from './drivers/hueEntertainment.mjs';
import {
  runGoveePreFlightDiagnostics,
  discoverGoveeDevices,
  GoveeLanController,
} from './drivers/goveeLan.mjs';
import { discoverWizBulbs, WizUdpController } from './drivers/wizUdp.mjs';

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
export function isAllowedBridgeOrigin(origin, { allowNoOrigin = false } = {}) {
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

export function startBridgeServer(port = BRIDGE_PORT, options = {}) {
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

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('server.mjs')) {
  startBridgeServer();
}
