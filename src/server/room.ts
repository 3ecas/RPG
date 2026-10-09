/**
 * One zone as a room: who is in it, where they stand, where they are going,
 * what they are working on, what lies on the ground and what they said. A
 * pure simulation stepped by advance(); the socket layer (server.ts) is a
 * thin adapter around it, so it runs headless in tests.
 *
 * Movement is driven by the inputs clients send, one per step of the shared
 * motion model, so a client's prediction and the server's truth agree
 * exactly when nothing is lost. A click can also carry an intent: once the
 * walk ends beside the thing clicked, the room acts on it: a gather node is
 * worked on every action tick with a roll by level and tool, an item is
 * picked up, the bank opens. Nodes are shared and can empty for everyone;
 * dropped items belong to their owner for a while, then to anyone, then go.
 * Players never block one another; the static map decides where one can
 * stand. A step onto an exit cell takes the player out of the room; the
 * world (world.ts) carries it into the next one.
 */
import { CONTENT } from '@/content';
import { STARTING_KIT } from '@/content/starting-kit';
import { Registry } from '@/core/registry';
import { randomSeed, Rng } from '@/core/rng';
import type { ActState, BagView, ChatLine, ClientMessage, EntitySnapshot, GearView, GroundItemView, MoveState, Placement, StackView, StatsView, TickDelta, YouDelta, ZoneSnapshot } from '@/net/protocol';
import type { EquipInfo, GatherNodeDef, ItemDef, ItemStack, ZoneMapDef } from '@/types/content';
import { EQUIP_SLOTS, type EquipSlot, type ItemId, type NodeId, type SkillId, type ZoneId } from '@/types/ids';
import { fail, ok, type Result } from '@/types/result';
import { addToBag, addToStacks, type Bag, countInStacks, freeSlots, roomFor, takeFromSlot, takeFromStacks } from '@/world/bag';
import { type Cell, dirOf, type Grid, isWalkable, objectAt, parseMap, type PlacedObject } from '@/world/grid';
import { type Mover, planWalk, step, STEP_MS } from '@/world/motion';
import { gatherChance, levelForTier, levelOf, MAX_XP } from '@/world/skills';
import { type CharacterStats, deriveStats, regenInterval, slotsFor } from '@/world/stats';
import { type Character, keyOf } from './character';
import { type Gear, parseState, type PlayerState } from './state';

/** What the room needs to know about content. The registry satisfies it. */
export interface RoomContent {
  node(id: NodeId): GatherNodeDef;
  item(id: ItemId): ItemDef;
  hasItem(id: string): id is ItemId;
  skill(id: SkillId): { name: string };
  readonly skillIds: SkillId[];
}

export interface RoomRules {
  /** Steps between two tries at a skill action: twelve, so 600 ms. */
  actionSteps: number;
  /** Steps until an item you dropped shows to everyone, and until it is gone. */
  itemPublicSteps: number;
  itemGoneSteps: number;
}

export const DEFAULT_RULES: RoomRules = { actionSteps: 12, itemPublicSteps: 60_000 / STEP_MS, itemGoneSteps: 180_000 / STEP_MS };

export interface RoomOptions {
  /** Ticks a dropped connection may stay in the world before its character leaves. */
  graceTicks: number;
  /** Most characters in the room at once. */
  capacity: number;
  /** Where new ids come from. A world running several rooms shares one, so ids are unique across zones. */
  ids?: () => number;
  content?: RoomContent;
  /** The dice for gathering and depletion; seeded in tests. */
  rng?: Rng;
  rules?: Partial<RoomRules>;
  /** What a brand new character starts with. */
  kit?: readonly Readonly<ItemStack>[];
}

export interface PlayerInput {
  seq: number;
  /** A clicked cell to walk to, planned before this step is taken. */
  to?: Cell;
  /** The click was on something to use once there. */
  use?: boolean;
  /** Halt at the next whole cell and forget what was planned. */
  stop?: boolean;
}

export interface GatherAction {
  kind: 'gather';
  /** Index of the node among the map's objects. */
  object: number;
  cell: Cell;
}

