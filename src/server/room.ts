/**
 * One zone as a room: who is in it, where they stand, where they are walking
 * and what they said. A pure simulation stepped by advance(); the socket
 * layer (server.ts) is a thin adapter around it, so it runs headless in
 * tests. Players never block one another; the static map decides where one
 * can stand.
 */
import type { ChatLine, EntitySnapshot, MoveDelta, TickDelta } from '@/net/protocol';
import type { ZoneMapDef } from '@/types/content';
import type { ZoneId } from '@/types/ids';
import { fail, ok, type Result } from '@/types/result';
import { type Cell, type Dir, dirOf, type Grid, inBounds, parseMap } from '@/world/grid';
import { findPath8, nearestReachable } from '@/world/path';

export interface RoomOptions {
  /** Ticks a dropped connection may stay in the world before its character leaves. */
  graceTicks: number;
  /** Most characters in the room at once. */
  capacity: number;
}

export interface RoomPlayer {
  id: number;
  name: string;
  x: number;
  y: number;
  dir: Dir;
  running: boolean;
  /** Cells still to walk, nearest first. */
  path: Cell[];
  connected: boolean;
  /** The tick at which the connection dropped; meaningful while not connected. */
  disconnectedAt: number;
}

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
    const player: RoomPlayer = { id: this.nextId++, name, x: spawn.x, y: spawn.y, dir: 0, running: false, path: [], connected: true, disconnectedAt: 0 };
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

  /** Walk towards a clicked cell, or as near to it as the map allows. False when there is nowhere to go. */
  move(id: number, x: number, y: number): boolean {
    const p = this.players.get(id);
    if (!p || !p.connected || !inBounds(this.grid, x, y)) return false;
    const goal = nearestReachable(this.grid, p, { x, y });
    if (!goal) return false;
    p.path = findPath8(this.grid, p, goal) ?? [];
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

  /** One tick: everyone with a path takes a step (two when running), lapsed characters leave, and the delta for the clients comes back. */
  advance(): TickDelta {
    this.tick += 1;
    const moves: MoveDelta[] = [];
    for (const p of [...this.players.values()]) {
      if (!p.connected && this.tick - p.disconnectedAt >= this.options.graceTicks) {
        this.remove(p.id);
        continue;
      }
      if (p.path.length === 0) continue;
      const steps: [number, number][] = [];
      for (let n = p.running ? 2 : 1; n > 0 && p.path.length > 0; n--) {
        const next = p.path.shift()!;
        p.dir = dirOf(next.x - p.x, next.y - p.y);
        p.x = next.x;
        p.y = next.y;
        steps.push([next.x, next.y]);
      }
      moves.push({ id: p.id, steps, dir: p.dir });
    }
    const delta: TickDelta = { tick: this.tick, joined: this.joined, left: this.left, moves, chat: this.said };
    this.joined = [];
    this.left = [];
    this.said = [];
    this.spoke.clear();
    return delta;
  }
}

function snapshotOf(p: RoomPlayer): EntitySnapshot {
  return { id: p.id, name: p.name, x: p.x, y: p.y, dir: p.dir, running: p.running };
}
