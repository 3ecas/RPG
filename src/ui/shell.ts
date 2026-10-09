/**
 * The page: a top bar with the zone, the connection and who is here, the
 * world canvas, a side panel with the bag and the skills, a docked chat, the
 * bank window, menus for slots and for what you click on, and the join card
 * that asks for a name and knows where the server is. Keeps the browser's
 * secret, which is what ties a character to this browser until there are
 * accounts. Wires the socket to the replica and the replica to the scene;
 * decides what a click means and nothing else.
 */
import { Replica } from '@/client/replica';
import { GameSocket, type SocketStatus } from '@/client/socket';
import { LIMITS, normalizeName, type ServerMessage } from '@/net/protocol';
import type { GatherNodeDef, ItemDef, ZoneMapDef } from '@/types/content';
import type { ItemId, NodeId, SkillId, ZoneId } from '@/types/ids';
import { type Cell, type Grid, objectAt, parseMap } from '@/world/grid';
import { progressOf } from '@/world/skills';
import { escapeHtml } from './html';
import { ITEM_COLORS, OnlineScene, type SceneContent } from './scene';

export interface OnlineContent extends SceneContent {
  map(id: ZoneId): ZoneMapDef;
  hasZone(id: string): id is ZoneId;
  item(id: ItemId): ItemDef;
  node(id: NodeId): GatherNodeDef;
  skill(id: SkillId): { name: string; description: string };
  readonly skillIds: SkillId[];
}

export interface OnlineConfig {
  /** Where the game server is; empty when this page was built without one and the URL names none. */
  serverUrl: string;
}

const NAME_KEY = 'rpg.online.name';
/** Made up once per browser and never shown: the characters made here answer to it. */
const SECRET_KEY = 'rpg.online.secret';
/** Per tab, so two tabs in one browser are two characters. */
const SESSION_KEY = 'rpg.online.session';
const PING_MS = 5000;
const NO_SERVER_HINT = 'This page was built without a server address. Run a server (the README says how) and paste its address here, or set the SERVER_URL repository variable so the page knows it.';
/** What you do to a gather node, by skill. */
const VERBS: Partial<Record<SkillId, string>> = { woodcutting: 'Chop', mining: 'Mine', fishing: 'Fish', farming: 'Harvest', harvesting: 'Pick' };

interface Session {
  name: string;
  token: string;
}

/** One line of a menu. */
interface Option {
  label: string;
  run: () => void;
  /** Whether a left click on the world does this one; the first such option wins. */
  primary?: boolean;
}

export class OnlineApp {
  private readonly replica = new Replica();
  private readonly scene: OnlineScene;
  private socket: GameSocket | null = null;
  private status: { kind: SocketStatus; detail: string } = { kind: 'closed', detail: 'Not connected' };
  private grid: Grid | null = null;
  /** The run toggle (R); Shift held runs as well. */
  private runToggled = false;
  private shiftHeld = false;
  private running = false;
  private rtt: number | null = null;
  private lastChatLine: unknown = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private shownVersion = -1;
  private els!: {
    zone: HTMLElement; status: HTMLElement; count: HTMLElement; tick: HTMLElement; run: HTMLButtonElement;
    stage: HTMLElement; world: HTMLElement; side: HTMLElement; bag: HTMLElement; skills: HTMLElement; tabBag: HTMLButtonElement; tabSkills: HTMLButtonElement;
    chat: HTMLElement; log: HTMLElement; input: HTMLInputElement; menu: HTMLElement; bank: HTMLElement; bankList: HTMLElement;
    join: HTMLElement; name: HTMLInputElement; server: HTMLInputElement; hint: HTMLElement; error: HTMLElement; joinButton: HTMLButtonElement;
  };

  constructor(private readonly root: HTMLElement, private readonly content: OnlineContent, private readonly config: OnlineConfig) {
    this.scene = new OnlineScene(content, this.replica);
  }

