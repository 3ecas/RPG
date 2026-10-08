/**
 * The online client's page: a top bar with the zone, the connection and who
 * is here, the world canvas, a docked chat, and the join card that asks for a
 * name. Wires the socket to the replica and the replica to the scene; holds
 * no rule.
 */
import { Replica } from '@/client/replica';
import { GameSocket, type SocketStatus } from '@/client/socket';
import { LIMITS, normalizeName, type ServerMessage } from '@/net/protocol';
import type { ZoneMapDef } from '@/types/content';
import type { ZoneId } from '@/types/ids';
import { escapeHtml } from '../html';
import { OnlineScene, type SceneContent } from './scene';

export interface OnlineContent extends SceneContent {
  map(id: ZoneId): ZoneMapDef;
  hasZone(id: string): id is ZoneId;
}

export interface OnlineConfig {
  serverUrl: string;
}

const NAME_KEY = 'rpg.online.name';
/** Per tab, so two tabs in one browser are two characters. */
const SESSION_KEY = 'rpg.online.session';
const PING_MS = 5000;

interface Session {
  name: string;
  token: string;
}

export class OnlineApp {
  private readonly replica = new Replica();
  private readonly scene: OnlineScene;
  private socket: GameSocket | null = null;
  private status: { kind: SocketStatus; detail: string } = { kind: 'closed', detail: 'Not connected' };
  private running = false;
  private rtt: number | null = null;
  private lastChatLine: unknown = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private els!: {
    zone: HTMLElement; status: HTMLElement; count: HTMLElement; tick: HTMLElement; run: HTMLButtonElement;
    world: HTMLElement; chat: HTMLElement; log: HTMLElement; input: HTMLInputElement;
    join: HTMLElement; name: HTMLInputElement; server: HTMLInputElement; error: HTMLElement; joinButton: HTMLButtonElement;
  };

  constructor(private readonly root: HTMLElement, private readonly content: OnlineContent, private readonly config: OnlineConfig) {
    this.scene = new OnlineScene(content, this.replica);
  }

