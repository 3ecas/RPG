/**
 * The zone as a place you walk through: a canvas with the tile map, the
 * player, the people and the creatures. Keyboard or tap to move, E or tap to
 * interact. It reads game state and calls the facade through the App; every
 * rule stays in the systems. Positions are UI state, not part of the save.
 */
import type { MonsterId, ZoneId } from '@/types/ids';
import type { Activity } from '@/types/state';
import { type Cell, DIRS, type Grid, inBounds, isAdjacent, isWalkable, markersAt, neighbors, objectAt, parseMap, type PlacedObject } from '@/world/grid';
import { findPath, findPathTo } from '@/world/path';
import type { App } from '../app';
import type { WindowState } from '../panel';
import { toast } from '../toast';
import { human, PLAYER_COLORS } from './art';
import { drawExitMarkers, objectSprite, outlinedText } from './objects';
import { BIOME_PALETTES, MARKER_COLORS, MONSTER_ART } from './palettes';
import { renderGround, sprite, TILE } from './sprites';

const STEP_MS = 150;
const MONSTER_STEP_MS = 280;
const WANDER_RADIUS = 2;
const HINT_STEPS = 8;

/** Down, left, right, up: the order of DIRS. */
type Dir = 0 | 1 | 2 | 3;

const KEY_DIRS: Readonly<Record<string, Dir>> = {
  ArrowDown: 0, s: 0, S: 0, ArrowLeft: 1, a: 1, A: 1, ArrowRight: 2, d: 2, D: 2, ArrowUp: 3, w: 3, W: 3,
};

const VERBS: Readonly<Record<string, string>> = { woodcutting: 'Chop', mining: 'Mine', fishing: 'Fish at', farming: 'Harvest', harvesting: 'Pick' };

interface Mover {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  dir: Dir;
  /** Progress of the current step, 0..1. */
  t: number;
  moving: boolean;
}

interface Monster extends Mover {
  spot: PlacedObject;
  id: MonsterId;
  nextWanderAt: number;
  engaged: boolean;
  flash: number;
  /** 1 while fading out after a kill, then hidden until respawnAt. */
  fade: number;
  hidden: boolean;
  respawnAt: number;
}

type Target = { kind: 'object'; obj: PlacedObject } | { kind: 'monster'; monster: Monster };

interface Player extends Mover {
  path: Cell[];
  /** True while walking to the object of an activity: no "walked away" checks. */
  auto: boolean;
  target: Target | null;
  flash: number;
  steps: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  born: number;
}

export class WorldScene {
  private host!: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private prompt!: HTMLButtonElement;
  private zoneLabel!: HTMLElement;
  private hint!: HTMLElement;
  private grid: Grid | null = null;
  private zoneId: ZoneId | null = null;
  private ground: [HTMLCanvasElement, HTMLCanvasElement] | null = null;
  private player: Player = { x: 0, y: 0, fromX: 0, fromY: 0, dir: 0, t: 1, moving: false, path: [], auto: false, target: null, flash: 0, steps: 0 };
  private monsters: Monster[] = [];
  private floaters: Floater[] = [];
  private keys: string[] = [];
  private scale = 3;
  private dpr = 1;
  private lastTime = 0;
  private now = 0;
  private arrivalFrom: ZoneId | null = null;
  private pendingEngage: Monster | null = null;
  private lastHp = -1;
  private lastCombat: { id: MonsterId; hp: number } | null = null;
  private promptText = '';
  private unsubscribe: (() => void)[] = [];
  private pointer: { x: number; y: number } | null = null;

  constructor(private readonly app: App) {}

