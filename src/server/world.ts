/**
 * Every zone of the game as rooms on one tick, and the characters moving
 * between them. The world knows which room a character is in, finds one by
 * name wherever it stands, puts a character where its record says (or on
 * the spawn of the starting zone), and carries one that steps onto an exit
 * to the matching entrance of the next zone. Still a pure simulation: no
 * socket and no store in here.
 */
import type { Registry } from '@/core/registry';
import { randomSeed, Rng } from '@/core/rng';
import type { TickDelta, YouDelta, ZoneSnapshot } from '@/net/protocol';
import type { EquipSlot, ZoneId } from '@/types/ids';
import type { Result } from '@/types/result';
import type { CharacterRecord } from './character';
import { type BankCommand, type FireCommand, type PlayerInput, Room, type RoomPlayer, type RoomRules } from './room';
import { stateOf } from './state';

export interface WorldOptions {
  /** Where characters that have never stood anywhere, or whose zone no longer exists, start. */
  startZone: ZoneId;
  graceTicks: number;
  /** Most characters per room at once. */
  capacity: number;
  /** The seed of the dice; random when not given. */
  seed?: number;
  rules?: Partial<RoomRules>;
}

export interface Transfer {
  player: RoomPlayer;
  from: ZoneId;
  to: ZoneId;
}

/** One tick of the whole world. */
export interface WorldTick {
  deltas: Map<ZoneId, TickDelta>;
  /** Who changed zone this tick; they are in `left` of the old room's delta and stand in the new room. */
  moved: Transfer[];
  /** Who left the world for good this tick (a dropped connection whose grace ran out). */
  gone: number[];
}

/** Added to a character's input number when it changes zone, so steps its client had already sent for the old zone are refused as stale. */
export const SEQ_GAP = 1000;

export class World {
  readonly rooms = new Map<ZoneId, Room>();
  private readonly zones = new Map<number, ZoneId>();
  private nextId = 1;

  constructor(content: Registry, readonly options: WorldOptions) {
    const ids = () => this.nextId++;
    const seed = options.seed ?? randomSeed();
    content.zoneIds.forEach((zoneId, i) => {
      this.rooms.set(zoneId, new Room(zoneId, content.map(zoneId), { graceTicks: options.graceTicks, capacity: options.capacity, ids, content, rng: new Rng(seed + i * 7919), rules: options.rules }));
    });
    if (!this.rooms.has(options.startZone)) throw new Error(`Unknown start zone: ${options.startZone}`);
  }

  room(zone: ZoneId): Room {
    const room = this.rooms.get(zone);
    if (!room) throw new Error(`Unknown zone: ${zone}`);
    return room;
  }

  /** The zone a character stands in, if it is in the world. */
  zoneOf(id: number): ZoneId | null {
    return this.zones.get(id) ?? null;
  }

  roomOf(id: number): Room | null {
    const zone = this.zones.get(id);
    return zone ? this.room(zone) : null;
  }

  player(id: number): RoomPlayer | null {
    return this.roomOf(id)?.player(id) ?? null;
  }

  /** Everyone in the world, connected or in their grace period. */
  players(): RoomPlayer[] {
    const out: RoomPlayer[] = [];
    for (const room of this.rooms.values()) out.push(...room.players());
    return out;
  }

  get size(): number {
    return this.zones.size;
  }

  /** The player with this name wherever it stands, case-insensitively. */
  byName(name: string): RoomPlayer | null {
    for (const room of this.rooms.values()) {
      const found = room.byName(name);
      if (found) return found;
    }
    return null;
  }

  /**
   * A saved or new character comes into the world: in its zone at its cell
   * when it can stand there, else on that zone's spawn; a zone that no
   * longer exists means the spawn of the starting zone.
   */
  enter(record: CharacterRecord): Result<RoomPlayer> {
    const known = this.rooms.get(record.zone);
    const room = known ?? this.room(this.options.startZone);
    const placed = room.enter(record, known ? { x: record.x, y: record.y } : null);
    if (placed.ok) this.zones.set(placed.value.id, room.zoneId);
    return placed;
  }

