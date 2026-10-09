/**
 * The client's copy of the zone. Your own character is predicted: every
 * fixed step while a path is being walked becomes an input that is applied
 * at once and sent to the server, and when the server's placement for that
 * input comes back it is checked against the prediction and replayed from
 * there only if the two differ, with the difference faded out instead of
 * snapped. Everyone else is drawn a little behind the newest server tick,
 * interpolated between the placements the server sent. Walking into another
 * zone starts the replica over with that zone's snapshot. Pure data and
 * arithmetic: the socket feeds it and the scene draws it.
 */
import type { BagView, ClientMessage, EntitySnapshot, GearView, Placement, ServerMessage, StackView, StatsView, TickDelta, YouDelta, ZoneSnapshot } from '@/net/protocol';
import type { Cell, Dir, Grid } from '@/world/grid';
import { type Mover, planWalk, positionOf, step, STEP_MS } from '@/world/motion';

export type InputMessage = Extract<ClientMessage, { t: 'input' }>;

export interface EntityState {
  tick: number;
  x: number;
  y: number;
  dir: Dir;
  moving: boolean;
}

export interface ReplicaEntity {
  id: number;
  name: string;
  /** The newest position the server sent, in cells. */
  x: number;
  y: number;
  dir: Dir;
  running: boolean;
  moving: boolean;
  /** The cell of the thing it is working on, or null. */
  act: Cell | null;
  /** What the server said and at which tick, oldest first; others are interpolated through it. */
  history: EntityState[];
}

export interface GroundItemEntry {
  gid: number;
  item: string;
  qty: number;
  x: number;
  y: number;
}

export interface XpDrop {
  skill: string;
  amount: number;
  at: number;
}

export interface ChatEntry {
  id: number;
  name: string;
  text: string;
  at: number;
}

export interface Position {
  x: number;
  y: number;
  dir: Dir;
  moving: boolean;
}

/** How long a line stays over a head. */
export const BUBBLE_MS = 4500;
/** How long an xp gain floats over your head. */
export const XP_DROP_MS = 1500;
const CHAT_LOG_CAP = 100;
const HISTORY_CAP = 64;
const PENDING_CAP = 64;
/** A prediction this close to the server's placement counts as right (progress travels with three decimals). */
const AGREE = 0.002;
/** Ticks behind the newest server tick at which other players are drawn, so jitter has room. */
const DELAY_TICKS = 2;
/** Half-life of the visual offset that hides a correction of your own position. */
const SMOOTH_HALF_LIFE_MS = 60;
/** A correction larger than this is shown at once rather than faded. */
const SNAP_DISTANCE = 2;

interface Pending {
  msg: InputMessage;
  after: { cell: Cell; t: number; dir: Dir; path: Cell[] };
}

/** The drawn position for a placement from the server. */
function placed(p: Placement): { x: number; y: number } {
  return positionOf({ cell: { x: p.cx, y: p.cy }, t: p.t, path: p.nx >= 0 ? [{ x: p.nx, y: p.ny }] : [] });
}

export class Replica {
  tickMs = STEP_MS;
  tick = 0;
  selfId = -1;
  zone = '';
  readonly entities = new Map<number, ReplicaEntity>();
  readonly chat: ChatEntry[] = [];
  /** Items on the ground that you can see. */
  readonly items = new Map<number, GroundItemEntry>();
  /** Gather nodes that are empty right now, by their index among the map's objects. */
  readonly depleted = new Set<number>();
  bag: BagView = [];
  gear: GearView = [];
  stats: StatsView | null = null;
  /** Total xp per skill. */
  readonly skills = new Map<string, number>();
  /** The bank while it is open. */
  bank: StackView[] | null = null;
  readonly xpDrops: XpDrop[] = [];
  /** Bumped whenever the bag, the skills or the bank change, so panels know to redraw. */
  version = 0;
  /** Receives every input the prediction generates, to be sent to the server. */
  onInput: ((msg: InputMessage) => void) | null = null;
  /** Receives lines from the game about you. */
  onNote: ((text: string) => void) | null = null;
  /** Your own character as predicted. */
  readonly self: Mover & { moving: boolean } = { cell: { x: 0, y: 0 }, t: 0, dir: 0, running: false, path: [], moving: false };
  private grid: Grid | null = null;
  private click: Cell | null = null;
  private clickUse = false;
  private stopRequested = false;
  private seq = 0;
  private pending: Pending[] = [];
  private accumulator = 0;
  private lastUpdate = -1;
  private smooth = { x: 0, y: 0 };
  /** `now` minus `tick × tickMs` as server ticks arrive, kept near the earliest seen so others are shown as fresh as the line allows. */
  private clockOffset: number | null = null;