  mount(host: HTMLElement): void {
    this.host = host;
    host.innerHTML = '<canvas class="world-canvas"></canvas><div class="world-zone" id="world-zone"></div><div class="world-hud"><button class="btn world-prompt" data-action="interact" hidden></button></div><div class="world-hint">WASD / arrows or tap to move · E or tap to interact · Esc closes windows</div>';
    this.canvas = host.querySelector('.world-canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.prompt = host.querySelector('.world-prompt')!;
    this.zoneLabel = host.querySelector('.world-zone')!;
    this.hint = host.querySelector('.world-hint')!;
    this.installInput();
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.attach();
  }

  /** After the game instance changed (import, reset): forget the zone so the next frame re-enters it. */
  reset(): void {
    this.zoneId = null;
    this.grid = null;
    this.lastHp = -1;
    this.lastCombat = null;
    this.attach();
  }

  /** Called every animation frame by the shell, before the DOM is patched. */
  frame(now: number): void {
    const dt = this.lastTime ? Math.min(100, now - this.lastTime) : 0;
    this.lastTime = now;
    this.now = now;
    this.sync();
    if (!this.grid) return;
    this.update(dt);
    this.draw();
  }

  /** The E key and the prompt button. */
  interact(): void {
    const target = this.focus();
    if (target) this.interactWith(target);
  }

  /** Where the player stands, for tests and for the shell. */
  get position(): Cell & { zone: ZoneId | null } {
    return { x: this.player.x, y: this.player.y, zone: this.zoneId };
  }

  /** The creatures of the zone and where they stand right now, for tests. */
  get creatures(): { id: MonsterId; x: number; y: number; engaged: boolean; hidden: boolean }[] {
    return this.monsters.map((m) => ({ id: m.id, x: m.x, y: m.y, engaged: m.engaged, hidden: m.hidden }));
  }

  /** Walk to a cell (or next to the thing on it) as a tap would. */
  walkTo(x: number, y: number): void {
    this.onTap({ x, y });
  }

  // ---- lifecycle ---------------------------------------------------------------

  private attach(): void {
    for (const off of this.unsubscribe) off();
    const events = this.app.game.ctx.events;
    this.unsubscribe = [
      events.on('activity:started', (e) => this.onActivityStarted(e.activity)),
      events.on('activity:stopped', () => { for (const m of this.monsters) m.engaged = false; }),
      events.on('monster:killed', () => this.onMonsterKilled()),
    ];
  }

  private sync(): void {
    const zoneId = this.app.game.state.player.zoneId;
    if (zoneId !== this.zoneId) this.enterZone(zoneId);
  }

  private enterZone(zoneId: ZoneId): void {
    const game = this.app.game;
    const map = game.content.map(zoneId);
    const grid = parseMap(map);
    this.zoneId = zoneId;
    this.grid = grid;
    this.ground = [renderGround(grid, map.biome, 0), renderGround(grid, map.biome, 1)];
    this.monsters = grid.objects
      .filter((o) => o.def.kind === 'monster')
      .map((spot) => ({
        spot, id: (spot.def as { id: MonsterId }).id, x: spot.x, y: spot.y, fromX: spot.x, fromY: spot.y, dir: 0, t: 1, moving: false,
        nextWanderAt: this.now + 500 + Math.random() * 1500, engaged: false, flash: 0, fade: 0, hidden: false, respawnAt: 0,
      }));
    let cell: Cell | null = null;
    let dir: Dir = 0;
    if (this.arrivalFrom) {
      const back = grid.objects.find((o) => o.def.kind === 'exit' && o.def.zone === this.arrivalFrom);
      if (back) cell = { x: back.x, y: back.y };
      this.arrivalFrom = null;
      if (cell) dir = this.inwardDir(grid, cell);
    } else {
      const saved = this.app.ui.positions[zoneId];
      if (saved && isWalkable(grid, saved.x, saved.y)) { cell = { x: saved.x, y: saved.y }; dir = saved.d; }
    }
    cell ??= grid.spawn;
    this.player = { x: cell.x, y: cell.y, fromX: cell.x, fromY: cell.y, dir, t: 1, moving: false, path: [], auto: false, target: null, flash: 0, steps: this.player.steps };
    this.floaters = [];
    this.lastHp = game.state.player.hp;
    this.lastCombat = game.state.combat ? { id: game.state.combat.monsterId, hp: game.state.combat.monsterHp } : null;
    this.zoneLabel.textContent = game.content.zone(zoneId).name;
    this.onActivityStarted(game.state.activity);
  }

  /** From a border cell, the direction that leads into the map. */
  private inwardDir(grid: Grid, cell: Cell): Dir {
    const order: Dir[] = [0, 1, 2, 3];
    for (const d of order) {
      const step = DIRS[d]!;
      if (isWalkable(grid, cell.x + step.x, cell.y + step.y)) return d;
    }
    return 0;
  }

  private resize(): void {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (width === 0 || height === 0) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.scale = width >= 1000 ? 3 : 2;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  // ---- input -------------------------------------------------------------------

  private installInput(): void {
    window.addEventListener('keydown', (event) => {
      if (isTyping(event.target)) return;
      const dir = KEY_DIRS[event.key];
      if (dir !== undefined) {
        event.preventDefault();
        if (!this.keys.includes(event.key)) this.keys.unshift(event.key);
        this.manual();
        return;
      }
      if ((event.key === 'e' || event.key === 'E' || event.key === 'Enter' || event.key === ' ') && !(document.activeElement instanceof HTMLButtonElement)) {
        event.preventDefault();
        this.interact();
      }
    });
    window.addEventListener('keyup', (event) => { this.keys = this.keys.filter((k) => k !== event.key); });
    window.addEventListener('blur', () => { this.keys = []; });
    this.canvas.addEventListener('pointerdown', (event) => { this.pointer = { x: event.clientX, y: event.clientY }; });
    this.canvas.addEventListener('pointerup', (event) => {
      const down = this.pointer;
      this.pointer = null;
      if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 8) return;
      const cell = this.cellAt(event.clientX, event.clientY);
      if (cell) this.onTap(cell);
    });
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  private cellAt(clientX: number, clientY: number): Cell | null {
    if (!this.grid) return null;
    const rect = this.canvas.getBoundingClientRect();
    const cam = this.camera();
    const x = Math.floor((clientX - rect.left) / this.scale + cam.x);
    const y = Math.floor((clientY - rect.top) / this.scale + cam.y);
    return inBounds(this.grid, Math.floor(x / TILE), Math.floor(y / TILE)) ? { x: Math.floor(x / TILE), y: Math.floor(y / TILE) } : null;
  }

  /** Any player-driven movement cancels paths and targets. */
  private manual(): void {
    this.player.path = [];
    this.player.target = null;
    this.player.auto = false;
  }

  private onTap(cell: Cell): void {
    const grid = this.grid;
    if (!grid) return;
    this.manual();
    const p = this.player;
    const target = this.targetAt(cell);
    if (target) {
      if (this.touches(target, p)) { this.faceTarget(target); this.interactWith(target); return; }
      const path = findPathTo(grid, p, (c) => this.touches(target, c), { blocked: (x, y) => this.creatureAt(x, y) });
      if (path) { p.path = path; p.target = target; } else toast('No way to get there from here.', 'warn');
      return;
    }
    if (!this.canStand(cell.x, cell.y)) return;
    const path = findPath(grid, p, cell, { blocked: (x, y) => this.creatureAt(x, y) });
    if (path) p.path = path;
  }

  // ---- update ------------------------------------------------------------------

  private update(dt: number): void {
    const p = this.player;
    if (!p.moving) {
      const key = this.keys[0];
      const dir = key === undefined ? undefined : KEY_DIRS[key];
      if (dir !== undefined) this.tryStep(dir);
      else if (p.path.length) this.followPath();
    }
    if (p.moving) {
      p.t = Math.min(1, p.t + dt / STEP_MS);
      if (p.t >= 1) { p.moving = false; this.onArrive(); }
    }
    this.updateMonsters(dt);
    this.watchHits();
    p.flash = Math.max(0, p.flash - dt / 220);
    this.floaters = this.floaters.filter((f) => this.now - f.born < 900);
    if (p.steps >= HINT_STEPS) this.hint.classList.add('hidden');
  }

  private followPath(): void {
    const grid = this.grid!;
    const p = this.player;
    const next = p.path[0]!;
    if (this.canStand(next.x, next.y)) {
      p.path.shift();
      this.tryStep(dirBetween(p, next));
      return;
    }
    // A creature is in the way: find another path, or wait for it to move.
    const goal = p.path[p.path.length - 1]!;
    const around = findPath(grid, p, goal, { blocked: (x, y) => this.creatureAt(x, y) });
    if (around && around.length) p.path = around;
  }

  private tryStep(dir: Dir): boolean {
    const p = this.player;
    const step = DIRS[dir]!;
    p.dir = dir;
    const nx = p.x + step.x;
    const ny = p.y + step.y;
    if (!this.canStand(nx, ny)) return false;
    p.fromX = p.x;
    p.fromY = p.y;
    p.x = nx;
    p.y = ny;
    p.t = 0;
    p.moving = true;
    return true;
  }

  private canStand(x: number, y: number): boolean {
    return !!this.grid && isWalkable(this.grid, x, y) && !this.creatureAt(x, y);
  }

  private creatureAt(x: number, y: number): boolean {
    return this.monsters.some((m) => !m.hidden && ((m.x === x && m.y === y) || (m.moving && m.fromX === x && m.fromY === y)));
  }

  private onArrive(): void {
    const grid = this.grid!;
    const p = this.player;
    p.steps += 1;
    this.app.ui.positions[this.zoneId!] = { x: p.x, y: p.y, d: p.dir };
    this.app.persistUi();
    const exit = markersAt(grid, p.x, p.y).find((o) => o.def.kind === 'exit');
    if (exit && exit.def.kind === 'exit') { this.useExit(exit.def.zone); return; }
    if (p.target && this.touches(p.target, p)) {
      const target = p.target;
      p.target = null;
      p.path = [];
      p.auto = false;
      this.faceTarget(target);
      this.interactWith(target);
      return;
    }
    if (p.path.length === 0) p.auto = false;
    if (!p.auto) {
      this.stopIfWalkedAway();
      this.closeFarWindows();
    }
  }

  private useExit(zone: ZoneId): void {
    const from = this.zoneId;
    const result = this.app.game.travel(zone);
    if (!result.ok) { toast(result.reason, 'warn'); return; }
    this.arrivalFrom = from;
    this.app.markDirty();
  }

  private updateMonsters(dt: number): void {
    const grid = this.grid!;
    const p = this.player;
    for (const m of this.monsters) {
      m.flash = Math.max(0, m.flash - dt / 200);
      if (m.fade > 0) {
        m.fade = Math.max(0, m.fade - dt / 450);
        if (m.fade === 0) { m.hidden = true; m.respawnAt = this.now + 900; }
        continue;
      }
      if (m.hidden) {
        if (this.now >= m.respawnAt) { m.hidden = false; m.flash = 1; }
        continue;
      }
      if (m.moving) {
        m.t = Math.min(1, m.t + dt / MONSTER_STEP_MS);
        if (m.t >= 1) m.moving = false;
        continue;
      }
      if (m.engaged) { m.dir = dirBetween(m, p); continue; }
      if (this.now < m.nextWanderAt) continue;
      m.nextWanderAt = this.now + 900 + Math.random() * 1400;
      if (Math.random() > 0.5) continue;
      const dir = Math.floor(Math.random() * 4) as Dir;
      const step = DIRS[dir]!;
      const nx = m.x + step.x;
      const ny = m.y + step.y;
      m.dir = dir;
      const inRange = Math.abs(nx - m.spot.x) <= WANDER_RADIUS && Math.abs(ny - m.spot.y) <= WANDER_RADIUS;
      const free = isWalkable(grid, nx, ny) && !this.creatureAt(nx, ny) && !(p.x === nx && p.y === ny) && !markersAt(grid, nx, ny).some((o) => o.def.kind === 'exit');
      if (!inRange || !free) continue;
      m.fromX = m.x;
      m.fromY = m.y;
      m.x = nx;
      m.y = ny;
      m.t = 0;
      m.moving = true;
    }
  }

  /** Damage shows as flashes and floating numbers, read off the state so no rule is duplicated here. */
  private watchHits(): void {
    const state = this.app.game.state;
    const hp = state.player.hp;
    if (this.lastHp >= 0 && hp < this.lastHp && state.activity?.kind === 'combat') {
      this.player.flash = 1;
      this.float(this.player, `-${this.lastHp - hp}`, '#ff6b6b');
    }
    this.lastHp = hp;
    const combat = state.combat;
    const engaged = this.monsters.find((m) => m.engaged);
    if (combat && this.lastCombat && combat.monsterId === this.lastCombat.id && combat.monsterHp < this.lastCombat.hp && engaged) {
      engaged.flash = 1;
      this.float(engaged, `-${this.lastCombat.hp - combat.monsterHp}`, '#ffffff');
    }
    this.lastCombat = combat ? { id: combat.monsterId, hp: combat.monsterHp } : null;
  }

  private float(at: Mover, text: string, color: string): void {
    const pos = pixel(at);
    this.floaters.push({ x: pos.x + TILE / 2, y: pos.y, text, color, born: this.now });
  }

  // ---- activities and windows --------------------------------------------------

  private onActivityStarted(activity: Activity | null): void {
    const grid = this.grid;
    if (!grid || !activity) return;
    if (activity.kind === 'combat') {
      for (const m of this.monsters) m.engaged = false;
      const chosen = this.pendingEngage?.id === activity.monsterId ? this.pendingEngage : this.nearestMonster(activity.monsterId);
      this.pendingEngage = null;
      if (chosen) chosen.engaged = true;
    }
    const targets = this.activityTargets(activity);
    if (targets.length === 0 || targets.some((t) => this.touches(t, this.player))) return;
    const path = findPathTo(grid, this.player, (c) => targets.some((t) => this.touches(t, c)), { blocked: (x, y) => this.creatureAt(x, y) });
    if (path && path.length) {
      this.player.path = path;
      this.player.auto = true;
      this.player.target = null;
    }
  }

  private onMonsterKilled(): void {
    const engaged = this.monsters.find((m) => m.engaged);
    if (engaged) engaged.fade = 1;
  }

  /** What in this zone the current activity happens at. */
  private activityTargets(activity: Activity): Target[] {
    const grid = this.grid!;
    const content = this.app.game.content;
    switch (activity.kind) {
      case 'gather': return grid.objects.filter((o) => o.def.kind === 'node' && o.def.id === activity.nodeId).map((obj) => ({ kind: 'object', obj }));
      case 'craft': {
        const station = content.recipe(activity.recipeId).station;
        return grid.objects.filter((o) => o.def.kind === 'station' && o.def.id === station).map((obj) => ({ kind: 'object', obj }));
      }
      case 'combat': return this.monsters.filter((m) => m.engaged).map((monster) => ({ kind: 'monster', monster }));
    }
  }

  /** The gathering spot or station the current activity runs at: the one faced, else the nearest one beside the player. */
  private workedObject(): PlacedObject | null {
    const activity = this.app.game.state.activity;
    if (!activity || activity.kind === 'combat') return null;
    const objects = this.activityTargets(activity).flatMap((t) => (t.kind === 'object' ? [t.obj] : []));
    const p = this.player;
    const step = DIRS[p.dir]!;
    const facing = { x: p.x + step.x, y: p.y + step.y };
    return objects.find((o) => facing.x >= o.x && facing.x < o.x + o.w && facing.y >= o.y && facing.y < o.y + o.h) ?? objects.find((o) => isAdjacent(o, p)) ?? objects[0] ?? null;
  }

  private stopIfWalkedAway(): void {
    const activity = this.app.game.state.activity;
    if (!activity) return;
    const targets = this.activityTargets(activity);
    if (targets.length === 0 || targets.some((t) => this.touches(t, this.player))) return;
    this.app.game.stopActivity('You walked away.');
    this.app.markDirty();
  }

  /** Windows about a thing in the world close once you leave its side. */
  private closeFarWindows(): void {
    for (const win of [...this.app.ui.windows]) {
      const objects = this.windowObjects(win);
      if (objects && !objects.some((o) => isAdjacent(o, this.player))) this.app.closeWindow(win.id);
    }
  }

  private windowObjects(win: WindowState): PlacedObject[] | null {
    const grid = this.grid!;
    const content = this.app.game.content;
    const of = (pred: (o: PlacedObject) => boolean) => grid.objects.filter(pred);
    switch (win.panel) {
      case 'node': return of((o) => o.def.kind === 'node' && o.def.id === win.params.id);
      case 'npc': return of((o) => o.def.kind === 'npc' && o.def.id === win.params.id);
      case 'shops': { const shop = win.params.shop ?? this.app.ui.shopId; return of((o) => o.def.kind === 'shop' && o.def.id === shop); }
      case 'market': return of((o) => o.def.kind === 'market');
      case 'traders': return of((o) => o.def.kind === 'trader');
      default: return content.hasStation(win.panel) ? of((o) => o.def.kind === 'station' && o.def.id === win.panel) : null;
    }
  }

  // ---- interaction -------------------------------------------------------------

  /** The thing in front of the player, else anything beside them. */
  private focus(): Target | null {
    const p = this.player;
    if (!this.grid) return null;
    const step = DIRS[p.dir]!;
    return this.targetAt({ x: p.x + step.x, y: p.y + step.y }) ?? neighbors(p).map((c) => this.targetAt(c)).find((t) => t !== null) ?? null;
  }

  private targetAt(cell: Cell): Target | null {
    const monster = this.monsters.find((m) => !m.hidden && m.x === cell.x && m.y === cell.y);
    if (monster) return { kind: 'monster', monster };
    const obj = objectAt(this.grid!, cell.x, cell.y);
    return obj ? { kind: 'object', obj } : null;
  }

  private touches(target: Target, cell: Cell): boolean {
    if (target.kind === 'monster') return Math.abs(target.monster.x - cell.x) + Math.abs(target.monster.y - cell.y) === 1;
    return isAdjacent(target.obj, cell);
  }

  private faceTarget(target: Target): void {
    const at = target.kind === 'monster' ? target.monster : { x: target.obj.x + (target.obj.w - 1) / 2, y: target.obj.y + (target.obj.h - 1) / 2 };
    this.player.dir = dirBetween(this.player, at);
  }

  private nearestMonster(id: MonsterId): Monster | null {
    const p = this.player;
    let best: Monster | null = null;
    let bestD = Infinity;
    for (const m of this.monsters) {
      if (m.id !== id || m.hidden) continue;
      const d = Math.abs(m.x - p.x) + Math.abs(m.y - p.y);
      if (d < bestD) { best = m; bestD = d; }
    }
    return best;
  }

  private promptFor(target: Target): string {
    const content = this.app.game.content;
    const state = this.app.game.state;
    if (target.kind === 'monster') {
      const fighting = target.monster.engaged && state.activity?.kind === 'combat';
      return `${fighting ? 'Fight' : 'Attack'} ${content.monster(target.monster.id).name}`;
    }
    const def = target.obj.def;
    switch (def.kind) {
      case 'node': {
        const node = content.node(def.id);
        const active = state.activity?.kind === 'gather' && state.activity.nodeId === def.id;
        return active ? `${node.name} details` : `${VERBS[node.skill] ?? 'Gather'} ${node.name}`;
      }
      case 'station': return `Use the ${content.station(def.id).name}`;
      case 'shop': return `Enter ${content.shop(def.id).name}`;
      case 'market': return 'Browse the market';
      case 'trader': return `Barter with ${content.trader(def.id).name}`;
      case 'npc': return `Talk to ${content.npc(def.id).name}`;
      case 'signpost': return 'Read the signpost';
      default: return '';
    }
  }

  private interactWith(target: Target): void {
    const app = this.app;
    const game = app.game;
    const content = game.content;
    this.faceTarget(target);
    if (target.kind === 'monster') {
      const m = target.monster;
      const fighting = m.engaged && game.state.activity?.kind === 'combat' && game.state.combat?.monsterId === m.id;
      if (!fighting) {
        this.pendingEngage = m;
        const result = game.startCombat(m.id);
        this.pendingEngage = null;
        if (!result.ok) { toast(result.reason, 'warn'); return; }
      }
      app.openWindow('combat');
      return;
    }
    const def = target.obj.def;
    switch (def.kind) {
      case 'node': {
        const active = game.state.activity?.kind === 'gather' && game.state.activity.nodeId === def.id;
        if (active) { app.openExclusive('node', { id: def.id }); break; }
        const result = game.startGathering(def.id);
        if (!result.ok) { toast(result.reason, 'warn'); app.openExclusive('node', { id: def.id }); }
        break;
      }
      case 'station': app.openWindow(def.id); break;
      case 'shop': app.openShop(def.id); break;
      case 'market': app.openWindow('market'); break;
      case 'trader': app.openWindow('traders'); break;
      case 'npc': game.talk(def.id); app.openExclusive('npc', { id: def.id }); break;
      case 'signpost': app.openWindow('zones'); break;
      default: return;
    }
    void content;
    app.markDirty();
  }

  // ---- drawing -----------------------------------------------------------------

  private camera(): Cell {
    const grid = this.grid!;
    const viewW = this.canvas.clientWidth / this.scale;
    const viewH = this.canvas.clientHeight / this.scale;
    const mapW = grid.width * TILE;
    const mapH = grid.height * TILE;
    const p = pixel(this.player);
    const x = mapW <= viewW ? -(viewW - mapW) / 2 : Math.max(0, Math.min(mapW - viewW, p.x + TILE / 2 - viewW / 2));
    const y = mapH <= viewH ? -(viewH - mapH) / 2 : Math.max(0, Math.min(mapH - viewH, p.y + TILE / 2 - viewH / 2));
    return { x: Math.round(x * this.scale) / this.scale, y: Math.round(y * this.scale) / this.scale };
  }

  private draw(): void {
    const grid = this.grid!;
    const ctx = this.ctx;
    const map = this.app.game.content.map(this.zoneId!);
    const cam = this.camera();
    const k = this.dpr * this.scale;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = BIOME_PALETTES[map.biome].z;
    ctx.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    ctx.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.ground![Math.floor(this.now / 700) % 2]!, 0, 0);
    this.drawExits(grid);

    const drawables: { y: number; draw: () => void }[] = [];
    const p = this.player;
    for (const obj of grid.objects) {
      const img = this.objectSprite(obj);
      if (!img) continue;
      // A tall sprite (a tree) whose canopy would hide the player turns see-through.
      const overhang = img.height - obj.h * TILE;
      const hides = overhang > 0 && p.x >= obj.x && p.x < obj.x + obj.w && p.y < obj.y && p.y * TILE + TILE > obj.y * TILE - overhang;
      drawables.push({ y: (obj.y + obj.h) * TILE, draw: () => { ctx.globalAlpha = hides ? 0.45 : 1; ctx.drawImage(img, obj.x * TILE, (obj.y + obj.h) * TILE - img.height); ctx.globalAlpha = 1; } });
    }
    for (const m of this.monsters) {
      if (m.hidden) continue;
      const style = MONSTER_ART[m.id];
      const img = sprite(`monster:${m.id}`, () => style.art);
      const pos = pixel(m);
      const size = TILE * style.scale;
      drawables.push({ y: pos.y + TILE, draw: () => this.drawSprite(img, pos.x + TILE / 2 - size / 2, pos.y + TILE - size, size, size, m.dir === 1, m.flash, m.fade > 0 ? m.fade : 1) });
    }
    const pos = pixel(p);
    const facing = p.dir === 3 ? 'up' : p.dir === 0 ? 'down' : 'side';
    const frame = p.moving ? (Math.floor(this.now / 130) % 2 as 0 | 1) : 0;
    const playerImg = sprite(`player:${facing}:${frame}`, () => human(facing, frame, PLAYER_COLORS));
    drawables.push({ y: pos.y + TILE + 0.5, draw: () => this.drawSprite(playerImg, pos.x, pos.y - (frame === 1 && p.moving ? 1 : 0), TILE, TILE, p.dir === 2, p.flash, 1) });
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawOverlays(cam);
    this.updatePrompt();
  }

  private drawSprite(img: HTMLCanvasElement, x: number, y: number, w: number, h: number, flip: boolean, flash: number, alpha: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (flash > 0 && 'filter' in ctx) ctx.filter = `brightness(${1 + flash * 1.8})`;
    if (flip) {
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, w, h);
    } else {
      ctx.drawImage(img, x, y, w, h);
    }
    ctx.restore();
  }

