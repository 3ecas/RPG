/**
 * The page: a top bar with the zone, the connection and who is here; the
 * world canvas; a draggable menu bar; windows you can drag, resize and close
 * for the inventory, your gear and numbers, the journal, the skills, the
 * settings, the map and the bank; a docked chat; menus for slots and for
 * what you click on; and the join card that asks for a name and knows where
 * the server is. Keeps the browser's secret, which is what ties a character
 * to this browser until there are accounts. Wires the socket to the replica
 * and the replica to the scene; decides what a click means and nothing else.
 */
import { Replica } from '@/client/replica';
import { GameSocket, type SocketStatus } from '@/client/socket';
import { LIMITS, normalizeName, type ServerMessage } from '@/net/protocol';
import type { GatherNodeDef, ItemDef, MonsterDef, QuestDef, SkillUnlock, ZoneMapDef } from '@/types/content';
import { EQUIP_SLOTS, type EquipSlot, type ItemId, type MonsterId, type NodeId, type QuestId, type SkillId, type ZoneId } from '@/types/ids';
import { type Cell, type Grid, objectAt, parseMap } from '@/world/grid';
import { progressOf } from '@/world/skills';
import { SLOT_NAMES } from '@/world/stats';
import { escapeHtml } from './html';
import { Minimap } from './minimap';
import { ITEM_COLORS, OnlineScene, type SceneContent } from './scene';
import { Windows } from './windows';

export interface OnlineContent extends SceneContent {
  map(id: ZoneId): ZoneMapDef;
  hasZone(id: string): id is ZoneId;
  item(id: ItemId): ItemDef;
  node(id: NodeId): GatherNodeDef;
  skill(id: SkillId): { name: string; description: string };
  unlocks(id: SkillId): readonly SkillUnlock[];
  quest(id: QuestId): QuestDef;
  monster(id: MonsterId): MonsterDef;
  readonly skillIds: SkillId[];
  readonly itemIds: ItemId[];
  readonly questIds: QuestId[];
  readonly monsterIds: MonsterId[];
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
const LAYOUT_KEY = 'rpg.online.layout';
const PING_MS = 5000;
const NO_SERVER_HINT = 'This page was built without a server address. Run a server (the README says how) and paste its address here, or set the SERVER_URL repository variable so the page knows it.';
/** What you do to a gather node, by skill. */
const VERBS: Partial<Record<SkillId, string>> = { lumberjack: 'Chop', mining: 'Mine', fishing: 'Fish', harvesting: 'Harvest' };
/** The windows on the menu bar, with their hotkeys. */
const PANELS: { id: string; title: string; key: string }[] = [
  { id: 'inventory', title: 'Inventory', key: 'i' },
  { id: 'gear', title: 'Gear', key: 'g' },
  { id: 'journal', title: 'Journal', key: 'j' },
  { id: 'skills', title: 'Skills', key: 'k' },
  { id: 'map', title: 'Map', key: 'm' },
  { id: 'settings', title: 'Settings', key: 'o' },
];
/** The gear window's layout: three columns, the body down the middle. */
const GEAR_LAYOUT: (EquipSlot | null)[] = [null, 'head', null, 'trinket_1', 'body', 'trinket_2', 'main_hand', 'legs', 'off_hand', 'hands', 'feet', null];
const JOURNAL_TABS = ['Quests', 'Log', 'Bestiary', 'Items'] as const;
type JournalTab = (typeof JOURNAL_TABS)[number];

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
  private windows!: Windows;
  private minimap!: Minimap;
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
  private skillShown: SkillId | null = null;
  private journalTab: JournalTab = 'Quests';
  private itemFilter = '';
  private readonly log: { when: string; text: string }[] = [];
  private els!: {
    zone: HTMLElement; status: HTMLElement; count: HTMLElement; tick: HTMLElement; run: HTMLButtonElement;
    stage: HTMLElement; world: HTMLElement; menubar: HTMLElement; chat: HTMLElement; chatLog: HTMLElement; input: HTMLInputElement; menu: HTMLElement;
    join: HTMLElement; name: HTMLInputElement; server: HTMLInputElement; hint: HTMLElement; error: HTMLElement; joinButton: HTMLButtonElement;
  };
  private bodies!: Record<string, HTMLElement>;

