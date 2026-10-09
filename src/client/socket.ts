/**
 * The line to the game server: opens, says hello, hands every message to the
 * shell, and reconnects with backoff when the connection drops. Carries the
 * browser's secret, which is what makes a character this browser's, and
 * remembers the session token so a reconnect resumes the same character.
 */
import { type ClientMessage, decodeServerMessage, PROTOCOL_VERSION, type ServerMessage } from '@/net/protocol';

export type SocketStatus = 'connecting' | 'open' | 'closed' | 'rejected';

export interface SocketHandlers {
  onMessage(msg: ServerMessage, now: number): void;
  onStatus(status: SocketStatus, detail: string): void;
}

const BACKOFF_MS = [1000, 2000, 4000, 8000, 10_000];

export class GameSocket {
  token: string | null;
  private ws: WebSocket | null = null;
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private rejected = false;

  constructor(private readonly url: string, private readonly name: string, private readonly secret: string, token: string | null, private readonly handlers: SocketHandlers) {
    this.token = token;
  }

  connect(): void {
    if (this.stopped) return;
    this.handlers.onStatus('connecting', this.attempts === 0 ? 'Connecting' : `Reconnecting, try ${this.attempts + 1}`);
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (error) {
      this.handlers.onStatus('closed', error instanceof Error ? error.message : 'Bad server address');
      this.retry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.send({ t: 'hello', v: PROTOCOL_VERSION, name: this.name, secret: this.secret, token: this.token });
    };
    ws.onmessage = (event) => {
      const msg = decodeServerMessage(typeof event.data === 'string' ? event.data : '');
      if (!msg) return;
      if (msg.t === 'welcome') {
        this.token = msg.token;
        this.attempts = 0;
        this.handlers.onStatus('open', 'Connected');
      } else if (msg.t === 'reject') {
        this.rejected = true;
        this.handlers.onStatus('rejected', msg.reason);
      }
      this.handlers.onMessage(msg, performance.now());
    };
    ws.onclose = (event) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped || this.rejected) return;
      this.handlers.onStatus('closed', event.reason || 'Connection lost');
      this.retry();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  get connected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  send(msg: ClientMessage): boolean {
    if (!this.connected) return false;
    this.ws!.send(JSON.stringify(msg));
    return true;
  }

  close(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close(1000, 'Leaving');
    this.ws = null;
  }

  private retry(): void {
    const delay = BACKOFF_MS[Math.min(this.attempts, BACKOFF_MS.length - 1)]!;
    this.attempts += 1;
    this.timer = setTimeout(() => this.connect(), delay);
  }
}