  /** The record to save for a character as it stands now: mid-step, in the nearer of the two cells. Null once it has left the world. */
  recordOf(player: RoomPlayer, now: number): CharacterRecord | null {
    const zone = this.zones.get(player.id);
    if (!zone) return null;
    const next = player.path[0];
    const cell = next && player.t >= 0.5 ? next : player.cell;
    return { name: player.name, secretHash: player.secretHash, createdAt: player.createdAt, dir: player.dir, running: player.running, state: stateOf(player), zone, x: cell.x, y: cell.y, lastSeenAt: now };
  }

  /** The zone a character stands in, as its client should first see it. */
  snapshotFor(id: number): ZoneSnapshot | null {
    return this.roomOf(id)?.snapshotFor(id) ?? null;
  }

  youOf(id: number): ReturnType<Room['youOf']> {
    return this.roomOf(id)?.youOf(id) ?? null;
  }

  drop(id: number, slot: number): boolean {
    return this.roomOf(id)?.drop(id, slot) ?? false;
  }

  bank(id: number, command: BankCommand): boolean {
    return this.roomOf(id)?.bank(id, command) ?? false;
  }

  equip(id: number, slot: number): boolean {
    return this.roomOf(id)?.equip(id, slot) ?? false;
  }

  unequip(id: number, slot: EquipSlot): boolean {
    return this.roomOf(id)?.unequip(id, slot) ?? false;
  }

  acceptQuest(id: number, questId: string): boolean {
    return this.roomOf(id)?.acceptQuest(id, questId) ?? false;
  }

  abandonQuest(id: number, questId: string): boolean {
    return this.roomOf(id)?.abandonQuest(id, questId) ?? false;
  }

  fire(id: number, command: FireCommand): boolean {
    return this.roomOf(id)?.fire(id, command) ?? false;
  }

  cook(id: number, recipe: string, qty: number): boolean {
    return this.roomOf(id)?.cook(id, recipe, qty) ?? false;
  }

  /** Everyone's private events since the last call, wherever they stand. */
  takeYou(): Map<number, YouDelta> {
    const out = new Map<number, YouDelta>();
    for (const room of this.rooms.values()) for (const [id, delta] of room.takeYou()) out.set(id, delta);
    return out;
  }

  disconnect(id: number): void {
    this.roomOf(id)?.disconnect(id);
  }

  reconnect(id: number): boolean {
    return this.roomOf(id)?.reconnect(id) ?? false;
  }

  queueInput(id: number, input: PlayerInput): boolean {
    return this.roomOf(id)?.queueInput(id, input) ?? false;
  }

  setRunning(id: number, on: boolean): void {
    this.roomOf(id)?.setRunning(id, on);
  }

  chat(id: number, text: string): boolean {
    return this.roomOf(id)?.chat(id, text) ?? false;
  }

  /** One tick everywhere, then everyone who stepped onto an exit is stood on the matching entrance of the next zone. */
  advance(): WorldTick {
    const deltas = new Map<ZoneId, TickDelta>();
    for (const room of this.rooms.values()) deltas.set(room.zoneId, room.advance());
    const moved: Transfer[] = [];
    for (const room of this.rooms.values()) {
      for (const { player, to } of room.takeDepartures()) {
        const next = this.room(to);
        player.seq += SEQ_GAP;
        next.admit(player, next.entrance(room.zoneId));
        this.zones.set(player.id, to);
        moved.push({ player, from: room.zoneId, to });
      }
    }
    const movedIds = new Set(moved.map((m) => m.player.id));
    const gone: number[] = [];
    for (const delta of deltas.values()) {
      for (const id of delta.left) {
        if (movedIds.has(id)) continue;
        this.zones.delete(id);
        gone.push(id);
      }
    }
    return { deltas, moved, gone };
  }
}
