// OmniVibe Studio — Govee Local LAN UDP Driver (Ports 4001/4002/4003 + Razer/Dreamview 0xB1)
// Strictly local UDP only — zero fallback to Govee cloud HTTP API (10,000 req/24h limit).

import dgram from 'node:dgram';
import os from 'node:os';

export const GOVEE_MULTICAST_ADDR = '239.255.255.250';
export const GOVEE_SCAN_PORT = 4001;
export const GOVEE_LISTEN_PORT = 4002;
export const GOVEE_CONTROL_PORT = 4003;

const VPN_INTERFACE_REGEX = /tun|tap|wg|wireguard|tailscale|nordlynx|utun|ppp|vpn|zerotier|hamachi/i;
const WIFI_REGEX = /wi-?fi|wlan|airport|wireless/i;
const ETH_REGEX = /eth|en0|ethernet|local area/i;

/**
 * Pre-Flight Network Diagnostics for Govee LAN UDP:
 * - Probes UDP port 4002 bindability to surface EADDRINUSE conflicts (Home Assistant, Homebridge, Govee Desktop)
 * - Detects active VPN tunnels and Wi-Fi + Ethernet dual-homing issues
 * - Includes IoT VLAN multicast drop advisory and Govee Home app "LAN Control" reminder
 */
export async function runGoveePreFlightDiagnostics() {
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
export async function discoverGoveeDevices(timeoutMs = 2500) {
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
export function buildGoveeRazerPacket(enable = true) {
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

export class GoveeLanController {
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