  mount(): void {
    const savedName = read(localStorage, NAME_KEY) ?? '';
    this.root.innerHTML =
      '<header class="topbar"><span class="brand">Greenhollow Online</span>' +
      '<span class="chips"><span class="chip" id="on-zone">No zone yet</span><span class="chip" id="on-status">Not connected</span><span class="chip" id="on-count"></span></span>' +
      '<span class="now idle"><button class="menu-btn" id="on-run" type="button" title="Toggle running (R)">Walking</button><span class="saved" id="on-tick"></span></span></header>' +
      '<main class="stage"><div class="world" id="on-world"></div>' +
      '<div class="chatbox" id="on-chat" hidden><div class="chat-log" id="on-log"></div><form class="chat-form" id="on-chat-form"><input id="on-chat-input" type="text" autocomplete="off" maxlength="' + LIMITS.CHAT_MAX + '" placeholder="Press Enter to talk"></form></div>' +
      '<div class="join" id="on-join"><form class="join-card" id="on-join-form"><h1>Greenhollow Online</h1><p class="muted">The first multiplayer slice: walk a zone together and talk. Pick a name; others will see it over your head.</p>' +
      '<label>Name<input id="on-name" type="text" autocomplete="off" maxlength="' + LIMITS.NAME_MAX + '" value="' + escapeHtml(savedName) + '" placeholder="Letters, digits, spaces" required></label>' +
      '<label>Server<input id="on-server" type="text" autocomplete="off" value="' + escapeHtml(this.config.serverUrl) + '"></label>' +
      '<div class="join-error" id="on-error"></div><button class="menu-btn join-button" id="on-join-button" type="submit">Enter the world</button></form></div></main>';
    const q = <T extends Element>(id: string) => this.root.querySelector<T>(`#${id}`)!;
    this.els = {
      zone: q('on-zone'), status: q('on-status'), count: q('on-count'), tick: q('on-tick'), run: q('on-run'),
      world: q('on-world'), chat: q('on-chat'), log: q('on-log'), input: q('on-chat-input'),
      join: q('on-join'), name: q('on-name'), server: q('on-server'), error: q('on-error'), joinButton: q('on-join-button'),
    };
    this.scene.mount(this.els.world);
    this.scene.onWalk = (cell) => {
      this.socket?.send({ t: 'move', x: cell.x, y: cell.y });
    };
    q<HTMLFormElement>('on-join-form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.join(this.els.name.value, this.els.server.value.trim());
    });
    q<HTMLFormElement>('on-chat-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const text = this.els.input.value.trim();
      this.els.input.value = '';
      if (text) this.socket?.send({ t: 'chat', text });
      else this.els.input.blur();
    });
    this.els.run.addEventListener('click', () => this.toggleRun());
    document.addEventListener('keydown', (event) => {
      if (this.els.join.hidden === false) return;
      const typing = document.activeElement === this.els.input;
      if (event.key === 'Enter' && !typing) {
        event.preventDefault();
        this.els.input.focus();
      } else if (event.key === 'Escape' && typing) {
        this.els.input.blur();
      } else if ((event.key === 'r' || event.key === 'R') && !typing) {
        this.toggleRun();
      }
    });
    window.addEventListener('beforeunload', () => this.socket?.close());
    (savedName ? this.els.joinButton : this.els.name).focus();
    const loop = (now: number) => {
      this.scene.frame(now);
      this.refreshBar();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private join(rawName: string, serverUrl: string): void {
    const name = normalizeName(rawName);
    if (!name) {
      this.showError(`A name is ${LIMITS.NAME_MIN} to ${LIMITS.NAME_MAX} characters: letters, digits and spaces, starting with a letter.`);
      return;
    }
    if (!/^wss?:\/\//.test(serverUrl)) {
      this.showError('The server address must start with ws:// or wss://.');
      return;
    }
    write(localStorage, NAME_KEY, name);
    const session = readSession();
    const token = session && session.name.toLowerCase() === name.toLowerCase() ? session.token : null;
    this.socket?.close();
    this.socket = new GameSocket(serverUrl, name, token, {
      onMessage: (msg, now) => this.onMessage(msg, now),
      onStatus: (kind, detail) => this.onStatus(kind, detail),
    });
    this.showError('');
    this.els.joinButton.disabled = true;
    this.els.joinButton.textContent = 'Connecting';
    this.socket.connect();
  }

  private onMessage(msg: ServerMessage, now: number): void {
    if (msg.t === 'welcome') {
      write(sessionStorage, SESSION_KEY, JSON.stringify({ name: this.replicaNameFor(msg), token: msg.token } satisfies Session));
      if (this.content.hasZone(msg.zone)) {
        this.scene.setMap(this.content.map(msg.zone));
        this.els.zone.textContent = this.content.zone(msg.zone).name;
      }
      this.els.join.hidden = true;
      this.els.chat.hidden = false;
      this.running = false;
      this.els.run.textContent = 'Walking';
      if (!this.pingTimer) this.pingTimer = setInterval(() => this.socket?.send({ t: 'ping', at: performance.now() }), PING_MS);
    } else if (msg.t === 'pong') {
      this.rtt = Math.round(performance.now() - msg.at);
      return;
    } else if (msg.t === 'reject') {
      this.socket = null;
      this.els.join.hidden = false;
      this.els.chat.hidden = true;
      this.els.joinButton.disabled = false;
      this.els.joinButton.textContent = 'Enter the world';
      this.showError(msg.reason);
      return;
    }
    this.replica.apply(msg, now);
    if (msg.t === 'tick' && msg.chat.length > 0) this.appendChat();
  }

  private replicaNameFor(msg: Extract<ServerMessage, { t: 'welcome' }>): string {
    return msg.entities.find((e) => e.id === msg.id)?.name ?? this.els.name.value;
  }

  private onStatus(kind: SocketStatus, detail: string): void {
    this.status = { kind, detail };
    if (kind === 'closed' && this.els.join.hidden === false) {
      this.els.joinButton.disabled = false;
      this.els.joinButton.textContent = 'Enter the world';
      this.showError(`Could not connect: ${detail}. Is the server running?`);
    }
  }

  private toggleRun(): void {
    if (!this.socket?.connected) return;
    this.running = !this.running;
    this.els.run.textContent = this.running ? 'Running' : 'Walking';
    this.socket.send({ t: 'run', on: this.running });
  }

  private appendChat(): void {
    const lines = this.replica.chat;
    const from = this.lastChatLine ? lines.indexOf(this.lastChatLine as never) + 1 : 0;
    for (const line of lines.slice(from)) {
      const el = document.createElement('div');
      el.className = 'chat-line';
      el.innerHTML = `<b>${escapeHtml(line.name)}</b> ${escapeHtml(line.text)}`;
      this.els.log.appendChild(el);
    }
    while (this.els.log.children.length > 60) this.els.log.firstElementChild?.remove();
    this.lastChatLine = lines[lines.length - 1] ?? null;
    this.els.log.scrollTop = this.els.log.scrollHeight;
  }

  private refreshBar(): void {
    const status = this.status.kind === 'open' ? 'Connected' : this.status.kind === 'connecting' ? this.status.detail : this.status.kind === 'rejected' ? 'Refused' : 'Offline';
    if (this.els.status.textContent !== status) {
      this.els.status.textContent = status;
      this.els.status.className = `chip ${this.status.kind === 'open' ? 'chip-ok' : this.status.kind === 'connecting' ? 'chip-warn' : 'chip-bad'}`;
    }
    const n = this.replica.entities.size;
    const count = this.status.kind === 'open' ? `${n} ${n === 1 ? 'player' : 'players'} here` : '';
    if (this.els.count.textContent !== count) this.els.count.textContent = count;
    const tick = this.status.kind === 'open' ? `tick ${this.replica.tick} · ${this.replica.tickMs} ms${this.rtt !== null ? ` · ping ${this.rtt} ms` : ''}` : '';
    if (this.els.tick.textContent !== tick) this.els.tick.textContent = tick;
  }

  private showError(text: string): void {
    this.els.error.textContent = text;
  }
}

function read(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function write(store: Storage, key: string, value: string): void {
  try {
    store.setItem(key, value);
  } catch {
    /* storage may be unavailable; the game still works */
  }
}

function readSession(): Session | null {
  const raw = read(sessionStorage, SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && typeof (parsed as Session).name === 'string' && typeof (parsed as Session).token === 'string') return parsed as Session;
  } catch {
    /* fall through */
  }
  return null;
}
