// OmniVibe Studio — Browser-to-Local Companion Bridge WebSocket Client
// Connects exclusively to loopback ws://127.0.0.1:47890 (never attempts raw UDP/DTLS from browser tabs).

export interface BridgeDiagnostics {
  ok: boolean;
  port4002Available: boolean;
  port4002ConflictDetail: string | null;
  lanInterfaces: Array<{ name: string; address: string }>;
  activeVpnInterfaces: Array<{ name: string; address: string }>;
  warnings: Array<{ code: string; severity: string; message: string }>;
  checklist: string[];
}

export class CompanionBridgeClient {
  private ws: WebSocket | null = null;
  private url = 'ws://127.0.0.1:47890';
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private seq = 1;
  private statusListeners = new Set<(connected: boolean) => void>();
  public isConnected = false;

  public subscribeStatus(cb: (connected: boolean) => void): () => void {
    this.statusListeners.add(cb);
    cb(this.isConnected);
    return () => this.statusListeners.delete(cb);
  }

  private setStatus(connected: boolean) {
    this.isConnected = connected;
    this.statusListeners.forEach((cb) => cb(connected));
  }

  public async connect(timeoutMs = 1500): Promise<boolean> {
    if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return true;

    return new Promise((resolve) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          this.setStatus(false);
          resolve(false);
        }
      }, timeoutMs);

      try {
        const socket = new WebSocket(this.url);
        this.ws = socket;

        socket.onopen = () => {
          if (!settled) {
            settled = true;
            window.clearTimeout(timer);
            this.setStatus(true);
            resolve(true);
          }
        };

        socket.onmessage = (evt) => {
          try {
            const msg = JSON.parse(String(evt.data));
            const handler = this.pending.get(msg.id);
            if (handler) {
              this.pending.delete(msg.id);
              if (msg.ok) handler.resolve(msg.data ?? msg);
              else handler.reject(new Error(msg.error || 'Bridge RPC failed'));
            }
          } catch {}
        };

        socket.onerror = () => {
          if (!settled) {
            settled = true;
            window.clearTimeout(timer);
            this.setStatus(false);
            resolve(false);
          }
        };

        socket.onclose = () => {
          this.setStatus(false);
          for (const [, p] of this.pending) {
            p.reject(new Error('Companion Bridge disconnected'));
          }
          this.pending.clear();
        };
      } catch {
        window.clearTimeout(timer);
        this.setStatus(false);
        resolve(false);
      }
    });
  }

  public async rpc<T = any>(type: string, payload: Record<string, unknown> = {}, timeoutMs = 5000): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      const ok = await this.connect(1200);
      if (!ok) {
        throw new Error('OmniVibe Local Companion Bridge is offline. Run `npm run bridge` or launch the OmniVibe Studio Desktop app.');
      }
    }

    const id = this.seq++;
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Bridge command "${type}" timed out`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (val) => {
          window.clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          window.clearTimeout(timer);
          reject(err);
        },
      });

      this.ws?.send(JSON.stringify({ id, type, payload }));
    });
  }

  public sendSyncFrame(payload: {
    r: number;
    g: number;
    b: number;
    brightness: number;
    goveeIps: string[];
    wizIps: string[];
    smoothing?: number;
  }): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify({ id: this.seq++, type: 'sync:frame', payload }));
    } catch {}
  }

  public disconnect() {
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.setStatus(false);
  }
}

export const companionBridge = new CompanionBridgeClient();