  mount(): void {
    const savedName = read(localStorage, NAME_KEY) ?? '';
    this.root.innerHTML =
      '<header class="topbar"><span class="brand">Greenhollow Online</span>' +
      '<span class="chips"><span class="chip" id="on-zone">No zone yet</span><span class="chip" id="on-status">Not connected</span><span class="chip" id="on-count"></span></span>' +
      '<span class="right"><button class="menu-btn" id="on-run" type="button" title="Toggle running (R); Shift runs while held">Walking</button><span class="muted" id="on-tick"></span></span></header>' +
      '<main class="stage" id="on-stage"><div class="world" id="on-world"></div>' +
      '<aside class="side" id="on-side" hidden><div class="tabs"><button class="tab tab-on" id="on-tab-bag" type="button">Bag</button><button class="tab" id="on-tab-skills" type="button">Skills</button></div>' +
      '<div class="bag" id="on-bag"></div><div class="skills" id="on-skills" hidden></div></aside>' +
      '<div class="menu" id="on-menu" hidden></div>' +
      '<div class="window" id="on-bank" hidden><div class="window-head"><span>Bank</span><button class="menu-btn" id="on-bank-all" type="button">Deposit all</button><button class="menu-btn" id="on-bank-close" type="button" title="Close">&times;</button></div><div class="window-body" id="on-bank-list"></div></div>' +
      '<div class="chatbox" id="on-chat" hidden><div class="chat-log" id="on-log"></div><form class="chat-form" id="on-chat-form"><input id="on-chat-input" type="text" autocomplete="off" maxlength="' + LIMITS.CHAT_MAX + '" placeholder="Press Enter to talk"></form></div>' +
      '<div class="join" id="on-join"><form class="join-card" id="on-join-form"><h1>Greenhollow Online</h1><p class="muted">Walk the world with whoever is here, chop trees, fill your bag, bank the logs, and talk. Click where you want to go or on what you want to use; right-click for choices; hold Shift to run; Enter to talk. Your character is saved under its name and comes back where you left it; until there are accounts, it answers only to this browser.</p>' +
      '<label>Name<input id="on-name" type="text" autocomplete="off" maxlength="' + LIMITS.NAME_MAX + '" value="' + escapeHtml(savedName) + '" placeholder="Letters, digits, spaces" required></label>' +
      '<label>Server<input id="on-server" type="text" autocomplete="off" value="' + escapeHtml(this.config.serverUrl) + '" placeholder="wss://your-server"></label>' +
      '<p class="join-hint" id="on-hint"' + (this.config.serverUrl ? ' hidden' : '') + '>' + escapeHtml(NO_SERVER_HINT) + '</p>' +
      '<div class="join-error" id="on-error"></div><button class="menu-btn join-button" id="on-join-button" type="submit">Enter the world</button></form></div></main>';
    const q = <T extends Element>(id: string) => this.root.querySelector<T>(`#${id}`)!;
    this.els = {
      zone: q('on-zone'), status: q('on-status'), count: q('on-count'), tick: q('on-tick'), run: q('on-run'),
      stage: q('on-stage'), world: q('on-world'), side: q('on-side'), bag: q('on-bag'), skills: q('on-skills'), tabBag: q('on-tab-bag'), tabSkills: q('on-tab-skills'),
      chat: q('on-chat'), log: q('on-log'), input: q('on-chat-input'), menu: q('on-menu'), bank: q('on-bank'), bankList: q('on-bank-list'),
      join: q('on-join'), name: q('on-name'), server: q('on-server'), hint: q('on-hint'), error: q('on-error'), joinButton: q('on-join-button'),
    };
    this.scene.mount(this.els.world);
    this.scene.onClick = (cell, button, screen) => this.onWorldClick(cell, button, screen);
    this.scene.labelAt = (cell) => this.optionsAt(cell).find((o) => o.primary)?.label ?? null;
    this.replica.onInput = (msg) => {
      this.socket?.send(msg);
    };
    this.replica.onNote = (text) => this.appendSystem(text);
    q<HTMLFormElement>('on-join-form').addEventListener('submit', (event) => {
      event.preventDefault();
      this.join(this.els.name.value, this.els.server.value.trim());
    });
    q<HTMLFormElement>('on-chat-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const line = this.els.input.value.trim();
      this.els.input.value = '';
      if (line) this.socket?.send({ t: 'chat', text: line });
      else this.els.input.blur();
    });
    this.els.run.addEventListener('click', () => this.toggleRun());
    this.els.tabBag.addEventListener('click', () => this.showTab('bag'));
    this.els.tabSkills.addEventListener('click', () => this.showTab('skills'));
    this.els.bag.addEventListener('click', (event) => {
      const slotEl = (event.target as HTMLElement).closest<HTMLElement>('[data-slot]');
      if (!slotEl) return;
      const rect = slotEl.getBoundingClientRect();
      this.openSlotMenu(Number(slotEl.dataset.slot), { x: rect.left, y: rect.bottom });
    });
    this.els.bag.addEventListener('contextmenu', (event) => event.preventDefault());
    q('on-bank-all').addEventListener('click', () => this.socket?.send({ t: 'bank', op: 'all' }));
    q('on-bank-close').addEventListener('click', () => this.closeBank());
    this.els.bankList.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-item]');
      if (!button) return;
      this.socket?.send({ t: 'bank', op: 'withdraw', item: button.dataset.item!, qty: Number(button.dataset.qty) });
    });
    this.els.menu.addEventListener('contextmenu', (event) => event.preventDefault());
    document.addEventListener('pointerdown', (event) => {
      if (!this.els.menu.hidden && !this.els.menu.contains(event.target as Node)) this.closeMenu();
    });
    document.addEventListener('keydown', (event) => {
      if (!this.els.join.hidden) return;
      const typing = document.activeElement === this.els.input;
      if (event.key === 'Shift') this.setShift(true);
      if (event.key === 'Escape') {
        if (!this.els.menu.hidden) this.closeMenu();
        else if (this.replica.bank !== null) this.closeBank();
        else if (typing) this.els.input.blur();
        return;
      }
      if (typing) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        this.els.input.focus();
      } else if (event.key === 'r' || event.key === 'R') {
        this.toggleRun();
      }
    });
    document.addEventListener('keyup', (event) => {
      if (event.key === 'Shift') this.setShift(false);
    });
    window.addEventListener('blur', () => this.setShift(false));
    window.addEventListener('beforeunload', () => this.socket?.close());
    (savedName && this.config.serverUrl ? this.els.joinButton : savedName ? this.els.server : this.els.name).focus();
    const loop = (now: number) => {
      if (this.socket?.connected) this.replica.update(now);
      this.scene.frame(now);
      this.refreshBar();
      if (this.replica.version !== this.shownVersion) this.renderPanels();
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
    if (!/^wss?:\/\/\S+$/.test(serverUrl)) {
      this.showError(serverUrl ? 'The server address must start with ws:// or wss://.' : 'Enter the address of a game server first.');
      this.els.hint.hidden = false;
      return;
    }
    if (location.protocol === 'https:' && serverUrl.startsWith('ws://')) {
      this.showError('This page is served over https, so the server address has to be wss://.');
      return;
    }
    write(localStorage, NAME_KEY, name);
    const session = readSession();
    const token = session && session.name.toLowerCase() === name.toLowerCase() ? session.token : null;
    this.socket?.close();
    this.socket = new GameSocket(serverUrl, name, browserSecret(), token, {
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
      const me = msg.entities.find((e) => e.id === msg.id);
      const name = me?.name ?? this.els.name.value;
      write(sessionStorage, SESSION_KEY, JSON.stringify({ name, token: msg.token } satisfies Session));
      const zoneName = this.showZone(msg.zone);
      this.els.join.hidden = true;
      this.els.chat.hidden = false;
      this.els.side.hidden = false;
      this.runToggled = false;
      this.applyRunning(true);
      if (!this.pingTimer) this.pingTimer = setInterval(() => this.socket?.send({ t: 'ping', at: performance.now() }), PING_MS);
      this.appendSystem(msg.resumed ? `Welcome back, ${name}. You are in ${zoneName}, where you left off.` : `Welcome, ${name}. You are in ${zoneName}. There is a hatchet in your bag and oaks to the west.`);
    } else if (msg.t === 'zone') {
      this.closeMenu();
      this.appendSystem(`You enter ${this.showZone(msg.zone)}.`);
    } else if (msg.t === 'pong') {
      this.rtt = Math.round(performance.now() - msg.at);
      return;
    } else if (msg.t === 'reject') {
      this.socket = null;
      this.els.join.hidden = false;
      this.els.chat.hidden = true;
      this.els.side.hidden = true;
      this.els.joinButton.disabled = false;
      this.els.joinButton.textContent = 'Enter the world';
      this.showError(msg.reason);
      return;
    }
    this.replica.apply(msg, now);
    if (msg.t === 'tick' && msg.chat.length > 0) this.appendChat();
  }

  /** Shows a zone: its map on the scene and in the prediction, its name in the top bar. Returns the name. */
  private showZone(zoneId: string): string {
    if (!this.content.hasZone(zoneId)) return zoneId;
    const map = this.content.map(zoneId);
    this.grid = parseMap(map);
    this.scene.setMap(this.grid, map.biome);
    this.replica.setGrid(this.grid);
    const name = this.content.zone(zoneId).name;
    this.els.zone.textContent = name;
    return name;
  }

  private onStatus(kind: SocketStatus, detail: string): void {
    this.status = { kind, detail };
    if (kind === 'closed' && !this.els.join.hidden) {
      this.els.joinButton.disabled = false;
      this.els.joinButton.textContent = 'Enter the world';
      this.showError(`Could not connect: ${detail}. Is the server running at that address?`);
    }
  }

  // ---- clicks on the world -----------------------------------------------------------

  /** A left click does the first thing worth doing at the cell, else walks there; a right click lists the choices. */
  private onWorldClick(cell: Cell, button: 'left' | 'right', screen: { x: number; y: number }): void {
    this.closeMenu();
    const options = this.optionsAt(cell);
    if (button === 'right') {
      this.openMenu(options, screen);
      return;
    }
    (options.find((o) => o.primary) ?? options[options.length - 1])!.run();
  }

  /** Everything one could do at a cell, in the order a menu shows them; "Walk here" is always last. */
  private optionsAt(cell: Cell): Option[] {
    const options: Option[] = [];
    const use = () => {
      this.scene.mark(cell);
      this.replica.use(cell);
    };
    for (const item of this.replica.items.values()) {
      if (item.x !== cell.x || item.y !== cell.y || !this.content.hasItem(item.item)) continue;
      const def = this.content.item(item.item);
      options.push({ label: `Take ${def.name}${item.qty > 1 ? ` (${item.qty})` : ''}`, run: use, primary: true });
    }
    const obj = this.grid ? objectAt(this.grid, cell.x, cell.y) : null;
    if (obj) {
      const def = obj.def;
      if (def.kind === 'node') {
        const node = this.content.node(def.id);
        const spent = this.replica.depleted.has(obj.index);
        options.push({ label: `${VERBS[node.skill] ?? 'Gather'} ${node.name}${spent ? ' (nothing left)' : ''}`, run: use, primary: true });
        options.push({ label: `Examine ${node.name}`, run: () => this.appendSystem(node.description) });
      } else if (def.kind === 'bank') {
        options.push({ label: 'Use Bank', run: use, primary: true });
      } else if (def.kind === 'npc') {
        options.push({ label: `Examine ${this.content.npc(def.id).name}`, run: () => this.appendSystem(`${this.content.npc(def.id).name} has nothing to say to you yet.`) });
      }
    }
    for (const item of this.replica.items.values()) {
      if (item.x !== cell.x || item.y !== cell.y || !this.content.hasItem(item.item)) continue;
      const def = this.content.item(item.item);
      options.push({ label: `Examine ${def.name}`, run: () => this.appendSystem(def.description) });
    }
    options.push({
      label: 'Walk here',
      run: () => {
        this.scene.mark(cell);
        this.replica.walkTo(cell);
      },
    });
    return options;
  }

  private openSlotMenu(slot: number, at: { x: number; y: number }): void {
    const entry = this.replica.bag[slot];
    if (!entry || !this.content.hasItem(entry[0])) return;
    const def = this.content.item(entry[0]);
    const options: Option[] = [];
    if (this.replica.bank !== null) options.push({ label: `Deposit ${def.name}`, run: () => this.socket?.send({ t: 'bank', op: 'deposit', slot, qty: entry[1] }) });
    options.push({ label: `Drop ${def.name}`, run: () => this.socket?.send({ t: 'drop', slot }) });
    options.push({ label: `Examine ${def.name}`, run: () => this.appendSystem(def.description) });
    this.openMenu(options, at);
  }

  private openMenu(options: Option[], at: { x: number; y: number }): void {
    const menu = this.els.menu;
    menu.innerHTML = '';
    options.forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = option.label;
      button.addEventListener('click', () => {
        this.closeMenu();
        option.run();
      });
      menu.appendChild(button);
    });
    menu.hidden = false;
    const stage = this.els.stage.getBoundingClientRect();
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    menu.style.left = `${Math.max(0, Math.min(stage.width - width, at.x - stage.left))}px`;
    menu.style.top = `${Math.max(0, Math.min(stage.height - height, at.y - stage.top))}px`;
  }

  private closeMenu(): void {
    this.els.menu.hidden = true;
  }

  private closeBank(): void {
    this.socket?.send({ t: 'bank', op: 'close' });
    this.replica.bank = null;
    this.replica.version++;
  }

  // ---- panels ---------------------------------------------------------------------

  private showTab(tab: 'bag' | 'skills'): void {
    this.els.bag.hidden = tab !== 'bag';
    this.els.skills.hidden = tab !== 'skills';
    this.els.tabBag.className = tab === 'bag' ? 'tab tab-on' : 'tab';
    this.els.tabSkills.className = tab === 'skills' ? 'tab tab-on' : 'tab';
  }

  private renderPanels(): void {
    this.shownVersion = this.replica.version;
    this.renderBag();
    this.renderSkills();
    this.renderBank();
  }

  private renderBag(): void {
    const slots = this.replica.bag;
    let html = '';
    for (let i = 0; i < Math.max(28, slots.length); i++) {
      const entry = slots[i];
      if (!entry || !this.content.hasItem(entry[0])) {
        html += `<div class="slot" data-slot="${i}"></div>`;
        continue;
      }
      const def = this.content.item(entry[0]);
      html += `<div class="slot slot-full" data-slot="${i}" title="${escapeHtml(def.name)}"><span class="icon" style="background:${ITEM_COLORS[def.group]}">${escapeHtml(initials(def.name))}</span>${entry[1] > 1 ? `<span class="qty">${entry[1]}</span>` : ''}</div>`;
    }
    const used = slots.filter((s) => s !== null).length;
    this.els.bag.innerHTML = html + `<div class="bag-foot muted">${used} / ${slots.length || 28} slots</div>`;
  }

  private renderSkills(): void {
    let html = '';
    for (const id of this.content.skillIds) {
      const xp = this.replica.skills.get(id) ?? 0;
      const { level, into, span } = progressOf(xp);
      const pct = span > 0 ? Math.round((into / span) * 100) : 100;
      html += `<div class="skill-row" title="${xp.toLocaleString()} xp${span > 0 ? `, ${(span - into).toLocaleString()} to level ${level + 1}` : ''}"><span class="skill-name">${escapeHtml(this.content.skill(id).name)}</span><span class="skill-level">${level}</span><span class="bar"><span class="bar-fill" style="width:${pct}%"></span></span></div>`;
    }
    this.els.skills.innerHTML = html;
  }

  private renderBank(): void {
    const bank = this.replica.bank;
    this.els.bank.hidden = bank === null;
    if (bank === null) return;
    if (bank.length === 0) {
      this.els.bankList.innerHTML = '<p class="muted">Nothing in the bank yet. Click a bag slot to deposit it, or deposit all.</p>';
      return;
    }
    let html = '';
    for (const [item, qty] of bank) {
      if (!this.content.hasItem(item)) continue;
      const def = this.content.item(item);
      html += `<div class="stack"><span class="icon" style="background:${ITEM_COLORS[def.group]}">${escapeHtml(initials(def.name))}</span><span class="stack-name">${escapeHtml(def.name)}</span><span class="stack-qty">${qty}</span>` +
        `<span class="stack-buttons"><button class="menu-btn" type="button" data-item="${item}" data-qty="1">1</button><button class="menu-btn" type="button" data-item="${item}" data-qty="5">5</button><button class="menu-btn" type="button" data-item="${item}" data-qty="${qty}">All</button></span></div>`;
    }
    this.els.bankList.innerHTML = html;
  }

  private toggleRun(): void {
    this.runToggled = !this.runToggled;
    this.applyRunning();
  }

  private setShift(down: boolean): void {
    if (this.shiftHeld === down) return;
    this.shiftHeld = down;
    this.applyRunning();
  }

  /** Running is the toggle or Shift held; the server and the prediction learn of a change together. */
  private applyRunning(force = false): void {
    const running = this.runToggled || this.shiftHeld;
    if (running === this.running && !force) return;
    this.running = running;
    this.els.run.textContent = running ? 'Running' : 'Walking';
    this.replica.setRunning(running);
    this.socket?.send({ t: 'run', on: running });
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
    this.lastChatLine = lines[lines.length - 1] ?? null;
    this.trimLog();
  }

  /** A line from the game itself in the chat log: where you are, what just happened. */
  private appendSystem(text: string): void {
    const el = document.createElement('div');
    el.className = 'chat-line chat-system';
    el.textContent = text;
    this.els.log.appendChild(el);
    this.trimLog();
  }

  private trimLog(): void {
    while (this.els.log.children.length > 60) this.els.log.firstElementChild?.remove();
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

  private showError(message: string): void {
    this.els.error.textContent = message;
  }
}

/** "Bronze Hatchet" becomes "BH": enough to tell slots apart until there are icons. */
function initials(name: string): string {
  return name.split(' ').map((w) => w.charAt(0)).join('').slice(0, 3).toUpperCase();
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

/** The secret this browser sends with its name: made once, kept in localStorage. Without storage it lasts one page load. */
function browserSecret(): string {
  const kept = read(localStorage, SECRET_KEY);
  if (kept && /^[A-Za-z0-9_-]{16,64}$/.test(kept)) return kept;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const secret = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  write(localStorage, SECRET_KEY, secret);
  return secret;
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
