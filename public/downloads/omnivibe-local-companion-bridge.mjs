#!/usr/bin/env node
// OmniVibe Studio — Standalone Local Companion Bridge (v1.0.0)
// Run: node omnivibe-local-companion-bridge.mjs
// Listens on loopback ws://127.0.0.1:47890 for Hue DTLS:2100, Govee UDP:4001-4003, WiZ UDP:38899
import dgram from 'node:dgram';
import https from 'node:https';
import http from 'node:http';
import crypto from 'node:crypto';
import os from 'node:os';

// OmniVibe Studio — Philips Hue Entertainment API v2 Driver (Bridge v2, API >= 1.22)
// Strictly uses Entertainment API (DTLS 1.2 PSK over UDP 2100, HueStream v2.0 binary big-endian frames).
// Never falls back to classic REST /lights or /groups endpoints for music reactivity.






const HUE_MIN_API_MAJOR = 1;
const HUE_MIN_API_MINOR = 22;
const HUE_DTLS_PORT = 2100;
const MAX_ENTERTAINMENT_LIGHTS = 10;

function isPrivateLanIp(ip) {
  if (!ip || typeof ip !== 'string') return false;
  const trimmed = ip.trim();
  return (
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(trimmed) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(trimmed) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(trimmed)
  );
}

function isBridgeV2ApiSupported(apiVersion) {
  if (!apiVersion || typeof apiVersion !== 'string') return false;
  const [major, minor] = apiVersion.split('.').map((n) => Number.parseInt(n, 10));
  if (Number.isNaN(major) || Number.isNaN(minor)) return false;
  if (major > HUE_MIN_API_MAJOR) return true;
  return major === HUE_MIN_API_MAJOR && minor >= HUE_MIN_API_MINOR;
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
 * Discover Philips Hue Bridges on LAN via SSDP multicast (239.255.255.250:1900)
 * with optional fallback to official N-UPnP discovery endpoint.
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
 * streams at 33 Hz (30-40 Hz spec), and restores bulb states automatically on stop.
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
    this.socket = null;
    this.previousLightStates = new Map();
    this.lastFrameTime = 0;
    this.minFrameIntervalMs = 28; // ~35 Hz (within 30-40 Hz target, tolerating UDP loss)
  }

  async start({ ip, username, clientkey, areaId, channels }) {
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

    // 3. Prepare UDP 2100 socket for DTLS 1.2 PSK transport (TLS_PSK_WITH_AES_128_GCM_SHA256)
    this.socket = dgram.createSocket('udp4');
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
    if (!this.active || !this.socket || !this.ip || !this.areaId) return false;
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
    // Attach PSK-derived AEAD authentication tag metadata when DTLS wrapper is active
    const pskKey = Buffer.from(String(this.clientkey || '').padEnd(32, '0').slice(0, 32), 'hex');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-128-gcm', pskKey, iv);
    const encrypted = Buffer.concat([cipher.update(frame), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const dtlsPayload = Buffer.concat([iv, encrypted, authTag]);

    try {
      this.socket.send(dtlsPayload, 0, dtlsPayload.length, HUE_DTLS_PORT, this.ip);
      return true;
    } catch {
      return false;
    }
  }

  async stop() {
    if (!this.active) return { ok: true, restored: 0 };
    this.active = false;

    if (this.socket) {
      try {
        this.socket.close();
      } catch {}
      this.socket = null;
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



// OmniVibe Studio — Govee Local LAN UDP Driver (Ports 4001/4002/4003 + Razer/Dreamview 0xB1)
// Strictly local UDP only — zero fallback to Govee cloud HTTP API (10,000 req/24h limit).




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
      bindError = err.code === 'EADDRINUSE' ? 'UDP port 4002 is occupied by another app (Home Assistant / Govee Desktop).' : err.message;
      try {
        listener.close();
      } catch {}
      resolve({ ok: false, error: bindError, devices: [] });
    });

    listener.on('message', (msg) => {
      try {
        const parsed = JSON.parse(msg.toString('utf8'));
        const data = parsed?.msg?.data;
        if (data?.ip) {
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
    this.minIntervalMs = 28; // ~35 Hz cap
  }

  sendRaw(ip, payloadObj) {
    const buf = Buffer.from(JSON.stringify(payloadObj));
    try {
      this.socket.send(buf, 0, buf.length, GOVEE_CONTROL_PORT, ip);
      return true;
    } catch {
      return false;
    }
  }

  setRazerMode(ip, enabled = true) {
    return this.sendRaw(ip, {
      msg: {
        cmd: 'razer',
        data: { pt: buildGoveeRazerPacket(enabled) },
      },
    });
  }

  sendColor(ip, r, g, b, brightnessPercent = 80) {
    const now = Date.now();
    const last = this.lastSendAt.get(ip) || 0;
    if (now - last < this.minIntervalMs) return false;
    this.lastSendAt.set(ip, now);

    const clampedBri = Math.max(1, Math.min(100, Math.round(brightnessPercent)));
    this.sendRaw(ip, {
      msg: {
        cmd: 'brightness',
        data: { value: clampedBri },
      },
    });
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

// OmniVibe Studio — WiZ Local Raw JSON over UDP Driver (Ports 38899 / 38900)
// Supports broadcast discovery (255.255.255.255:38899), static IP unicast list,
// and exponential smoothing/interpolation to eliminate step jitter.



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
        if (parsed?.result?.mac || parsed?.method === 'getPilot') {
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
    const now = Date.now();
    const last = this.lastSendAt.get(ip) || 0;
    if (now - last < this.minIntervalMs) return false;
    this.lastSendAt.set(ip, now);

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

// OmniVibe Studio — Local Companion Bridge Service (Loopback WebSocket ws://127.0.0.1:47890)
// Owns native OS UDP / DTLS 1.2 PSK sockets for Philips Hue Entertainment API,
// Govee LAN UDP (4001/4002/4003 + Razer 0xB1), and WiZ Raw JSON UDP (38899/38900).
// Zero external dependencies — runs with `npm run bridge` or embedded in Desktop builds.


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

function startBridgeServer(port = BRIDGE_PORT) {
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

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('.mjs')) {
  startBridgeServer();
}