  private objectSprite(obj: PlacedObject): HTMLCanvasElement | null {
    return objectSprite(this.app.game.content, obj, this.now);
  }

  private drawExits(grid: Grid): void {
    drawExitMarkers(this.ctx, grid);
  }

  /** Labels, markers and bars in screen space, so text stays crisp at any scale. */
  private drawOverlays(cam: Cell): void {
    const ctx = this.ctx;
    const game = this.app.game;
    const content = game.content;
    const state = game.state;
    const grid = this.grid!;
    const s = this.scale;
    const sx = (wx: number) => (wx - cam.x) * s;
    const sy = (wy: number) => (wy - cam.y) * s;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    const worked = this.workedObject();

    for (const obj of grid.objects) {
      const cx = sx((obj.x + obj.w / 2) * TILE);
      if (obj.def.kind === 'exit') {
        const zone = content.zone(obj.def.zone);
        const open = game.isZoneUnlocked(obj.def.zone).ok;
        const label = open ? zone.name : `${zone.name} (locked)`;
        const above = obj.y === grid.height - 1;
        ctx.font = '600 11px system-ui, sans-serif';
        const half = ctx.measureText(label).width / 2 + 6;
        const lx = Math.max(half, Math.min(this.canvas.clientWidth - half, cx));
        this.text(label, lx, above ? sy(obj.y * TILE) - 4 : sy((obj.y + 1) * TILE) + 12, open ? '#e4e6ea' : MARKER_COLORS.lock, 11);
      } else if (obj.def.kind === 'npc') {
        const npc = content.npc(obj.def.id);
        const top = sy(obj.y * TILE);
        this.text(npc.name, cx, top - 6, '#e4e6ea', 11);
        const quests = game.questsByGiver(obj.def.id);
        const ready = quests.some((q) => q.status === 'active' && game.canTurnIn(q.quest.id).ok);
        const available = quests.some((q) => q.status === 'available');
        if (ready || available) this.text(ready ? '?' : '!', cx, top - 18, ready ? MARKER_COLORS.ready : MARKER_COLORS.quest, 15, true);
      } else if (obj.def.kind === 'shop' || obj.def.kind === 'market' || obj.def.kind === 'trader' || obj.def.kind === 'station') {
        const name = obj.def.kind === 'shop' ? content.shop(obj.def.id).name : obj.def.kind === 'market' ? 'Market' : obj.def.kind === 'trader' ? content.trader(obj.def.id).name : content.station(obj.def.id).name;
        const near = Math.abs(obj.x + (obj.w - 1) / 2 - this.player.x) + Math.abs(obj.y + (obj.h - 1) / 2 - this.player.y) <= 4;
        if (near) this.text(name, cx, sy((obj.y + obj.h) * TILE) + 11, '#c9ccd3', 10);
      } else if (obj.def.kind === 'node') {
        const near = Math.abs(obj.x - this.player.x) + Math.abs(obj.y - this.player.y) <= 3;
        if (near) this.text(content.node(obj.def.id).name, cx, sy((obj.y + 1) * TILE) + 11, '#c9ccd3', 10);
      }
      if (worked === obj) this.bar(cx - 16, sy(obj.y * TILE) - 12, 32, game.activityView()?.progress ?? 0, '#7cc4ff');
    }

    for (const m of this.monsters) {
      if (m.hidden) continue;
      const pos = pixel(m);
      const size = TILE * MONSTER_ART[m.id].scale;
      const cx = sx(pos.x + TILE / 2);
      const top = sy(pos.y + TILE - size);
      const near = Math.abs(m.x - this.player.x) + Math.abs(m.y - this.player.y) <= 4;
      if (m.engaged && state.combat && state.combat.monsterId === m.id) {
        const monster = content.monster(m.id);
        this.text(`${monster.name} T${monster.tier}`, cx, top - 14, '#e4e6ea', 11);
        this.bar(cx - 16, top - 10, 32, state.combat.monsterHp / monster.hp, '#e06c75');
      } else if (near) {
        const monster = content.monster(m.id);
        this.text(`${monster.name} T${monster.tier}`, cx, top - 6, '#c9ccd3', 10);
      }
    }

    if (state.activity?.kind === 'combat') {
      const pos = pixel(this.player);
      this.bar(sx(pos.x) - 8, sy(pos.y) - 8, 32, state.player.hp / game.stats().maxHp, '#98c379');
    }

    for (const f of this.floaters) {
      const age = (this.now - f.born) / 900;
      ctx.globalAlpha = 1 - age;
      this.text(f.text, sx(f.x), sy(f.y) - age * 26, f.color, 12, true);
      ctx.globalAlpha = 1;
    }
  }

  private text(text: string, x: number, y: number, color: string, size: number, bold = false): void {
    outlinedText(this.ctx, text, x, y, color, size, bold);
  }

  private bar(x: number, y: number, width: number, fraction: number, color: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(10, 10, 14, 0.8)';
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, width + 2, 6);
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(width * Math.max(0, Math.min(1, fraction))), 4);
  }

  private updatePrompt(): void {
    const target = this.player.moving ? null : this.focus();
    const text = target ? this.promptFor(target) : '';
    if (text === this.promptText) return;
    this.promptText = text;
    this.prompt.hidden = text === '';
    this.prompt.innerHTML = text ? `<kbd>E</kbd> ${escape(text)}` : '';
  }
}

function pixel(m: Mover): { x: number; y: number } {
  const t = m.moving ? m.t : 1;
  return { x: (m.fromX + (m.x - m.fromX) * t) * TILE, y: (m.fromY + (m.y - m.fromY) * t) * TILE };
}

function dirBetween(from: Cell, to: Cell): Dir {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 1 : 2;
  return dy < 0 ? 3 : 0;
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}