/** Private events for a player's client, flushed with the next tick. */
interface YouPending {
  bag: boolean;
  bank: boolean;
  gear: boolean;
  stats: boolean;
  xp: [SkillId, number][];
  items: GroundItemView[];
  notes: string[];
}

export interface RoomPlayer extends Mover, PlayerState {
  id: number;
  name: string;
  secretHash: string;
  createdAt: number;
  /** Whether the last tick moved it. */
  moving: boolean;
  /** The last input applied. */
  seq: number;
  inputs: PlayerInput[];
  connected: boolean;
  /** The tick at which the connection dropped; meaningful while not connected. */
  disconnectedAt: number;
  /** The clicked cell to use something at once the walk ends, or null. */
  intent: Cell | null;
  action: GatherAction | null;
  nextActionAt: number;
  /** When the next point of hit points and of mana comes back. */
  nextHpAt: number;
  nextManaAt: number;
  bankOpen: boolean;
  you: YouPending;
}

/** A player who stepped onto an exit this tick: no longer in the room, bound for `to`. */
export interface Departure {
  player: RoomPlayer;
  to: ZoneId;
}

export interface GroundItem {
  gid: number;
  itemId: ItemId;
  qty: number;
  x: number;
  y: number;
  /** The character key of who dropped it, or null for anyone's. */
  owner: string | null;
  /** The tick from which everyone sees it, and the tick it is gone. */
  publicAt: number;
  goneAt: number;
}

export type BankCommand = Extract<ClientMessage, { t: 'bank' }>;

/** Inputs waiting per player; more than this and the client is running ahead of the server. */
const MAX_QUEUED = 8;
/** Inputs applied per tick per player: one in the steady state, a few to catch up after a hiccup. */
const MAX_PER_TICK = 3;
/** Skills that need a tool in the bag, and what it is called. */
const TOOL_FOR: Partial<Record<SkillId, string>> = { lumberjack: 'hatchet', mining: 'pickaxe' };
const BAG_FULL = 'Your bag is full.';
const CANT_REACH = "You can't reach that from here.";

let defaultContent: Registry | null = null;

export class Room {
  readonly grid: Grid;
  readonly rules: RoomRules;
  tick = 0;
  private readonly content: RoomContent;
  private readonly rng: Rng;
  private readonly kit: readonly Readonly<ItemStack>[];
  private readonly byId = new Map<number, RoomPlayer>();
  private readonly ids: () => number;
  private nextId = 1;
  private nextGid = 1;
  private joined: EntitySnapshot[] = [];
  private left: number[] = [];
  private said: ChatLine[] = [];
  private acts: ActState[] = [];
  private nodeEvents: [number, 0 | 1][] = [];
  private drops: GroundItemView[] = [];
  private taken: number[] = [];
  private readonly spoke = new Set<number>();
  private departures: Departure[] = [];
  /** The zone each exit cell leads to, by cell index. */
  private readonly exits = new Map<number, ZoneId>();
  /** Emptied nodes by object index, and the tick each comes back. */
  private readonly depleted = new Map<number, number>();
  private readonly items = new Map<number, GroundItem>();

