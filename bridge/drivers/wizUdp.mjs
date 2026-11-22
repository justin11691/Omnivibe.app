// OmniVibe Studio — WiZ Local Raw JSON over UDP Driver (Ports 38899 / 38900)
// Supports broadcast discovery (255.255.255.255:38899), static IP unicast list,
// and exponential smoothing/interpolation to eliminate step jitter.

import dgram from 'node:dgram';

export const WIZ_CONTROL_PORT = 38899;
export const WIZ_DISCOVERY_REPLY_PORT = 38900;

/**
 * Broadcast discovery for WiZ Wi-Fi RGB bulbs on LAN (255.255.255.255:38899).
 */
export async function discoverWizBulbs(timeoutMs = 2200) {
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
export class WizUdpController {
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