  get selfEntity(): ReplicaEntity | null {
    return this.entities.get(this.selfId) ?? null;
  }

  setGrid(grid: Grid): void {
    this.grid = grid;
  }

  /** A click: the next input plans a walk there. */
  walkTo(cell: Cell): void {
    this.click = cell;
    this.clickUse = false;
  }

  /** A click on something to use: the walk is predicted as usual, and the server acts on the thing once you stand beside it. */
  use(cell: Cell): void {
    this.click = cell;
    this.clickUse = true;
  }

  /** Halt at the next whole cell and forget what was planned; the next input says so. */
  stop(): void {
    this.click = null;
    this.clickUse = false;
    this.stopRequested = true;
  }

  setRunning(on: boolean): void {
    this.self.running = on;
  }

  /** Whether there is anything to simulate for yourself right now. */
  get active(): boolean {
    return this.self.path.length > 0 || this.click !== null || this.stopRequested;
  }

  /** Advance the prediction by fixed steps up to `now`; every step while active becomes an input for the server. */
  update(now: number): void {
    if (this.lastUpdate < 0) {
      this.lastUpdate = now;
      return;
    }
    const dt = Math.max(0, now - this.lastUpdate);
    this.lastUpdate = now;
    const decay = Math.pow(0.5, dt / SMOOTH_HALF_LIFE_MS);
    this.smooth.x *= decay;
    this.smooth.y *= decay;
    while (this.xpDrops.length > 0 && now - this.xpDrops[0]!.at > XP_DROP_MS) this.xpDrops.shift();
    if (!this.grid || this.selfId < 0) {
      this.accumulator = 0;
      return;
    }
    // After a pause (a hidden tab) do not burst a backlog of inputs at the server.
    this.accumulator = Math.min(this.accumulator + dt, STEP_MS * 3);
    while (this.accumulator >= STEP_MS) {
      this.accumulator -= STEP_MS;
      if (!this.active) {
        this.self.moving = false;
        continue;
      }
      const msg: InputMessage = { t: 'input', seq: ++this.seq };
      if (this.stopRequested) {
        msg.stop = true;
        this.stopRequested = false;
      } else if (this.click) {
        msg.to = [this.click.x, this.click.y];
        if (this.clickUse) msg.use = true;
        this.click = null;
        this.clickUse = false;
      }
      this.applyInput(this.grid, msg);
      this.pending.push({ msg, after: this.snapshotSelf() });
      if (this.pending.length > PENDING_CAP) this.pending.shift();
      this.onInput?.(msg);
    }
  }

  apply(msg: ServerMessage, now: number): void {
    if (msg.t === 'welcome') {
      this.tickMs = msg.tickMs;
      this.selfId = msg.id;
      this.chat.length = 0;
      this.bag = msg.bag;
      this.gear = msg.gear;
      this.stats = msg.stats;
      this.skills.clear();
      for (const [skill, xp] of msg.skills) this.skills.set(skill, xp);
      this.bank = null;
      this.xpDrops.length = 0;
      this.version++;
      this.enterZone(msg, now);
    } else if (msg.t === 'zone') {
      this.enterZone(msg, now);
    } else if (msg.t === 'tick') {
      this.applyTick(msg, now);
    } else if (msg.t === 'you') {
      this.applyYou(msg, now);
    }
  }