  constructor(private readonly root: HTMLElement, private readonly content: OnlineContent, private readonly config: OnlineConfig) {
    this.scene = new OnlineScene(content, this.replica);
  }

  mount(): void {
    const savedName = read(localStorage, NAME_KEY) ?? '';
    this.root.innerHTML =
      '<header class="topbar"><span class="brand">Greenhollow Online</span>' +
      '<span class="chips"><span class="chip" id="on-zone">No zone yet</span><span class="chip" id="on-status">Not connected</span><span class="chip" id="on-count"></span></span>' +
      '<span class="right"><button class="menu-btn" id="on-run" type="button" title="Toggle running (R); Shift runs while held">Walking</button><span class="muted" id="on-tick"></span></span></header>' +
      '<main class="stage stage-closed" id="on-stage"><div class="world" id="on-world"></div>' +
      '<nav class="menubar" id="on-menubar"><span class="grip" title="Drag the menu bar">&#8942;&#8942;</span>' + PANELS.map((p) => `<button type="button" data-win="${p.id}" title="${p.title} (${p.key.toUpperCase()})">${p.title}</button>`).join('') + '</nav>' +
      '<div class="menu" id="on-menu" hidden></div>' +
      '<div class="chatbox" id="on-chat" hidden><div class="chat-log" id="on-log"></div><form class="chat-form" id="on-chat-form"><input id="on-chat-input" type="text" autocomplete="off" maxlength="' + LIMITS.CHAT_MAX + '" placeholder="Press Enter to talk"></form></div>' +
      '<div class="join" id="on-join"><form class="join-card" id="on-join-form"><h1>Greenhollow Online</h1><p class="muted">Walk the world with whoever is here, chop trees, fill your bag, bank the logs, wear what you find, and talk. Click where you want to go or on what you want to use; right-click for choices; Space stops you; Shift runs; Enter talks. The menu bar opens your inventory, gear, journal, skills, map and settings; drag any window where you like. Your character is saved under its name and comes back where you left it; until there are accounts, it answers only to this browser.</p>' +
      '<label>Name<input id="on-name" type="text" autocomplete="off" maxlength="' + LIMITS.NAME_MAX + '" value="' + escapeHtml(savedName) + '" placeholder="Letters, digits, spaces" required></label>' +
      '<label>Server<input id="on-server" type="text" autocomplete="off" value="' + escapeHtml(this.config.serverUrl) + '" placeholder="wss://your-server"></label>' +
      '<p class="join-hint" id="on-hint"' + (this.config.serverUrl ? ' hidden' : '') + '>' + escapeHtml(NO_SERVER_HINT) + '</p>' +
      '<div class="join-error" id="on-error"></div><button class="menu-btn join-button" id="on-join-button" type="submit">Enter the world</button></form></div></main>';
    const q = <T extends Element>(id: string) => this.root.querySelector<T>(`#${id}`)!;
    this.els = {
      zone: q('on-zone'), status: q('on-status'), count: q('on-count'), tick: q('on-tick'), run: q('on-run'),
      stage: q('on-stage'), world: q('on-world'), menubar: q('on-menubar'), chat: q('on-chat'), chatLog: q('on-log'), input: q('on-chat-input'), menu: q('on-menu'),
      join: q('on-join'), name: q('on-name'), server: q('on-server'), hint: q('on-hint'), error: q('on-error'), joinButton: q('on-join-button'),
    };
    this.scene.mount(this.els.world);
    this.scene.onClick = (cell, button, screen) => this.onWorldClick(cell, button, screen);
    this.scene.labelAt = (cell) => this.optionsAt(cell).find((o) => o.primary)?.label ?? null;
    this.replica.onInput = (msg) => {
      this.socket?.send(msg);
    };
    this.replica.onNote = (text) => this.appendSystem(text);
    this.mountWindows();
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
    this.els.menu.addEventListener('contextmenu', (event) => event.preventDefault());
    document.addEventListener('pointerdown', (event) => {
      if (!this.els.menu.hidden && !this.els.menu.contains(event.target as Node)) this.closeMenu();
    });
    document.addEventListener('keydown', (event) => this.onKey(event));
    document.addEventListener('keyup', (event) => {
      if (event.key === 'Shift') this.setShift(false);
    });
    window.addEventListener('blur', () => this.setShift(false));
    window.addEventListener('beforeunload', () => this.socket?.close());
    (savedName && this.config.serverUrl ? this.els.joinButton : savedName ? this.els.server : this.els.name).focus();
    const loop = (now: number) => {
      if (this.socket?.connected) this.replica.update(now);
      this.scene.frame(now);
      if (this.windows.isOpen('map')) this.minimap.frame(now);
      this.refreshBar();
      if (this.replica.version !== this.shownVersion) this.renderPanels();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** The windows, where they were last left or at their defaults, and the menu bar. */
  private mountWindows(): void {
    const stage = this.els.stage;
    const W = Math.max(stage.clientWidth, 800);
    const H = Math.max(stage.clientHeight, 500);
    this.windows = new Windows(stage, LAYOUT_KEY);
    this.bodies = {
      map: this.windows.add({ id: 'map', title: 'Map', x: W - 236, y: 8, w: 228, h: 160, open: true }),
      inventory: this.windows.add({ id: 'inventory', title: 'Inventory', x: W - 236, y: 176, w: 228, h: 330, open: true }),
      gear: this.windows.add({ id: 'gear', title: 'Gear', x: W - 486, y: 176, w: 242, h: 380, open: false }),
      skills: this.windows.add({ id: 'skills', title: 'Skills', x: 12, y: 12, w: 270, h: 440, open: false }),
      journal: this.windows.add({ id: 'journal', title: 'Journal', x: 296, y: 12, w: 380, h: 440, open: false }),
      settings: this.windows.add({ id: 'settings', title: 'Settings', x: Math.round(W / 2 - 150), y: Math.round(H / 2 - 150), w: 300, h: 300, open: false }),
      bank: this.windows.add({ id: 'bank', title: 'Bank', x: Math.round(W / 2 - 190), y: Math.round(H / 2 - 170), w: 380, h: 340, open: false }),
    };
    this.windows.addBar('menubar', this.els.menubar, this.els.menubar.querySelector('.grip')!, W - 470, H - 44);
    this.windows.onToggle = (id, open) => {
      this.els.menubar.querySelector(`[data-win="${id}"]`)?.classList.toggle('on', open);
      if (id === 'bank' && !open && this.replica.bank !== null) this.closeBank();
      if (open && id === 'journal') this.renderJournal();
      if (open && id === 'skills') this.renderSkills();
    };
    for (const panel of PANELS) this.els.menubar.querySelector(`[data-win="${panel.id}"]`)!.classList.toggle('on', this.windows.isOpen(panel.id));
    this.els.menubar.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-win]');
      if (button) this.windows.toggle(button.dataset.win!);
    });
    this.minimap = new Minimap(this.bodies.map!, this.replica, () => this.scene.viewCells());
    // Inventory and gear: a click on a slot offers what can be done with it.
    this.bodies.inventory!.addEventListener('click', (event) => {
      const slotEl = (event.target as HTMLElement).closest<HTMLElement>('[data-slot]');
      if (!slotEl) return;
      const rect = slotEl.getBoundingClientRect();
      this.openSlotMenu(Number(slotEl.dataset.slot), { x: rect.left, y: rect.bottom });
    });
    this.bodies.gear!.addEventListener('click', (event) => {
      const slotEl = (event.target as HTMLElement).closest<HTMLElement>('[data-gslot]');
      if (!slotEl) return;
      const rect = slotEl.getBoundingClientRect();
      this.openGearMenu(slotEl.dataset.gslot as EquipSlot, { x: rect.left, y: rect.bottom });
    });
    for (const body of [this.bodies.inventory!, this.bodies.gear!]) body.addEventListener('contextmenu', (event) => event.preventDefault());
    // The bank: a toolbar and the stacks.
    this.bodies.bank!.innerHTML = '<div class="toolbar"><button class="menu-btn" id="on-bank-all" type="button">Deposit all</button><span class="muted">Click a bag slot to deposit it.</span></div><div id="on-bank-list" class="stacks"></div>';
    this.bodies.bank!.querySelector('#on-bank-all')!.addEventListener('click', () => this.socket?.send({ t: 'bank', op: 'all' }));
    this.bodies.bank!.querySelector('#on-bank-list')!.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-item]');
      if (!button) return;
      this.socket?.send({ t: 'bank', op: 'withdraw', item: button.dataset.item!, qty: Number(button.dataset.qty) });
    });
    // Skills: a row opens the skill; Back returns.
    this.bodies.skills!.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-back]')) this.skillShown = null;
      else {
        const row = target.closest<HTMLElement>('[data-skill]');
        if (!row) return;
        this.skillShown = row.dataset.skill as SkillId;
      }
      this.renderSkills();
    });
    // Journal: tabs and the item filter.
    this.bodies.journal!.addEventListener('click', (event) => {
      const tab = (event.target as HTMLElement).closest<HTMLElement>('[data-jtab]');
      if (!tab) return;
      this.journalTab = tab.dataset.jtab as JournalTab;
      this.renderJournal();
    });
    this.bodies.journal!.addEventListener('input', (event) => {
      const input = event.target as HTMLInputElement;
      if (input.id !== 'on-item-filter') return;
      this.itemFilter = input.value.trim().toLowerCase();
      const list = this.bodies.journal!.querySelector<HTMLElement>('#on-item-list');
      if (list) list.innerHTML = this.itemsHtml();
    });
    this.renderSettings();
  }

  private onKey(event: KeyboardEvent): void {
    if (!this.els.join.hidden) return;
    const typing = document.activeElement === this.els.input || (document.activeElement instanceof HTMLInputElement && document.activeElement !== this.els.name);
    if (event.key === 'Shift') this.setShift(true);
    if (event.key === 'Escape') {
      if (!this.els.menu.hidden) this.closeMenu();
      else if (this.replica.bank !== null) this.closeBank();
      else if (typing) (document.activeElement as HTMLElement).blur();
      return;
    }
    if (typing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.els.input.focus();
    } else if (event.key === ' ') {
      event.preventDefault();
      this.replica.stop();
    } else if (event.key === 'r' || event.key === 'R') {
      this.toggleRun();
    } else {
      const panel = PANELS.find((p) => p.key === event.key.toLowerCase());
      if (panel && !event.ctrlKey && !event.metaKey && !event.altKey) this.windows.toggle(panel.id);
    }
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

  /** Back to the join card, with nothing of the world showing. */
  private leave(reason: string): void {
    this.socket?.close();
    this.socket = null;
    this.els.join.hidden = false;
    this.els.chat.hidden = true;
    this.els.stage.classList.add('stage-closed');
    this.closeMenu();
    this.els.joinButton.disabled = false;
    this.els.joinButton.textContent = 'Enter the world';
    this.showError(reason);
  }

  private onMessage(msg: ServerMessage, now: number): void {
    if (msg.t === 'welcome') {
      const me = msg.entities.find((e) => e.id === msg.id);
      const name = me?.name ?? this.els.name.value;
      write(sessionStorage, SESSION_KEY, JSON.stringify({ name, token: msg.token } satisfies Session));
      const zoneName = this.showZone(msg.zone);
      this.els.join.hidden = true;
      this.els.chat.hidden = false;
      this.els.stage.classList.remove('stage-closed');
      this.windows.layout();
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
      this.leave(msg.reason);
      return;
    }
    this.replica.apply(msg, now);
    if (msg.t === 'tick' && msg.chat.length > 0) this.appendChat();
  }

  /** Shows a zone: its map on the scene, the minimap and the prediction, its name in the top bar. Returns the name. */
  private showZone(zoneId: string): string {
    if (!this.content.hasZone(zoneId)) return zoneId;
    const map = this.content.map(zoneId);
    this.grid = parseMap(map);
    this.scene.setMap(this.grid, map.biome);
    this.minimap.setMap(this.grid, map.biome);
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
    if (def.equip) options.push({ label: `${def.equip.kind === 'weapon' || def.equip.kind === 'book' ? 'Wield' : 'Wear'} ${def.name}`, run: () => this.socket?.send({ t: 'equip', slot }) });
    if (this.replica.bank !== null) options.push({ label: `Deposit ${def.name}`, run: () => this.socket?.send({ t: 'bank', op: 'deposit', slot, qty: entry[1] }) });
    options.push({ label: `Drop ${def.name}`, run: () => this.socket?.send({ t: 'drop', slot }) });
    options.push({ label: `Examine ${def.name}`, run: () => this.appendSystem(describe(def)) });
    this.openMenu(options, at);
  }

  private openGearMenu(slot: EquipSlot, at: { x: number; y: number }): void {
    const worn = this.replica.gear.find((g) => g[0] === slot);
    if (!worn || !this.content.hasItem(worn[1])) return;
    const def = this.content.item(worn[1]);
    this.openMenu([
      { label: `Remove ${def.name}`, run: () => this.socket?.send({ t: 'unequip', slot }) },
      { label: `Examine ${def.name}`, run: () => this.appendSystem(describe(def)) },
    ], at);
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
    menu.style.left = `${Math.max(0, Math.min(stage.width - menu.offsetWidth, at.x - stage.left))}px`;
    menu.style.top = `${Math.max(0, Math.min(stage.height - menu.offsetHeight, at.y - stage.top))}px`;
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

  private renderPanels(): void {
    this.shownVersion = this.replica.version;
    this.renderBag();
    this.renderGear();
    if (this.windows.isOpen('skills')) this.renderSkills();
    this.renderBank();
  }

  private renderBag(): void {
    const slots = this.replica.bag;
    let html = '<div class="bag">';
    for (let i = 0; i < Math.max(28, slots.length); i++) {
      const entry = slots[i];
      if (!entry || !this.content.hasItem(entry[0])) {
        html += `<div class="slot" data-slot="${i}"></div>`;
        continue;
      }
      const def = this.content.item(entry[0]);
      html += `<div class="slot slot-full" data-slot="${i}" title="${escapeHtml(def.name)}">${icon(def)}${entry[1] > 1 ? `<span class="qty">${entry[1]}</span>` : ''}</div>`;
    }
    const used = slots.filter((s) => s !== null).length;
    this.bodies.inventory!.innerHTML = html + `</div><div class="bag-foot muted">${used} / ${slots.length || 28} slots</div>`;
  }

  private renderGear(): void {
    const worn = new Map(this.replica.gear.map((g) => [g[0], g[1]]));
    let html = '<div class="gear-grid">';
    for (const slot of GEAR_LAYOUT) {
      if (!slot) {
        html += '<div></div>';
        continue;
      }
      const item = worn.get(slot);
      const def = item && this.content.hasItem(item) ? this.content.item(item) : null;
      html += def
        ? `<div class="gslot gslot-full" data-gslot="${slot}" title="${escapeHtml(def.name)}">${icon(def)}</div>`
        : `<div class="gslot" data-gslot="${slot}" title="${SLOT_NAMES[slot]}"><span class="gslot-name">${SLOT_NAMES[slot]}</span></div>`;
    }
    html += '</div>';
    const s = this.replica.stats;
    if (s) {
      html += '<div class="stats">' +
        `<div><span>Hit points</span><b>${s.hp} / ${s.maxHp}</b></div><div><span>Mana</span><b>${s.mana} / ${s.maxMana}</b></div>` +
        `<div><span>Armor</span><b>${s.armor}</b></div><div><span>Attack</span><b>${s.attack}</b></div><div><span>Spell power</span><b>${s.spellPower}</b></div></div>`;
    }
    this.bodies.gear!.innerHTML = html;
  }

  private renderSkills(): void {
    const body = this.bodies.skills!;
    if (this.skillShown) {
      const id = this.skillShown;
      const xp = this.replica.skills.get(id) ?? 0;
      const { level, into, span } = progressOf(xp);
      const pct = span > 0 ? Math.round((into / span) * 100) : 100;
      let html = `<div class="skill-head"><button class="menu-btn" type="button" data-back>&larr; All skills</button><b>${escapeHtml(this.content.skill(id).name)}</b><span class="skill-level">${level}</span></div>` +
        `<p class="muted">${escapeHtml(this.content.skill(id).description)}</p>` +
        `<div class="skill-xp">${xp.toLocaleString()} xp${span > 0 ? ` · ${(span - into).toLocaleString()} to level ${level + 1}` : ' · the top'}</div><span class="bar"><span class="bar-fill" style="width:${pct}%"></span></span>` +
        '<div class="unlocks">';
      for (const unlock of this.content.unlocks(id)) {
        const state = unlock.level <= level ? 'done' : unlock.level === level + 1 ? 'next' : '';
        html += `<div class="unlock-row ${state}" ${unlock.level === level ? 'data-now' : ''}><span class="unlock-level">${unlock.level}</span><span>${escapeHtml(unlock.text)}</span></div>`;
      }
      body.innerHTML = html + '</div>';
      body.querySelector('[data-now]')?.scrollIntoView({ block: 'center' });
      return;
    }
    let html = '<div class="skill-list">';
    for (const id of this.content.skillIds) {
      const xp = this.replica.skills.get(id) ?? 0;
      const { level, into, span } = progressOf(xp);
      const pct = span > 0 ? Math.round((into / span) * 100) : 100;
      html += `<div class="skill-row" data-skill="${id}" title="${xp.toLocaleString()} xp${span > 0 ? `, ${(span - into).toLocaleString()} to level ${level + 1}` : ''}"><span class="skill-name">${escapeHtml(this.content.skill(id).name)}</span><span class="skill-level">${level}</span><span class="bar"><span class="bar-fill" style="width:${pct}%"></span></span></div>`;
    }
    body.innerHTML = html + '</div><p class="muted small">Click a skill to see what every level gives.</p>';
  }

  private renderBank(): void {
    const bank = this.replica.bank;
    if (bank === null) {
      if (this.windows.isOpen('bank')) this.windows.close('bank');
      return;
    }
    if (!this.windows.isOpen('bank')) this.windows.open('bank');
    const list = this.bodies.bank!.querySelector<HTMLElement>('#on-bank-list')!;
    if (bank.length === 0) {
      list.innerHTML = '<p class="muted">Nothing in the bank yet.</p>';
      return;
    }
    let html = '';
    for (const [item, qty] of bank) {
      if (!this.content.hasItem(item)) continue;
      const def = this.content.item(item);
      html += `<div class="stack">${icon(def)}<span class="stack-name">${escapeHtml(def.name)}</span><span class="stack-qty">${qty}</span>` +
        `<span class="stack-buttons"><button class="menu-btn" type="button" data-item="${item}" data-qty="1">1</button><button class="menu-btn" type="button" data-item="${item}" data-qty="5">5</button><button class="menu-btn" type="button" data-item="${item}" data-qty="${qty}">All</button></span></div>`;
    }
    list.innerHTML = html;
  }

  private renderJournal(): void {
    const tabs = JOURNAL_TABS.map((t) => `<button type="button" class="jtab${t === this.journalTab ? ' on' : ''}" data-jtab="${t}">${t}</button>`).join('');
    let html = '';
    switch (this.journalTab) {
      case 'Quests':
        html = this.content.questIds.map((id) => {
          const quest = this.content.quest(id);
          return `<div class="entry"><b>${escapeHtml(quest.name)}</b><span class="tag">Not started</span><div class="muted">Given by ${escapeHtml(this.content.npc(quest.giverId).name)}</div><div>${escapeHtml(quest.description)}</div></div>`;
        }).join('') + '<p class="muted small">Quests arrive with the tutorial island; this is what is written so far.</p>';
        break;
      case 'Log':
        html = this.log.length === 0 ? '<p class="muted">Nothing yet.</p>' : this.log.map((l) => `<div class="entry"><span class="muted">${l.when}</span> ${escapeHtml(l.text)}</div>`).join('');
        break;
      case 'Bestiary':
        html = [...this.content.monsterIds].map((id) => this.content.monster(id)).sort((a, b) => a.tier - b.tier || a.hp - b.hp).map((m) =>
          `<div class="entry"><b>${escapeHtml(m.name)}</b><span class="tag">tier ${m.tier}</span><div class="muted">HP ${m.hp} · attack ${m.attack} · armor ${m.armor}</div><div>${escapeHtml(m.description)}</div></div>`).join('');
        break;
      case 'Items':
        html = `<input id="on-item-filter" class="filter" type="text" placeholder="Filter items" value="${escapeHtml(this.itemFilter)}"><div id="on-item-list">${this.itemsHtml()}</div>`;
        break;
    }
    this.bodies.journal!.innerHTML = `<div class="jtabs">${tabs}</div><div class="jbody">${html}</div>`;
    if (this.journalTab === 'Items') this.bodies.journal!.querySelector<HTMLInputElement>('#on-item-filter')?.focus();
  }

  private itemsHtml(): string {
    const items = this.content.itemIds.map((id) => this.content.item(id)).filter((i) => !this.itemFilter || i.name.toLowerCase().includes(this.itemFilter) || i.group.includes(this.itemFilter));
    items.sort((a, b) => a.group.localeCompare(b.group) || a.tier - b.tier || a.name.localeCompare(b.name));
    return items.slice(0, 200).map((i) => `<div class="entry">${icon(i)}<b>${escapeHtml(i.name)}</b><span class="tag">tier ${i.tier}</span><div>${escapeHtml(describe(i))}</div></div>`).join('') + (items.length > 200 ? '<p class="muted small">Filter to see more.</p>' : '');
  }

  private renderSettings(): void {
    const body = this.bodies.settings!;
    body.innerHTML = '<div class="settings">' +
      '<label><input type="checkbox" id="on-set-run"> Run instead of walk (R)</label>' +
      '<label><input type="checkbox" id="on-set-hover" checked> Show what the pointer is over</label>' +
      '<label><input type="checkbox" id="on-set-chat" checked> Show the chat</label>' +
      '<div class="row"><button class="menu-btn" type="button" id="on-set-layout">Reset window layout</button></div>' +
      `<div class="muted small">Server: ${escapeHtml(this.config.serverUrl || 'set on the join card')}</div>` +
      '<div class="muted small">Keys: I inventory, G gear, J journal, K skills, M map, O settings, R run, Space stop, Enter talk.</div>' +
      '<div class="row"><button class="menu-btn" type="button" id="on-set-leave">Leave the world</button></div></div>';
    const run = body.querySelector<HTMLInputElement>('#on-set-run')!;
    run.addEventListener('change', () => {
      this.runToggled = run.checked;
      this.applyRunning();
    });
    body.querySelector<HTMLInputElement>('#on-set-hover')!.addEventListener('change', (event) => {
      this.scene.showHover = (event.target as HTMLInputElement).checked;
    });
    body.querySelector<HTMLInputElement>('#on-set-chat')!.addEventListener('change', (event) => {
      this.els.chat.hidden = !(event.target as HTMLInputElement).checked;
    });
    body.querySelector('#on-set-layout')!.addEventListener('click', () => this.windows.reset());
    body.querySelector('#on-set-leave')!.addEventListener('click', () => this.leave(''));
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
    const box = this.bodies.settings?.querySelector<HTMLInputElement>('#on-set-run');
    if (box) box.checked = this.runToggled;
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
      this.els.chatLog.appendChild(el);
    }
    this.lastChatLine = lines[lines.length - 1] ?? null;
    this.trimLog();
  }

  /** A line from the game itself: in the chat log now, and in the journal for later. */
  private appendSystem(text: string): void {
    const el = document.createElement('div');
    el.className = 'chat-line chat-system';
    el.textContent = text;
    this.els.chatLog.appendChild(el);
    this.trimLog();
    this.log.push({ when: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), text });
    if (this.log.length > 200) this.log.shift();
    if (this.windows.isOpen('journal') && this.journalTab === 'Log') this.renderJournal();
  }

  private trimLog(): void {
    while (this.els.chatLog.children.length > 60) this.els.chatLog.firstElementChild?.remove();
    this.els.chatLog.scrollTop = this.els.chatLog.scrollHeight;
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

function icon(def: ItemDef): string {
  return `<span class="icon" style="background:${ITEM_COLORS[def.group]}">${escapeHtml(initials(def.name))}</span>`;
}

/** An item's description with its numbers: what it adds when worn, what it heals, what it is a tool for. */
function describe(def: ItemDef): string {
  const parts = [def.description];
  if (def.equip) {
    const stats = Object.entries(def.equip.stats).filter(([, v]) => v).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${STAT_NAMES[k] ?? k}`);
    if (stats.length > 0) parts.push(`Worn: ${stats.join(', ')}.`);
    const req = def.equip.requirements?.map((r) => `${r.skill.replace('_', ' ')} tier ${r.tier}`);
    if (req && req.length > 0) parts.push(`Needs ${req.join(', ')}.`);
  }
  if (def.tool) parts.push(`A ${def.tool.skill} tool, tier ${def.tool.tier}.`);
  if (def.consume) for (const effect of def.consume.effects) if (effect.type === 'heal') parts.push(`Heals ${effect.amount}.`);
  return parts.join(' ');
}

const STAT_NAMES: Record<string, string> = { hp: 'hit points', mana: 'mana', armor: 'armor', attack: 'attack', spellPower: 'spell power' };

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

export { EQUIP_SLOTS };
