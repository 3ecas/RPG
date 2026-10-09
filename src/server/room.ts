/**
 * One zone as a room: who is in it, where they stand, where they are going
 * and what they said. A pure simulation stepped by advance(); the socket
 * layer (server.ts) is a thin adapter around it, so it runs headless in
 * tests. Movement is driven by the inputs clients send, one per step of the
 * shared motion model, so a client's prediction and the server's truth agree
 * exactly when nothing is lost. Players never block one another; the static
 * map decides where one can stand. A step onto an exit cell takes the player
 * out of the room; the world (world.ts) carries it into the next one.
 */
import type { ChatLine, EntitySnapshot, MoveState, Placement, TickDelta } from '@/net/protocol';
import type { ZoneMapDef } from '@/types/content';
import type { ZoneId } from '@/types/ids';
import { fail, ok, type Result } from '@/types/result';
import { type Cell, type Grid, isWalkable, parseMap } from '@/world/grid';
import { type Mover, planWalk, step } from '@/world/motion';
import type { Character } from './character';

export interface RoomOptions {
  /** Ticks a dropped connection may stay in the world before its character leaves. */
  graceTicks: number;
  /** Most characters in the room at once. */
  capacity: number;
  /** Where new ids come from. A world running several rooms shares one, so ids are unique across zones. */
  ids?: () => number;
}

export interface PlayerInput {
  seq: number;
  /** A clicked cell to walk to, planned before this step is taken. */
  to?: Cell;
}

export interface RoomPlayer extends Mover, Character {
  id: number;
  /** Whether the last tick moved it. */
  moving: boolean;
  /** The last input applied. */
  seq: number;
  inputs: PlayerInput[];
  connected: boolean;
  /** The tick at which the connection dropped; meaningful while not connected. */
  disconnectedAt: number;
}

/** A player who stepped onto an exit this tick: no longer in the room, bound for `to`. */
export interface Departure {
  player: RoomPlayer;
  to: ZoneId;
}

/** Inputs waiting per player; more than this and the client is running ahead of the server. */
const MAX_QUEUED = 8;
/** Inputs applied per tick per player: one in the steady state, a few to catch up after a hiccup. */
const MAX_PER_TICK = 3;

export class Room {
  readonly grid: Grid;
  tick = 0;
  private readonly byId = new Map<number, RoomPlayer>();
  private readonly ids: () => number;
  private nextId = 1;
  private joined: EntitySnapshot[] = [];
  private left: number[] = [];
  private said: ChatLine[] = [];
  private readonly spoke = new Set<number>();
  private departures: Departure[] = [];
  /** The zone each exit cell leads to, by cell index. */
  private readonly exits = new Map<number, ZoneId>();

  constructor(readonly zoneId: ZoneId, map: ZoneMapDef, readonly options: RoomOptions) {
    this.grid = parseMap(map);
    this.ids = options.ids ?? (() => this.nextId++);
    for (const obj of this.grid.objects) if (obj.def.kind === 'exit') this.exits.set(obj.y * this.grid.width + obj.x, obj.def.zone);
  }

  get size(): number {
    return this.byId.size;
  }

  player(id: number): RoomPlayer | null {
    return this.byId.get(id) ?? null;
  }

  players(): RoomPlayer[] {
    return [...this.byId.values()];
  }

  snapshot(): EntitySnapshot[] {
    return this.players().map(snapshotOf);
  }

  /** The player with this name, case-insensitively. */
  byName(name: string): RoomPlayer | null {
    const wanted = name.toLowerCase();
    for (const p of this.byId.values()) if (p.name.toLowerCase() === wanted) return p;
    return null;
  }

  /**
   * A character comes into the room on a new connection: standing at `at`
   * when one can stand there, else on the spawn. Announced on the next tick.
   * Whether the name is free is the world's question; a full room refuses.
   */
  enter(character: Character, at: Cell | null): Result<RoomPlayer> {
    if (this.byId.size >= this.options.capacity) return fail('The world is full right now.');
    const cell = at && isWalkable(this.grid, at.x, at.y) ? { x: at.x, y: at.y } : { ...this.grid.spawn };
    const player: RoomPlayer = {
      name: character.name, secretHash: character.secretHash, createdAt: character.createdAt, state: character.state, dir: character.dir, running: character.running,
      id: this.ids(), cell, t: 0, path: [], moving: false, seq: 0, inputs: [], connected: true, disconnectedAt: 0,
    };
    this.byId.set(player.id, player);
    this.joined.push(snapshotOf(player));
    return ok(player);
  }

  /** A character arriving from another room, keeping its id and connection: it stands on `at` with nothing planned. */
  admit(player: RoomPlayer, at: Cell): void {
    player.cell = { x: at.x, y: at.y };
    player.t = 0;
    player.path = [];
    player.inputs = [];
    player.moving = false;
    this.byId.set(player.id, player);
    this.joined.push(snapshotOf(player));
  }