  /** A zone from scratch: its entities replace what was known, you stand where the server says, and input numbers continue from where it is. */
  private enterZone(msg: ZoneSnapshot, now: number): void {
    this.tick = msg.tick;
    this.zone = msg.zone;
    this.seq = msg.seq;
    this.entities.clear();
    this.items.clear();
    for (const [gid, item, qty, x, y] of msg.items) this.items.set(gid, { gid, item, qty, x, y });
    this.depleted.clear();
    for (const index of msg.nodes) this.depleted.add(index);
    if (this.bank !== null) {
      this.bank = null;
      this.version++;
    }
    this.pending = [];
    this.click = null;
    this.accumulator = 0;
    this.smooth = { x: 0, y: 0 };
    this.clockOffset = now - msg.tick * this.tickMs;
    for (const e of msg.entities) this.upsert(e, msg.tick);
    const me = msg.entities.find((e) => e.id === this.selfId);
    if (me) {
      this.place(me, me.dir);
      this.self.running = me.running;
      this.self.moving = false;
    }
  }

  /** Where to draw an entity at `now`: yourself as predicted, others interpolated a little behind the server. */
  positionAt(e: ReplicaEntity, now: number): Position {
    if (e.id === this.selfId) {
      const at = positionOf(this.self);
      return { x: at.x + this.smooth.x, y: at.y + this.smooth.y, dir: this.self.dir, moving: this.self.moving };
    }
    const h = e.history;
    if (h.length === 0) return { x: e.x, y: e.y, dir: e.dir, moving: e.moving };
    const t = this.renderTick(now);
    const last = h[h.length - 1]!;
    if (t >= last.tick) return { x: last.x, y: last.y, dir: last.dir, moving: last.moving && t - last.tick < 2 };
    const first = h[0]!;
    if (t <= first.tick) return { x: first.x, y: first.y, dir: first.dir, moving: first.moving };
    let i = h.length - 2;
    while (i > 0 && h[i]!.tick > t) i--;
    const a = h[i]!;
    const b = h[i + 1]!;
    const f = (t - a.tick) / (b.tick - a.tick);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, dir: b.dir, moving: a.moving || b.moving };
  }

  /** The latest line each entity said within BUBBLE_MS of `now`. */
  bubbles(now: number): ChatEntry[] {
    const seen = new Set<number>();
    const out: ChatEntry[] = [];
    for (let i = this.chat.length - 1; i >= 0; i--) {
      const line = this.chat[i]!;
      if (now - line.at > BUBBLE_MS) break;
      if (seen.has(line.id)) continue;
      seen.add(line.id);
      out.push(line);
    }
    return out;
  }

  /** The server tick being shown for other players at `now`. */
  renderTick(now: number): number {
    if (this.clockOffset === null) return this.tick;
    return (now - this.clockOffset) / this.tickMs - DELAY_TICKS;
  }

  private applyTick(delta: TickDelta, now: number): void {
    this.tick = delta.tick;
    const offset = now - delta.tick * this.tickMs;
    // An earlier arrival pulls the clock forward at once (we were showing too old a state); later ones push it back slowly.
    this.clockOffset = this.clockOffset === null || offset < this.clockOffset ? offset : this.clockOffset + (offset - this.clockOffset) * 0.05;
    for (const e of delta.joined) this.upsert(e, delta.tick);
    for (const id of delta.left) this.entities.delete(id);
    for (const [id, cx, cy, nx, ny, t, dir, moving, seq] of delta.moves) {
      const placement: Placement = { cx, cy, nx, ny, t };
      const e = this.entities.get(id);
      if (e) {
        const at = placed(placement);
        e.x = at.x;
        e.y = at.y;
        e.dir = dir;
        e.moving = moving === 1;
        e.history.push({ tick: delta.tick, x: at.x, y: at.y, dir, moving: moving === 1 });
        if (e.history.length > HISTORY_CAP) e.history.shift();
      }
      if (id === this.selfId) this.reconcile(placement, dir, seq);
    }
    for (const [id, x, y, dir] of delta.acts) {
      const e = this.entities.get(id);
      if (!e) continue;
      e.act = x >= 0 ? { x, y } : null;
      e.dir = dir;
      // Facing something is a state like any other, so others see the turn.
      e.history.push({ tick: delta.tick, x: e.x, y: e.y, dir, moving: false });
      if (e.history.length > HISTORY_CAP) e.history.shift();
      if (id === this.selfId) this.self.dir = dir;
    }
    for (const [index, depleted] of delta.nodes) {
      if (depleted === 1) this.depleted.add(index);
      else this.depleted.delete(index);
    }
    for (const [gid, item, qty, x, y] of delta.drops) this.items.set(gid, { gid, item, qty, x, y });
    for (const gid of delta.taken) this.items.delete(gid);
    for (const line of delta.chat) {
      this.chat.push({ id: line.id, name: this.entities.get(line.id)?.name ?? '?', text: line.text, at: now });
      if (this.chat.length > CHAT_LOG_CAP) this.chat.shift();
    }
  }

  private applyYou(you: YouDelta, now: number): void {
    if (you.bag) this.bag = you.bag;
    if (you.xp) {
      for (const [skill, xp] of you.xp) {
        const before = this.skills.get(skill) ?? 0;
        this.skills.set(skill, xp);
        if (xp > before) this.xpDrops.push({ skill, amount: xp - before, at: now });
      }
    }
    if (you.gear) this.gear = you.gear;
    if (you.stats) this.stats = you.stats;
    if (you.bank !== undefined) this.bank = you.bank;
    if (you.items) for (const [gid, item, qty, x, y] of you.items) this.items.set(gid, { gid, item, qty, x, y });
    if (you.bag || you.xp || you.gear || you.stats || you.bank !== undefined) this.version++;
    if (you.notes) for (const note of you.notes) this.onNote?.(note);
  }

  /** The server's placement after applying input `seq`, against the prediction we made for the same input. */
  private reconcile(server: Placement, dir: Dir, seq: number): void {
    const index = this.pending.findIndex((p) => p.msg.seq === seq);
    if (index < 0) {
      // Nothing of ours in flight: idle, or a move the server made on its own. Take its word.
      if (this.pending.length === 0) this.place(server, dir);
      return;
    }
    const at = this.pending[index]!;
    this.pending = this.pending.slice(index + 1);
    const predicted = positionOf(at.after);
    const truth = placed(server);
    if (Math.abs(predicted.x - truth.x) <= AGREE && Math.abs(predicted.y - truth.y) <= AGREE) return;
    const grid = this.grid;
    if (!grid) return;
    const shown = positionOf(this.self);
    shown.x += this.smooth.x;
    shown.y += this.smooth.y;
    this.place(server, dir, at.after.path);
    for (const p of this.pending) {
      this.applyInput(grid, p.msg);
      p.after = this.snapshotSelf();
    }
    const now = positionOf(this.self);
    this.smooth.x = shown.x - now.x;
    this.smooth.y = shown.y - now.y;
    if (Math.hypot(this.smooth.x, this.smooth.y) > SNAP_DISTANCE) this.smooth = { x: 0, y: 0 };
  }

  /**
   * Put yourself where the server says. The server sends only the cell being
   * walked into, so the rest of the way comes from `known`, the path we
   * predicted, when it runs through that cell.
   */
  private place(server: Placement, dir: Dir, known: Cell[] = []): void {
    this.self.cell = { x: server.cx, y: server.cy };
    this.self.t = server.t;
    this.self.dir = dir;
    if (server.nx < 0) {
      this.self.path = [];
      this.self.t = 0;
      return;
    }
    const index = known.findIndex((c) => c.x === server.nx && c.y === server.ny);
    this.self.path = index >= 0 ? known.slice(index) : [{ x: server.nx, y: server.ny }];
  }

  private applyInput(grid: Grid, msg: InputMessage): void {
    if (msg.stop) this.self.path = this.self.t > 0 ? this.self.path.slice(0, 1) : [];
    else if (msg.to) planWalk(grid, this.self, { x: msg.to[0], y: msg.to[1] });
    this.self.moving = step(grid, this.self);
  }

  private snapshotSelf(): Pending['after'] {
    return { cell: { ...this.self.cell }, t: this.self.t, dir: this.self.dir, path: this.self.path.map((c) => ({ ...c })) };
  }

  private upsert(e: EntitySnapshot, tick: number): void {
    const existing = this.entities.get(e.id);
    if (!existing) {
      const at = placed(e);
      this.entities.set(e.id, { id: e.id, name: e.name, x: at.x, y: at.y, dir: e.dir, running: e.running, moving: e.moving, act: e.act ? { x: e.act[0], y: e.act[1] } : null, history: [{ tick, x: at.x, y: at.y, dir: e.dir, moving: e.moving }] });
      return;
    }
    existing.name = e.name;
    existing.running = e.running;
  }
}
