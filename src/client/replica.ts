/**
 * The client's copy of the zone. Your own character is predicted: every
 * fixed step while a key is held or a path is being walked becomes an input
 * that is applied at once and sent to the server, and when the server's
 * position for that input comes back it is checked against the prediction
 * and replayed from there only if the two differ, with the difference faded
 * out instead of snapped. Everyone else is drawn a little behind the newest
 * server tick, interpolated between the positions the server sent. Pure data
 * and arithmetic: the socket feeds it and the scene draws it.
 */
import type { ClientMessage, EntitySnapshot, ServerMessage, TickDelta } from '@/net/protocol';
import type { Cell, Dir, Grid } from '@/world/grid';
import { type Input, type Mover, planWalk, step, STEP_MS } from '@/world/motion';

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
  /** What the server said and at which tick, oldest first; others are interpolated through it. */
  history: EntityState[];
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
const CHAT_LOG_CAP = 100;
const HISTORY_CAP = 64;
const PENDING_CAP = 64;
/** A prediction this close to the server's position counts as right (positions travel with three decimals). */
const AGREE = 0.002;
/** Ticks behind the newest server tick at which other players are drawn, so jitter has room. */
const DELAY_TICKS = 2;
/** Half-life of the visual offset that hides a correction of your own position. */
const SMOOTH_HALF_LIFE_MS = 60;
/** A correction larger than this is shown at once rather than faded. */
const SNAP_DISTANCE = 2;

interface Pending {
  msg: InputMessage;
  after: { x: number; y: number; dir: Dir; path: Cell[] };
}

export class Replica {
  tickMs = STEP_MS;
  tick = 0;
  selfId = -1;
  zone = '';
  readonly entities = new Map<number, ReplicaEntity>();
  readonly chat: ChatEntry[] = [];
  /** Receives every input the prediction generates, to be sent to the server. */
  onInput: ((msg: InputMessage) => void) | null = null;
  /** Your own character as predicted. */
  readonly self: Mover & { moving: boolean } = { x: 0, y: 0, dir: 0, running: false, path: [], moving: false };
  private grid: Grid | null = null;
  private input: Input = { dx: 0, dy: 0 };
  private click: Cell | null = null;
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

  /** Where you stand predicted, or null before the welcome. */
  setGrid(grid: Grid): void {
    this.grid = grid;
  }

  /** The direction keys held right now. */
  setInput(dx: -1 | 0 | 1, dy: -1 | 0 | 1): void {
    this.input = { dx, dy };
  }

  /** A click: the next input plans a walk there. */
  walkTo(cell: Cell): void {
    this.click = cell;
  }

  setRunning(on: boolean): void {
    this.self.running = on;
  }

  /** Whether there is anything to simulate for yourself right now. */
  get active(): boolean {
    return this.input.dx !== 0 || this.input.dy !== 0 || this.self.path.length > 0 || this.click !== null;
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
    if (!this.grid || this.selfId < 0) {
      this.accumulator = 0;
      return;
    }
    // After a pause (a hidden tab) do not burst a backlog of inputs at the server.
    this.accumulator = Math.min(this.accumulator + dt, STEP_MS * 3);
    while (this.accumulator >= STEP_MS) {
      this.accumulator -= STEP_MS;
      if (!this.active) continue;
      const msg: InputMessage = { t: 'input', seq: ++this.seq, dx: this.input.dx, dy: this.input.dy };
      if (this.click) {
        msg.to = [this.click.x, this.click.y];
        this.click = null;
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
      this.tick = msg.tick;
      this.selfId = msg.id;
      this.zone = msg.zone;
      this.seq = msg.seq;
      this.entities.clear();
      this.chat.length = 0;
      this.pending = [];
      this.click = null;
      this.smooth = { x: 0, y: 0 };
      this.clockOffset = now - msg.tick * msg.tickMs;
      for (const e of msg.entities) this.upsert(e, msg.tick);
      const me = this.entities.get(msg.id);
      if (me) {
        this.self.x = me.x;
        this.self.y = me.y;
        this.self.dir = me.dir;
        this.self.running = me.running;
        this.self.path = [];
        this.self.moving = false;
      }
    } else if (msg.t === 'tick') {
      this.applyTick(msg, now);
    }
  }

  /** Where to draw an entity at `now`: yourself as predicted, others interpolated a little behind the server. */
  positionAt(e: ReplicaEntity, now: number): Position {
    if (e.id === this.selfId) return { x: this.self.x + this.smooth.x, y: this.self.y + this.smooth.y, dir: this.self.dir, moving: this.self.moving };
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
    for (const [id, x, y, dir, moving, seq] of delta.moves) {
      const e = this.entities.get(id);
      if (e) {
        e.x = x;
        e.y = y;
        e.dir = dir;
        e.moving = moving === 1;
        e.history.push({ tick: delta.tick, x, y, dir, moving: moving === 1 });
        if (e.history.length > HISTORY_CAP) e.history.shift();
      }
      if (id === this.selfId) this.reconcile(x, y, dir, seq);
    }
    for (const line of delta.chat) {
      this.chat.push({ id: line.id, name: this.entities.get(line.id)?.name ?? '?', text: line.text, at: now });
      if (this.chat.length > CHAT_LOG_CAP) this.chat.shift();
    }
  }

  /** The server's position after applying input `seq`, against the prediction we made for the same input. */
  private reconcile(x: number, y: number, dir: Dir, seq: number): void {
    const index = this.pending.findIndex((p) => p.msg.seq === seq);
    if (index < 0) {
      // Nothing of ours in flight: idle, or a move the server made on its own. Take its word.
      if (this.pending.length === 0) {
        this.self.x = x;
        this.self.y = y;
        this.self.dir = dir;
      }
      return;
    }
    const at = this.pending[index]!;
    this.pending = this.pending.slice(index + 1);
    if (Math.abs(at.after.x - x) <= AGREE && Math.abs(at.after.y - y) <= AGREE) return;
    const grid = this.grid;
    if (!grid) return;
    const shownX = this.self.x + this.smooth.x;
    const shownY = this.self.y + this.smooth.y;
    this.self.x = x;
    this.self.y = y;
    this.self.dir = dir;
    this.self.path = [...at.after.path];
    for (const p of this.pending) {
      this.applyInput(grid, p.msg);
      p.after = this.snapshotSelf();
    }
    this.smooth.x = shownX - this.self.x;
    this.smooth.y = shownY - this.self.y;
    if (Math.hypot(this.smooth.x, this.smooth.y) > SNAP_DISTANCE) this.smooth = { x: 0, y: 0 };
  }

  private applyInput(grid: Grid, msg: InputMessage): void {
    if (msg.to) planWalk(grid, this.self, { x: msg.to[0], y: msg.to[1] });
    this.self.moving = step(grid, this.self, msg);
  }

  private snapshotSelf(): Pending['after'] {
    return { x: this.self.x, y: this.self.y, dir: this.self.dir, path: [...this.self.path] };
  }

  private upsert(e: EntitySnapshot, tick: number): void {
    const existing = this.entities.get(e.id);
    if (!existing) {
      this.entities.set(e.id, { id: e.id, name: e.name, x: e.x, y: e.y, dir: e.dir, running: e.running, moving: e.moving, history: [{ tick, x: e.x, y: e.y, dir: e.dir, moving: e.moving }] });
      return;
    }
    existing.name = e.name;
    existing.running = e.running;
  }
}
