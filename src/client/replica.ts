/**
 * The client's copy of the zone: the entities and where they stand, replayed
 * from the server's tick deltas on the client's own clock, one tick behind,
 * with positions interpolated between cells. Pure data and arithmetic: the
 * socket feeds it and the scene draws it.
 */
import type { EntitySnapshot, ServerMessage, TickDelta } from '@/net/protocol';
import type { Cell, Dir } from '@/world/grid';

export interface ReplicaEntity {
  id: number;
  name: string;
  /** The authoritative cell: where the entity ends up after its latest steps. */
  x: number;
  y: number;
  dir: Dir;
  running: boolean;
  /** Where it stood before those steps, and the cells walked through, shown from `moveAt` over one tick. */
  from: Cell;
  steps: Cell[];
  moveAt: number;
}

export interface ChatEntry {
  id: number;
  name: string;
  text: string;
  /** When the line shows, on the replica's clock. */
  at: number;
}

export interface Position {
  x: number;
  y: number;
  moving: boolean;
}

/** How long a line stays over a head. */
export const BUBBLE_MS = 4500;
const CHAT_LOG_CAP = 100;

export class Replica {
  tickMs = 300;
  /** Playback delay behind arrival, so network jitter does not show as stutter. */
  delayMs = 150;
  tick = 0;
  selfId = -1;
  zone = '';
  readonly entities = new Map<number, ReplicaEntity>();
  readonly chat: ChatEntry[] = [];
  /** When the delta for `tick` is shown; later ticks follow one tickMs apart. */
  private base: { tick: number; time: number } | null = null;

  get self(): ReplicaEntity | null {
    return this.entities.get(this.selfId) ?? null;
  }

  apply(msg: ServerMessage, now: number): void {
    if (msg.t === 'welcome') {
      this.tickMs = msg.tickMs;
      this.delayMs = Math.round(msg.tickMs / 2);
      this.tick = msg.tick;
      this.selfId = msg.id;
      this.zone = msg.zone;
      this.entities.clear();
      this.chat.length = 0;
      for (const e of msg.entities) this.upsert(e, now);
      this.base = { tick: msg.tick, time: now + this.delayMs };
    } else if (msg.t === 'tick') {
      this.applyTick(msg, now);
    }
  }

  /** Interpolated cell coordinates at `now`; fractional while walking. */
  positionAt(e: ReplicaEntity, now: number): Position {
    if (e.steps.length === 0) return { x: e.x, y: e.y, moving: false };
    const progress = (now - e.moveAt) / this.tickMs;
    if (progress <= 0) return { x: e.from.x, y: e.from.y, moving: false };
    if (progress >= 1) return { x: e.x, y: e.y, moving: false };
    const scaled = progress * e.steps.length;
    const index = Math.min(e.steps.length - 1, Math.floor(scaled));
    const f = scaled - index;
    const a = index === 0 ? e.from : e.steps[index - 1]!;
    const b = e.steps[index]!;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, moving: true };
  }

  /** The latest line each entity said within BUBBLE_MS of `now`. */
  bubbles(now: number): ChatEntry[] {
    const seen = new Set<number>();
    const out: ChatEntry[] = [];
    for (let i = this.chat.length - 1; i >= 0; i--) {
      const line = this.chat[i]!;
      if (now - line.at > BUBBLE_MS) break;
      if (line.at > now || seen.has(line.id)) continue;
      seen.add(line.id);
      out.push(line);
    }
    return out;
  }

  private applyTick(delta: TickDelta, now: number): void {
    const at = this.scheduleFor(delta.tick, now);
    this.tick = delta.tick;
    for (const e of delta.joined) this.upsert(e, at);
    for (const id of delta.left) this.entities.delete(id);
    for (const m of delta.moves) {
      const e = this.entities.get(m.id);
      if (!e || m.steps.length === 0) continue;
      e.from = { x: e.x, y: e.y };
      e.steps = m.steps.map(([x, y]) => ({ x, y }));
      const last = e.steps[e.steps.length - 1]!;
      e.x = last.x;
      e.y = last.y;
      e.dir = m.dir;
      e.moveAt = at;
    }
    for (const line of delta.chat) {
      this.chat.push({ id: line.id, name: this.entities.get(line.id)?.name ?? '?', text: line.text, at });
      if (this.chat.length > CHAT_LOG_CAP) this.chat.shift();
    }
  }

  /**
   * The moment the delta for `tick` starts showing. Ticks play on a steady
   * clock one tick apart; a delta that arrives too late to keep that clock
   * shifts it, and one that arrives far ahead of it pulls it back so we never
   * trail the server by more than a tick and a half.
   */
  private scheduleFor(tick: number, now: number): number {
    if (!this.base) this.base = { tick, time: now + this.delayMs };
    let at = this.base.time + (tick - this.base.tick) * this.tickMs;
    if (at < now) {
      this.base.time += now - at;
      at = now;
    }
    const latest = now + this.tickMs + this.delayMs;
    if (at > latest) {
      this.base.time -= at - latest;
      at = latest;
    }
    return at;
  }

  private upsert(e: EntitySnapshot, at: number): void {
    const existing = this.entities.get(e.id);
    if (!existing) {
      this.entities.set(e.id, { id: e.id, name: e.name, x: e.x, y: e.y, dir: e.dir, running: e.running, from: { x: e.x, y: e.y }, steps: [], moveAt: at });
      return;
    }
    existing.name = e.name;
    existing.running = e.running;
    if (existing.x !== e.x || existing.y !== e.y) {
      existing.x = e.x;
      existing.y = e.y;
      existing.from = { x: e.x, y: e.y };
      existing.steps = [];
      existing.dir = e.dir;
    }
  }
}
