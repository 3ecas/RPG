/**
 * One zone as a room: who is in it, where they stand, where they are going
 * and what they said. A pure simulation stepped by advance(); the socket
 * layer (server.ts) is a thin adapter around it, so it runs headless in
 * tests. Movement is driven by the inputs clients send, one per step of the
 * shared motion model, so a client's prediction and the server's truth agree
 * exactly when nothing is lost. Players never block one another; the static
 * map decides where one can stand.
 */
import type { ChatLine, EntitySnapshot, MoveState, TickDelta } from '@/net/protocol';
import type { ZoneMapDef } from '@/types/content';
import type { ZoneId } from '@/types/ids';
import { fail, ok, type Result } from '@/types/result';
import { type Cell, type Grid, parseMap } from '@/world/grid';
import { type Mover, planWalk, step } from '@/world/motion';

export interface RoomOptions {
  /** Ticks a dropped connection may stay in the world before its character leaves. */
  graceTicks: number;
  /** Most characters in the room at once. */
  capacity: number;
}

export interface PlayerInput {
  seq: number;
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
  to?: Cell;
}

export interface RoomPlayer extends Mover {
  id: number;
  name: string;
  /** Whether the last tick moved it. */
  moving: boolean;
  /** The last input applied. */
  seq: number;
  inputs: PlayerInput[];
  connected: boolean;
  /** The tick at which the connection dropped; meaningful while not connected. */
  disconnectedAt: number;
}

/** Inputs waiting per player; more than this and the client is running ahead of the server. */
const MAX_QUEUED = 8;
/** Inputs applied per tick per player: one in the steady state, a few to catch up after a hiccup. */
const MAX_PER_TICK = 3;

export class Room {
  readonly grid: Grid;
  tick = 0;
  private readonly players = new Map<number, RoomPlayer>();
  private nextId = 1;
  private joined: EntitySnapshot[] = [];
  private left: number[] = [];
  private said: ChatLine[] = [];
  private readonly spoke = new Set<number>();

  constructor(readonly zoneId: ZoneId, map: ZoneMapDef, readonly options: RoomOptions) {
    this.grid = parseMap(map);
  }

  get size(): number {
    return this.players.size;
  }

  player(id: number): RoomPlayer | null {
    return this.players.get(id) ?? null;
  }

  snapshot(): EntitySnapshot[] {
    return [...this.players.values()].map(snapshotOf);
  }

  /** The player with this name, case-insensitively. */
  byName(name: string): RoomPlayer | null {
    const wanted = name.toLowerCase();
    for (const p of this.players.values()) if (p.name.toLowerCase() === wanted) return p;
    return null;
  }

  /**
   * A new connection under `name`. A dropped connection coming back under its
   * own name takes its character over; a name someone else is using is
   * refused. `resumed` says which happened.
   */
  join(name: string): Result<{ player: RoomPlayer; resumed: boolean }> {
    const existing = this.byName(name);
    if (existing) {
      if (existing.connected) return fail('That name is already in the world.');
      existing.connected = true;
      return ok({ player: existing, resumed: true });
    }
    if (this.players.size >= this.options.capacity) return fail('The world is full right now.');
    const { spawn } = this.grid;
    const player: RoomPlayer = {
      id: this.nextId++, name, x: spawn.x + 0.5, y: spawn.y + 0.5, dir: 0, running: false, path: [], moving: false, seq: 0, inputs: [], connected: true, disconnectedAt: 0,
    };
    this.players.set(player.id, player);
    this.joined.push(snapshotOf(player));
    return ok({ player, resumed: false });
  }

  /** The connection dropped: the character stands still and leaves after the grace period unless its player comes back. */
  disconnect(id: number): void {
    const p = this.players.get(id);
    if (!p || !p.connected) return;
    p.connected = false;
    p.disconnectedAt = this.tick;
    p.path = [];
    p.inputs = [];
  }

  /** A known player is back on a new connection. */
  reconnect(id: number): boolean {
    const p = this.players.get(id);
    if (!p) return false;
    p.connected = true;
    return true;
  }

  /** Leave at once. */
  remove(id: number): void {
    if (this.players.delete(id)) this.left.push(id);
  }

  /** One step's worth of intent from a client, applied on the next tick. False when it is stale, out of order or the queue is full. */
  queueInput(id: number, input: PlayerInput): boolean {
    const p = this.players.get(id);
    if (!p || !p.connected) return false;
    const newest = p.inputs.length > 0 ? p.inputs[p.inputs.length - 1]!.seq : p.seq;
    if (input.seq <= newest || p.inputs.length >= MAX_QUEUED) return false;
    p.inputs.push(input);
    return true;
  }

  setRunning(id: number, on: boolean): void {
    const p = this.players.get(id);
    if (p) p.running = on;
  }

  /** One line per player per tick; anything more is dropped. */
  chat(id: number, text: string): boolean {
    const p = this.players.get(id);
    if (!p || !p.connected || this.spoke.has(id)) return false;
    this.spoke.add(id);
    this.said.push({ id, text });
    return true;
  }

  /**
   * One tick: every player's queued inputs are applied (a few at most, so
   * nobody runs ahead), lapsed characters leave, and the delta for the clients
   * comes back: the state of everyone who moved or just stopped.
   */
  advance(): TickDelta {
    this.tick += 1;
    const moves: MoveState[] = [];
    for (const p of [...this.players.values()]) {
      if (!p.connected && this.tick - p.disconnectedAt >= this.options.graceTicks) {
        this.remove(p.id);
        continue;
      }
      const wasMoving = p.moving;
      let applied = 0;
      let moved = false;
      while (p.inputs.length > 0 && applied < MAX_PER_TICK) {
        const input = p.inputs.shift()!;
        if (input.to) planWalk(this.grid, p, input.to);
        if (step(this.grid, p, input)) moved = true;
        p.seq = input.seq;
        applied += 1;
      }
      p.moving = moved;
      if (applied > 0 || wasMoving) moves.push([p.id, round(p.x), round(p.y), p.dir, moved ? 1 : 0, p.seq]);
    }
    const delta: TickDelta = { tick: this.tick, joined: this.joined, left: this.left, moves, chat: this.said };
    this.joined = [];
    this.left = [];
    this.said = [];
    this.spoke.clear();
    return delta;
  }
}

/** Positions travel with three decimals: a thousandth of a cell is invisible and keeps the ticks small. */
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function snapshotOf(p: RoomPlayer): EntitySnapshot {
  return { id: p.id, name: p.name, x: round(p.x), y: round(p.y), dir: p.dir, running: p.running, moving: p.moving };
}