  /** The cell to arrive on when coming from `from`: the exit that leads back there, else the spawn. */
  entrance(from: ZoneId): Cell {
    for (const [index, zone] of this.exits) if (zone === from) return { x: index % this.grid.width, y: Math.floor(index / this.grid.width) };
    return { ...this.grid.spawn };
  }

  /** Where this cell leads, if it is an exit. */
  exitAt(cell: Cell): ZoneId | null {
    return this.exits.get(cell.y * this.grid.width + cell.x) ?? null;
  }

  /** The players who stepped onto an exit since the last call. They have already left the room. */
  takeDepartures(): Departure[] {
    const out = this.departures;
    this.departures = [];
    return out;
  }

  /** The connection dropped: the character stands still and leaves after the grace period unless its player comes back. */
  disconnect(id: number): void {
    const p = this.byId.get(id);
    if (!p || !p.connected) return;
    p.connected = false;
    p.disconnectedAt = this.tick;
    // No more inputs will come to finish the walk: stand in the nearer of the two cells.
    const next = p.path[0];
    if (next && p.t >= 0.5) p.cell = next;
    p.t = 0;
    p.path = [];
    p.inputs = [];
  }

  /** A known player is back on a new connection. */
  reconnect(id: number): boolean {
    const p = this.byId.get(id);
    if (!p) return false;
    p.connected = true;
    return true;
  }

  /** Leave at once. */
  remove(id: number): void {
    if (this.byId.delete(id)) this.left.push(id);
  }

  /** One step from a client, with a clicked cell when there is one, applied on the next tick. False when it is stale, out of order or the queue is full. */
  queueInput(id: number, input: PlayerInput): boolean {
    const p = this.byId.get(id);
    if (!p || !p.connected) return false;
    const newest = p.inputs.length > 0 ? p.inputs[p.inputs.length - 1]!.seq : p.seq;
    if (input.seq <= newest || p.inputs.length >= MAX_QUEUED) return false;
    p.inputs.push(input);
    return true;
  }

  setRunning(id: number, on: boolean): void {
    const p = this.byId.get(id);
    if (p) p.running = on;
  }

  /** One line per player per tick; anything more is dropped. */
  chat(id: number, text: string): boolean {
    const p = this.byId.get(id);
    if (!p || !p.connected || this.spoke.has(id)) return false;
    this.spoke.add(id);
    this.said.push({ id, text });
    return true;
  }

  /**
   * One tick: every player's queued inputs are applied (a few at most, so
   * nobody runs ahead), lapsed characters leave, players who stepped onto an
   * exit leave for the next zone, and the delta for the clients comes back:
   * the state of everyone who moved or just stopped.
   */
  advance(): TickDelta {
    this.tick += 1;
    const moves: MoveState[] = [];
    for (const p of this.players()) {
      if (!p.connected && this.tick - p.disconnectedAt >= this.options.graceTicks) {
        this.remove(p.id);
        continue;
      }
      const wasMoving = p.moving;
      const fromX = p.cell.x;
      const fromY = p.cell.y;
      let applied = 0;
      let moved = false;
      while (p.inputs.length > 0 && applied < MAX_PER_TICK) {
        const input = p.inputs.shift()!;
        if (input.to) planWalk(this.grid, p, input.to);
        if (step(this.grid, p)) moved = true;
        p.seq = input.seq;
        applied += 1;
      }
      p.moving = moved;
      if (p.cell.x !== fromX || p.cell.y !== fromY) {
        const to = this.exitAt(p.cell);
        if (to) {
          this.remove(p.id);
          this.departures.push({ player: p, to });
          continue;
        }
      }
      if (applied > 0 || wasMoving) {
        const at = placementOf(p);
        moves.push([p.id, at.cx, at.cy, at.nx, at.ny, at.t, p.dir, moved ? 1 : 0, p.seq]);
      }
    }
    const delta: TickDelta = { tick: this.tick, joined: this.joined, left: this.left, moves, chat: this.said };
    this.joined = [];
    this.left = [];
    this.said = [];
    this.spoke.clear();
    return delta;
  }
}

/** The cell, the cell being walked into (or -1, -1) and the progress with three decimals: a thousandth of a cell is invisible. */
export function placementOf(p: RoomPlayer): Placement {
  const next = p.t > 0 ? p.path[0] : undefined;
  return { cx: p.cell.x, cy: p.cell.y, nx: next ? next.x : -1, ny: next ? next.y : -1, t: next ? Math.round(p.t * 1000) / 1000 : 0 };
}

function snapshotOf(p: RoomPlayer): EntitySnapshot {
  return { ...placementOf(p), id: p.id, name: p.name, dir: p.dir, running: p.running, moving: p.moving };
}
