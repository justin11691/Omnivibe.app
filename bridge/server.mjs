// OmniVibe Studio — Local Companion Bridge Service (Loopback WebSocket ws://127.0.0.1:47890)
// Owns native OS UDP / DTLS 1.2 PSK sockets for Philips Hue Entertainment API,
// Govee LAN UDP (4001/4002/4003 + Razer 0xB1), and WiZ Raw JSON UDP (38899/38900).
// Zero external dependencies — runs with `npm run bridge` or embedded in Desktop builds.

import http from 'node:http';
import crypto from 'node:crypto';
import {
  discoverHueBridges,
  pairHueBridge,
  listHueEntertainmentAreas,
  HueEntertainmentSession,
} from './drivers/hueEntertainment.mjs';
import {
  runGoveePreFlightDiagnostics,
  discoverGoveeDevices,
  GoveeLanController,
} from './drivers/goveeLan.mjs';
import { discoverWizBulbs, WizUdpController } from './drivers/wizUdp.mjs';

const BRIDGE_HOST = '127.0.0.1';
const BRIDGE_PORT = Number(process.env.OMNIVIBE_BRIDGE_PORT || 47890);

const hueSession = new HueEntertainmentSession();
const goveeController = new GoveeLanController();
const wizController = new WizUdpController(0.35);

// Minimal RFC 6455 WebSocket frame helpers (text frames)
function encodeWsTextFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function decodeWsFrames(buffer) {
  const messages = [];
  let offset = 0;
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
      payloadLen = Number(buffer.readBigUInt64BE(cursor));
      cursor += 8;
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
    } else if (opcode === 0x01) {
      messages.push({ text: payload.toString('utf8') });
    }
  }
  return { messages, remaining: buffer.subarray(offset) };
}

async function handleRpcCommand(cmd) {
  const { id, type, payload = {} } = cmd;
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
        return { id, ok: goveeController.setRazerMode(payload.ip, Boolean(payload.enabled)) };

      case 'hue:discover':
        return { id, ok: true, data: await discoverHueBridges(payload.timeoutMs || 2500) };

      case 'hue:pair':
        return { id, ok: true, data: await pairHueBridge(payload.ip) };

      case 'hue:areas':
        return { id, ok: true, data: await listHueEntertainmentAreas(payload.ip, payload.username) };

      case 'hue:start':
        return { id, ok: true, data: await hueSession.start(payload) };

      case 'hue:stop':
        return { id, ok: true, data: await hueSession.stop() };

      case 'wiz:discover':
        return { id, ok: true, data: await discoverWizBulbs(payload.timeoutMs || 2200) };

      case 'sync:frame': {
        const { r = 56, g = 189, b = 248, brightness = 80, goveeIps = [], wizIps = [], smoothing = 0.35 } = payload;
        wizController.setSmoothing(smoothing);

        let sentHue = false;
        if (hueSession.active) {
          sentHue = hueSession.sendColorFrame(r, g, b);
        }
        let sentGovee = 0;
        for (const ip of goveeIps) {
          if (goveeController.sendColor(ip, r, g, b, brightness)) sentGovee += 1;
        }
        let sentWiz = 0;
        for (const ip of wizIps) {
          if (wizController.sendPilotSmoothed(ip, r, g, b, brightness)) sentWiz += 1;
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

export function startBridgeServer(port = BRIDGE_PORT) {
  const server = http.createServer((req, res) => {
    const origin = req.headers.origin || '';
    const allowedOrigin =
      origin === 'https://omnivibe.app' ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:')
        ? origin
        : 'https://omnivibe.app';

    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
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
      const { messages, remaining } = decodeWsFrames(pending);
      pending = remaining;

      for (const m of messages) {
        if (m.close) {
          socket.end();
          return;
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

  server.listen(port, BRIDGE_HOST, () => {
    console.log(`[OmniVibe Local Bridge] Listening on ws://${BRIDGE_HOST}:${port} (Hue DTLS:2100, Govee UDP:4001-4003, WiZ UDP:38899)`);
  });

  const cleanup = async () => {
    await hueSession.stop();
    goveeController.close();
    wizController.close();
    server.close();
  };

  process.on('SIGINT', () => cleanup().finally(() => process.exit(0)));
  process.on('SIGTERM', () => cleanup().finally(() => process.exit(0)));

  return { server, cleanup };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('server.mjs')) {
  startBridgeServer();
}