  constructor(readonly zoneId: ZoneId, map: ZoneMapDef, readonly options: RoomOptions) {
    this.grid = parseMap(map);
    this.rules = { ...DEFAULT_RULES, ...options.rules };
    this.content = options.content ?? (defaultContent ??= new Registry(CONTENT));
    this.rng = options.rng ?? new Rng(randomSeed());
    this.kit = options.kit ?? STARTING_KIT.items;
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

  /** The zone as this player first sees it: everyone, the items it may see, the empty nodes. */
  snapshotFor(id: number): ZoneSnapshot | null {
    const p = this.byId.get(id);
    if (!p) return null;
    return { zone: this.zoneId, tick: this.tick, entities: this.snapshot(), items: this.itemsFor(p), nodes: [...this.depleted.keys()], seq: p.seq };
  }

  /** What only this player gets on joining: its bag, skills, gear and numbers. */
  youOf(id: number): { bag: BagView; skills: [SkillId, number][]; gear: GearView; stats: StatsView } | null {
    const p = this.byId.get(id);
    if (!p) return null;
    return { bag: bagView(p.bag), skills: this.content.skillIds.map((s) => [s, p.skills[s]]), gear: gearView(p.gear), stats: this.statsView(p) };
  }

  /** A character's numbers from its levels and gear. */
  statsOf(p: RoomPlayer): CharacterStats {
    const worn: EquipInfo[] = [];
    for (const slot of EQUIP_SLOTS) {
      const item = p.gear[slot];
      const equip = item ? this.content.item(item.itemId).equip : undefined;
      if (equip) worn.push(equip);
    }
    return deriveStats((skill) => levelOf(p.skills[skill]), worn);
  }

  private statsView(p: RoomPlayer): StatsView {
    const stats = this.statsOf(p);
    return { hp: p.hp, maxHp: stats.maxHp, mana: p.mana, maxMana: stats.maxMana, armor: stats.armor, attack: stats.attack, spellPower: stats.spellPower };
  }

  /** Hit points and mana never exceed their maximums, which gear and levels move. */
  private clampPoints(p: RoomPlayer): void {
    const stats = this.statsOf(p);
    p.hp = Math.min(p.hp, stats.maxHp);
    p.mana = Math.min(p.mana, stats.maxMana);
  }

  /** The player with this name, case-insensitively. */
  byName(name: string): RoomPlayer | null {
    const wanted = name.toLowerCase();
    for (const p of this.byId.values()) if (p.name.toLowerCase() === wanted) return p;
    return null;
  }

  /** An item on the ground, if it is still there. */
  groundItem(gid: number): GroundItem | null {
    return this.items.get(gid) ?? null;
  }

  /** Whether a node is empty right now. */
  isDepleted(objectIndex: number): boolean {
    return this.depleted.has(objectIndex);
  }

  /**
   * A character comes into the room on a new connection: standing at `at`
   * when one can stand there, else on the spawn. Announced on the next tick.
   * Whether the name is free is the world's question; a full room refuses.
   */
  enter(character: Character, at: Cell | null): Result<RoomPlayer> {
    if (this.byId.size >= this.options.capacity) return fail('The world is full right now.');
    const cell = at && isWalkable(this.grid, at.x, at.y) ? { x: at.x, y: at.y } : { ...this.grid.spawn };
    const state = parseState(character.state, this.content, this.kit);
    const player: RoomPlayer = {
      name: character.name, secretHash: character.secretHash, createdAt: character.createdAt, dir: character.dir, running: character.running,
      skills: state.skills, bag: state.bag, bank: state.bank, gear: state.gear, hp: state.hp, mana: state.mana,
      id: this.ids(), cell, t: 0, path: [], moving: false, seq: 0, inputs: [], connected: true, disconnectedAt: 0,
      intent: null, action: null, nextActionAt: 0, nextHpAt: this.tick, nextManaAt: this.tick, bankOpen: false, you: pending(),
    };
    this.clampPoints(player);
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
    player.intent = null;
    player.action = null;
    player.bankOpen = false;
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

  /** Each player's private events since the last call, for their clients. */
  takeYou(): Map<number, YouDelta> {
    const out = new Map<number, YouDelta>();
    for (const p of this.byId.values()) {
      const y = p.you;
      if (!y.bag && !y.bank && !y.gear && !y.stats && y.xp.length === 0 && y.items.length === 0 && y.notes.length === 0) continue;
      const delta: YouDelta = {};
      if (y.bag) delta.bag = bagView(p.bag);
      if (y.gear) delta.gear = gearView(p.gear);
      if (y.stats) delta.stats = this.statsView(p);
      if (y.bank) delta.bank = p.bankOpen ? stacksView(p.bank) : null;
      if (y.xp.length > 0) delta.xp = y.xp;
      if (y.items.length > 0) delta.items = y.items;
      if (y.notes.length > 0) delta.notes = y.notes;
      out.set(p.id, delta);
      p.you = pending();
    }
    return out;
  }

  /** The connection dropped: the character stands still, stops what it was doing, and leaves after the grace period unless its player comes back. */
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
    p.intent = null;
    this.stopAction(p);
    this.closeBank(p);
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

  /** Puts a bag slot on the ground where the player stands, theirs alone to see for a while. */
  drop(id: number, slot: number): boolean {
    const p = this.byId.get(id);
    if (!p || !p.connected) return false;
    const stack = p.bag[slot];
    if (!stack) return false;
    takeFromSlot(p.bag, slot, stack.qty);
    p.you.bag = true;
    const item: GroundItem = { gid: this.nextGid++, itemId: stack.itemId, qty: stack.qty, x: p.cell.x, y: p.cell.y, owner: keyOf(p.name), publicAt: this.tick + this.rules.itemPublicSteps, goneAt: this.tick + this.rules.itemGoneSteps };
    this.items.set(item.gid, item);
    p.you.items.push(itemView(item));
    return true;
  }

  /** Wears or wields the item in a bag slot; whatever was in that gear slot goes to the bag in its place. */
  equip(id: number, slot: number): boolean {
    const p = this.byId.get(id);
    if (!p || !p.connected) return false;
    const stack = p.bag[slot];
    if (!stack) return false;
    const def = this.content.item(stack.itemId);
    const equip = def.equip;
    if (!equip) {
      this.note(p, `You can't wear the ${def.name.toLowerCase()}.`);
      return false;
    }
    const verb = equip.kind === 'weapon' || equip.kind === 'book' ? 'wield' : 'wear';
    for (const req of equip.requirements ?? []) {
      const need = levelForTier(req.tier);
      if (levelOf(p.skills[req.skill]) < need) {
        this.note(p, `You need ${this.content.skill(req.skill).name} level ${need} to ${verb} the ${def.name.toLowerCase()}.`);
        return false;
      }
    }
    const slots = slotsFor(equip.kind);
    const target = slots.find((s) => !p.gear[s]) ?? slots[0]!;
    const previous = p.gear[target];
    if (previous && stack.qty > 1 && freeSlots(p.bag) === 0) {
      this.note(p, BAG_FULL);
      return false;
    }
    takeFromSlot(p.bag, slot, 1);
    p.gear[target] = { itemId: stack.itemId, qty: 1 };
    // What was worn takes the slot the new piece came from, when that slot is now free.
    if (previous && p.bag[slot] === null) p.bag[slot] = { itemId: previous.itemId, qty: previous.qty };
    else if (previous) addToBag(p.bag, previous.itemId, previous.qty, this.content.item(previous.itemId).stackable === true);
    this.clampPoints(p);
    p.you.bag = true;
    p.you.gear = true;
    p.you.stats = true;
    return true;
  }

  /** Takes off what is in a gear slot, into the bag. */
  unequip(id: number, slot: EquipSlot): boolean {
    const p = this.byId.get(id);
    if (!p || !p.connected) return false;
    const worn = p.gear[slot];
    if (!worn) return false;
    const stackable = this.content.item(worn.itemId).stackable === true;
    if (roomFor(p.bag, worn.itemId, worn.qty, stackable) < worn.qty) {
      this.note(p, BAG_FULL);
      return false;
    }
    delete p.gear[slot];
    addToBag(p.bag, worn.itemId, worn.qty, stackable);
    this.clampPoints(p);
    p.you.bag = true;
    p.you.gear = true;
    p.you.stats = true;
    return true;
  }

  /** A bank operation, while the bank is open. */
  bank(id: number, command: BankCommand): boolean {
    const p = this.byId.get(id);
    if (!p || !p.connected) return false;
    if (command.op === 'close') {
      this.closeBank(p);
      return true;
    }
    if (!p.bankOpen) return false;
    switch (command.op) {
      case 'deposit': {
        const stack = takeFromSlot(p.bag, command.slot, command.qty);
        if (!stack) return false;
        addToStacks(p.bank, stack.itemId, stack.qty);
        break;
      }
      case 'withdraw': {
        if (!this.content.hasItem(command.item)) return false;
        const have = countInStacks(p.bank, command.item);
        if (have === 0) return false;
        const stackable = this.content.item(command.item).stackable === true;
        const fits = roomFor(p.bag, command.item, Math.min(command.qty, have), stackable);
        if (fits === 0) {
          this.note(p, BAG_FULL);
          return false;
        }
        takeFromStacks(p.bank, command.item, fits);
        addToBag(p.bag, command.item, fits, stackable);
        break;
      }
      case 'all': {
        p.bag.forEach((stack, slot) => {
          if (!stack) return;
          addToStacks(p.bank, stack.itemId, stack.qty);
          p.bag[slot] = null;
        });
        break;
      }
    }
    p.you.bag = true;
    p.you.bank = true;
    return true;
  }

  /**
   * One tick: nodes come back and items age; every player's queued inputs are
   * applied (a few at most, so nobody runs ahead), lapsed characters leave,
   * players who stepped onto an exit leave for the next zone, whoever stands
   * still beside what they clicked starts using it, and actions resolve on
   * their ticks. The delta for the clients comes back: the state of everyone
   * who moved or just stopped, and everything else that changed in the zone.
   */
  advance(): TickDelta {
    this.tick += 1;
    for (const [index, at] of this.depleted) {
      if (this.tick < at) continue;
      this.depleted.delete(index);
      this.nodeEvents.push([index, 0]);
    }
    for (const item of [...this.items.values()]) {
      if (this.tick >= item.goneAt) {
        this.items.delete(item.gid);
        this.taken.push(item.gid);
      } else if (item.owner !== null && this.tick === item.publicAt) {
        this.drops.push(itemView(item));
      }
    }
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
        if (input.stop) {
          // Halt: finish the cell under way, forget the rest and whatever was planned.
          this.stopAction(p);
          this.closeBank(p);
          p.intent = null;
          p.path = p.t > 0 ? p.path.slice(0, 1) : [];
        } else if (input.to) {
          // A new click: whatever was being done stops, and the walk is planned.
          this.stopAction(p);
          this.closeBank(p);
          if (planWalk(this.grid, p, input.to)) p.intent = input.use ? { x: input.to.x, y: input.to.y } : null;
          else {
            p.intent = null;
            if (input.use) this.note(p, CANT_REACH);
          }
        }
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
      if (p.path.length === 0 && p.t === 0) {
        if (p.intent) this.arrive(p);
        if (p.action && this.tick >= p.nextActionAt) this.work(p);
      }
      this.regenerate(p);
    }
    const delta: TickDelta = { tick: this.tick, joined: this.joined, left: this.left, moves, acts: this.acts, nodes: this.nodeEvents, drops: this.drops, taken: this.taken, chat: this.said };
    this.joined = [];
    this.left = [];
    this.said = [];
    this.acts = [];
    this.nodeEvents = [];
    this.drops = [];
    this.taken = [];
    this.spoke.clear();
    return delta;
  }

  /** A point of hit points and of mana comes back on its own schedule, faster with Vitality and Spirit. */
  private regenerate(p: RoomPlayer): void {
    if (this.tick < p.nextHpAt && this.tick < p.nextManaAt) return;
    const stats = this.statsOf(p);
    const steps = this.rules.actionSteps;
    if (this.tick >= p.nextHpAt) {
      p.nextHpAt = this.tick + regenInterval(levelOf(p.skills.vitality)) * steps;
      if (p.hp < stats.maxHp) {
        p.hp += 1;
        p.you.stats = true;
      }
    }
    if (this.tick >= p.nextManaAt) {
      p.nextManaAt = this.tick + regenInterval(levelOf(p.skills.spirit)) * steps;
      if (p.mana < stats.maxMana) {
        p.mana += 1;
        p.you.stats = true;
      }
    }
  }

  // ---- using things --------------------------------------------------------------

  /** The walk is over: use what was clicked, if it is beside us (or under us, for an item). */
  private arrive(p: RoomPlayer): void {
    const cell = p.intent!;
    p.intent = null;
    const obj = objectAt(this.grid, cell.x, cell.y);
    if (obj) {
      if (!beside(p.cell, obj)) return this.note(p, CANT_REACH);
      if (obj.def.kind === 'node') this.startGather(p, obj, obj.def.id);
      else if (obj.def.kind === 'bank') this.openBank(p);
      return;
    }
    const item = this.itemAt(cell, p);
    if (!item) return;
    if (Math.max(Math.abs(item.x - p.cell.x), Math.abs(item.y - p.cell.y)) > 1) return this.note(p, CANT_REACH);
    this.take(p, item);
  }

  private startGather(p: RoomPlayer, obj: PlacedObject, nodeId: NodeId): void {
    const def = this.content.node(nodeId);
    if (this.depleted.has(obj.index)) return this.note(p, `The ${def.name.toLowerCase()} has nothing left right now.`);
    const need = levelForTier(def.tier);
    const level = levelOf(p.skills[def.skill]);
    if (level < need) return this.note(p, `You need ${this.content.skill(def.skill).name} level ${need} for the ${def.name.toLowerCase()}.`);
    const toolName = TOOL_FOR[def.skill];
    if (toolName && this.bestTool(p, def.skill) === 0) return this.note(p, `You need a ${toolName} for that.`);
    if (freeSlots(p.bag) === 0) return this.note(p, BAG_FULL);
    p.action = { kind: 'gather', object: obj.index, cell: { x: obj.x, y: obj.y } };
    p.nextActionAt = this.tick + this.rules.actionSteps;
    p.dir = dirOf(Math.sign(obj.x - p.cell.x), Math.sign(obj.y - p.cell.y));
    this.acts.push([p.id, obj.x, obj.y, p.dir]);
  }

  /** One try at the node being worked on. */
  private work(p: RoomPlayer): void {
    const action = p.action!;
    const obj = this.grid.objects[action.object];
    if (!obj || obj.def.kind !== 'node' || this.depleted.has(action.object)) return this.stopAction(p);
    const def = this.content.node(obj.def.id);
    const toolName = TOOL_FOR[def.skill];
    const tool = toolName ? this.bestTool(p, def.skill) : 1;
    if (tool === 0) {
      this.note(p, `You need a ${toolName} for that.`);
      return this.stopAction(p);
    }
    if (freeSlots(p.bag) === 0) {
      this.note(p, BAG_FULL);
      return this.stopAction(p);
    }
    p.nextActionAt = this.tick + this.rules.actionSteps;
    const xp = p.skills[def.skill];
    if (!this.rng.chance(gatherChance(def, levelOf(xp), tool, this.rules.actionSteps * STEP_MS))) return;
    addToBag(p.bag, def.itemId, 1, this.content.item(def.itemId).stackable === true);
    p.you.bag = true;
    const after = Math.min(MAX_XP, xp + def.xp);
    p.skills[def.skill] = after;
    p.you.xp.push([def.skill, after]);
    if (levelOf(after) > levelOf(xp)) {
      this.note(p, `Congratulations, your ${this.content.skill(def.skill).name} level is now ${levelOf(after)}.`);
      p.you.stats = true;
    }
    if (def.deplete && this.rng.chance(def.deplete.chance)) this.deplete(action.object, def);
    else if (freeSlots(p.bag) === 0) {
      this.note(p, BAG_FULL);
      this.stopAction(p);
    }
  }

  /** The node empties for everyone until it respawns; whoever was working on it stops. */
  private deplete(index: number, def: GatherNodeDef): void {
    this.depleted.set(index, this.tick + Math.max(1, Math.ceil((def.deplete?.respawnMs ?? 0) / STEP_MS)));
    this.nodeEvents.push([index, 1]);
    for (const q of this.byId.values()) if (q.action?.object === index) this.stopAction(q);
  }

  private stopAction(p: RoomPlayer): void {
    if (!p.action) return;
    p.action = null;
    this.acts.push([p.id, -1, -1, p.dir]);
  }

  /** The best tool for a skill in the bag or in hand, by tier; 0 for none. */
  private bestTool(p: RoomPlayer, skill: SkillId): number {
    let best = 0;
    for (const slot of [...p.bag, p.gear.main_hand ?? null]) {
      if (!slot) continue;
      const tool = this.content.item(slot.itemId).tool;
      if (tool && tool.skill === skill && tool.tier > best) best = tool.tier;
    }
    return best;
  }

  // ---- items on the ground ---------------------------------------------------------

  private visible(item: GroundItem, p: RoomPlayer): boolean {
    return item.owner === null || this.tick >= item.publicAt || item.owner === keyOf(p.name);
  }

  private itemsFor(p: RoomPlayer): GroundItemView[] {
    const out: GroundItemView[] = [];
    for (const item of this.items.values()) if (this.visible(item, p)) out.push(itemView(item));
    return out;
  }

  private itemAt(cell: Cell, p: RoomPlayer): GroundItem | null {
    for (const item of this.items.values()) if (item.x === cell.x && item.y === cell.y && this.visible(item, p)) return item;
    return null;
  }

  private take(p: RoomPlayer, item: GroundItem): void {
    const stackable = this.content.item(item.itemId).stackable === true;
    if (roomFor(p.bag, item.itemId, item.qty, stackable) < item.qty) return this.note(p, BAG_FULL);
    addToBag(p.bag, item.itemId, item.qty, stackable);
    p.you.bag = true;
    this.items.delete(item.gid);
    this.taken.push(item.gid);
  }

  // ---- the bank --------------------------------------------------------------------

  private openBank(p: RoomPlayer): void {
    p.bankOpen = true;
    p.you.bank = true;
  }

  private closeBank(p: RoomPlayer): void {
    if (!p.bankOpen) return;
    p.bankOpen = false;
    p.you.bank = true;
  }

  private note(p: RoomPlayer, text: string): void {
    p.you.notes.push(text);
  }
}

function pending(): YouPending {
  return { bag: false, bank: false, gear: false, stats: false, xp: [], items: [], notes: [] };
}

/** Whether `cell` touches the footprint of `obj` (eight neighbours count) without being inside it. */
export function beside(cell: Cell, obj: { x: number; y: number; w: number; h: number }): boolean {
  const dx = Math.max(obj.x - cell.x, 0, cell.x - (obj.x + obj.w - 1));
  const dy = Math.max(obj.y - cell.y, 0, cell.y - (obj.y + obj.h - 1));
  return Math.max(dx, dy) === 1;
}

/** The cell, the cell being walked into (or -1, -1) and the progress with three decimals: a thousandth of a cell is invisible. */
export function placementOf(p: RoomPlayer): Placement {
  const next = p.t > 0 ? p.path[0] : undefined;
  return { cx: p.cell.x, cy: p.cell.y, nx: next ? next.x : -1, ny: next ? next.y : -1, t: next ? Math.round(p.t * 1000) / 1000 : 0 };
}

function snapshotOf(p: RoomPlayer): EntitySnapshot {
  return { ...placementOf(p), id: p.id, name: p.name, dir: p.dir, running: p.running, moving: p.moving, act: p.action ? [p.action.cell.x, p.action.cell.y] : null };
}

export function bagView(bag: Bag): BagView {
  return bag.map((s) => (s ? [s.itemId, s.qty] : null));
}

export function stacksView(stacks: ItemStack[]): StackView[] {
  return stacks.map((s) => [s.itemId, s.qty]);
}

export function gearView(gear: Gear): GearView {
  const out: GearView = [];
  for (const slot of EQUIP_SLOTS) {
    const worn = gear[slot];
    if (worn) out.push([slot, worn.itemId, worn.qty]);
  }
  return out;
}

function itemView(item: GroundItem): GroundItemView {
  return [item.gid, item.itemId, item.qty, item.x, item.y];
}
