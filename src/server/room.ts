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
 * picked up, the bank opens, a station (a campfire, the furnace, the anvil,
 * the sawbench, the tannery) is worked at. Nodes are shared and
 * can empty for everyone; dropped items belong to their owner for a while,
 * then to anyone, then go. Campfires a player builds burn down and go out
 * unless fed logs; the village fires never do.
 * Players never block one another; the static map decides where one can
 * stand. A step onto an exit cell takes the player out of the room; the
 * world (world.ts) carries it into the next one.
 */
import { CONTENT } from '@/content';
import { STARTING_KIT } from '@/content/starting-kit';
import { Registry } from '@/core/registry';
import { randomSeed, Rng } from '@/core/rng';
import type { ActState, BagView, ChatLine, ClientMessage, EntitySnapshot, FireView, GearView, GroundItemView, MoveState, Placement, QuestView, StackView, StationSession, StatsView, TalkView, TickDelta, YouDelta, ZoneSnapshot } from '@/net/protocol';
import type { EquipInfo, GatherNodeDef, ItemDef, ItemStack, NpcDef, QuestDef, RecipeDef, ZoneMapDef } from '@/types/content';
import { EQUIP_SLOTS, type EquipSlot, type GearKind, type ItemId, type MonsterId, type NodeId, type NpcId, type QuestId, type RecipeId, type SkillId, type StationId, type ZoneId } from '@/types/ids';
import { fail, ok, type Result } from '@/types/result';
import { addToBag, addToStacks, type Bag, countInBag, countInStacks, freeSlots, roomFor, takeFromBag, takeFromSlot, takeFromStacks } from '@/world/bag';
import { feedXp, FIRE_BUILD_XP, FIRE_LOGS, FIRE_MAX_MS, FIRE_STONES, fuelMs } from '@/world/fire';
import { EAT_TICKS, healOf } from '@/world/food';
import { type Cell, dirOf, type Grid, isWalkable, objectAt, parseMap, type PlacedObject } from '@/world/grid';
import { type Mover, planWalk, step, STEP_MS } from '@/world/motion';
import type { PathOptions } from '@/world/path';
import { cookChance, gatherTicks, levelForTier, levelOf, MAX_XP } from '@/world/skills';
import { type CharacterStats, deriveStats, regenInterval, slotsFor } from '@/world/stats';
import { type Character, keyOf } from './character';
import { eventKey, isComplete, liveProgress, type QuestEventType, questView, targetOf } from './quests';
import { type Gear, parseState, type PlayerState } from './state';

/** What the room needs to know about content. The registry satisfies it. */
export interface RoomContent {
  node(id: NodeId): GatherNodeDef;
  item(id: ItemId): ItemDef;
  hasItem(id: string): id is ItemId;
  skill(id: SkillId): { name: string };
  npc(id: NpcId): Pick<NpcDef, 'name' | 'greeting' | 'handout'>;
  quest(id: QuestId): QuestDef;
  hasQuest(id: string): id is QuestId;
  recipe(id: RecipeId): RecipeDef;
  hasRecipe(id: string): id is RecipeId;
  station(id: StationId): { name: string };
  hasStation(id: string): id is StationId;
  hasMonster(id: string): id is MonsterId;
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
  /** The tick the item being worked on is done, and how many ticks it takes (by level, node and tool). */
  doneAt: number;
  ticks: number;
}

/** Food on its way down: the slot it came from, what it was, and when it does its work. */
export interface Eating {
  itemId: ItemId;
  doneAt: number;
}

/** Making things at the station being stood by: so many more of a recipe, one per work time. */
export interface MakeAction {
  kind: 'make';
  recipe: RecipeId;
  left: number;
  cell: Cell;
}

/** The station a player stands by and uses: which kind, and for a campfire a built one by id (null for the village fire). */
export interface StationRef {
  station: StationId;
  fid: number | null;
  cell: Cell;
}

/** A campfire a player built: burning on a cell until `outAt`. */
export interface Campfire {
  fid: number;
  x: number;
  y: number;
  outAt: number;
}

/** Private events for a player's client, flushed with the next tick. */
interface YouPending {
  bag: boolean;
  bank: boolean;
  gear: boolean;
  stats: boolean;
  quests: boolean;
  coins: boolean;
  station: boolean;
  bestiary: boolean;
  talk: TalkView | null;
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
  action: GatherAction | MakeAction | null;
  nextActionAt: number;
  /** When the next point of hit points and of mana comes back. */
  nextHpAt: number;
  nextManaAt: number;
  bankOpen: boolean;
  /** The station being used, while standing by it. */
  station: StationRef | null;
  /** Food being eaten, until it heals. */
  eating: Eating | null;
  /** The room moved the character itself (off a fire it just built); the next tick says so. */
  nudged: boolean;
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
export type FireCommand = Extract<ClientMessage, { t: 'fire' }>;

/** Inputs waiting per player; more than this and the client is running ahead of the server. */
const MAX_QUEUED = 8;
/** Inputs applied per tick per player: one in the steady state, a few to catch up after a hiccup. */
const MAX_PER_TICK = 3;
/** Skills that need a tool in the bag, and what it is called. */
const TOOL_FOR: Partial<Record<SkillId, string>> = { lumberjack: 'hatchet', mining: 'pickaxe' };
const BAG_FULL = 'Your bag is full.';
const CANT_REACH = "You can't reach that from here.";
const NO_FIRE = 'Stand by a campfire first.';
/** "a furnace", "an anvil". */
const an = (noun: string) => `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;
const FIRE_NEEDS = `A campfire takes ${FIRE_STONES} stones and ${FIRE_LOGS === 1 ? 'a log' : `${FIRE_LOGS} logs`}.`;

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
  /** Campfires players built, by id; the village fires are stations on the map. Walks are planned around them and stop beside one that is clicked. */
  private readonly fires = new Map<number, Campfire>();
  private readonly walkOptions: PathOptions = { blocked: (x, y) => this.fireAt({ x, y }) !== null };
  private nextFid = 1;
  private lit: FireView[] = [];
  private doused: number[] = [];

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

  /** The zone as this player first sees it: everyone, the items it may see, the empty nodes, the fires burning. */
  snapshotFor(id: number): ZoneSnapshot | null {
    const p = this.byId.get(id);
    if (!p) return null;
    return { zone: this.zoneId, tick: this.tick, entities: this.snapshot(), items: this.itemsFor(p), nodes: [...this.depleted.keys()], fires: [...this.fires.values()].map(fireView), seq: p.seq };
  }

  /** What only this player gets on joining: its bag, skills, gear, numbers, quests, coins and the creatures it has met. */
  youOf(id: number): { bag: BagView; skills: [SkillId, number][]; gear: GearView; stats: StatsView; quests: QuestView[]; coins: number; bestiary: string[] } | null {
    const p = this.byId.get(id);
    if (!p) return null;
    return { bag: bagView(p.bag), skills: this.content.skillIds.map((s) => [s, p.skills[s]]), gear: gearView(p.gear), stats: this.statsView(p), quests: questView(p.quests), coins: p.coins, bestiary: [...p.bestiary] };
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
      skills: state.skills, bag: state.bag, bank: state.bank, gear: state.gear, hp: state.hp, mana: state.mana, quests: state.quests, coins: state.coins, bestiary: state.bestiary,
      id: this.ids(), cell, t: 0, path: [], moving: false, seq: 0, inputs: [], connected: true, disconnectedAt: 0,
      intent: null, action: null, nextActionAt: 0, nextHpAt: this.tick, nextManaAt: this.tick, bankOpen: false, station: null, eating: null, nudged: false, you: pending(),
    };
    this.clampPoints(player);
    this.byId.set(player.id, player);
    this.joined.push(snapshotOf(player));
    this.questEvent(player, 'visit', this.zoneId);
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
    player.station = null;
    player.nudged = false;
    this.byId.set(player.id, player);
    this.joined.push(snapshotOf(player));
    this.questEvent(player, 'visit', this.zoneId);
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
      // Objectives read off the character (have an item, reach a tier, wear a kind) follow whatever changed.
      if (y.bag || y.gear || y.xp.length > 0) this.refreshQuests(p);
      if (!y.bag && !y.bank && !y.gear && !y.stats && !y.quests && !y.coins && !y.station && !y.bestiary && !y.talk && y.xp.length === 0 && y.items.length === 0 && y.notes.length === 0) continue;
      const delta: YouDelta = {};
      if (y.bag) delta.bag = bagView(p.bag);
      if (y.gear) delta.gear = gearView(p.gear);
      if (y.stats) delta.stats = this.statsView(p);
      if (y.quests) delta.quests = questView(p.quests);
      if (y.coins) delta.coins = p.coins;
      if (y.bank) delta.bank = p.bankOpen ? stacksView(p.bank) : null;
      if (y.station) delta.station = this.stationSession(p);
      if (y.bestiary) delta.bestiary = [...p.bestiary];
      if (y.talk) delta.talk = y.talk;
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
    this.closeStation(p);
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

  /** Moves what is in one bag slot to another, swapping what was there. */
  swap(id: number, from: number, to: number): boolean {
    const p = this.byId.get(id);
    if (!p || !p.connected || from === to || from < 0 || to < 0 || from >= p.bag.length || to >= p.bag.length) return false;
    const a = p.bag[from] ?? null;
    const b = p.bag[to] ?? null;
    if (!a && !b) return false;
    p.bag[from] = b;
    p.bag[to] = a;
    p.you.bag = true;
    return true;
  }

  /** Eats the food in a bag slot: it leaves the bag now and heals once it is down, 35 ticks later; one thing at a time. */
  eat(id: number, slot: number): boolean {
    const p = this.byId.get(id);
    if (!p || !p.connected) return false;
    const stack = p.bag[slot];
    if (!stack) return false;
    const def = this.content.item(stack.itemId);
    if (healOf(def) <= 0) {
      this.note(p, `You can't eat the ${def.name.toLowerCase()}.`);
      return false;
    }
    if (p.eating) {
      this.note(p, 'You are still eating.');
      return false;
    }
    takeFromSlot(p.bag, slot, 1);
    p.you.bag = true;
    p.eating = { itemId: stack.itemId, doneAt: this.tick + EAT_TICKS };
    return true;
  }

  /** The creature is met in a fight: the journal remembers it from now on. */
  meet(id: number, monsterId: string): boolean {
    const p = this.byId.get(id);
    if (!p || !this.content.hasMonster(monsterId) || p.bestiary.includes(monsterId)) return false;
    p.bestiary.push(monsterId);
    p.you.bestiary = true;
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

  /** Takes a quest from the journal: it must exist, not be taken or done, and its prerequisites must hold. */
  acceptQuest(id: number, questId: string): boolean {
    const p = this.byId.get(id);
    if (!p || !p.connected || !this.content.hasQuest(questId)) return false;
    const def = this.content.quest(questId);
    const have = p.quests[questId];
    if (have) {
      this.note(p, have.status === 'done' ? `You have already finished ${def.name}.` : `You are already on ${def.name}.`);
      return false;
    }
    for (const req of def.prerequisites) {
      switch (req.type) {
        case 'quest':
          if (p.quests[req.questId]?.status !== 'done') {
            this.note(p, `You need to finish ${this.content.quest(req.questId).name} first.`);
            return false;
          }
          break;
        case 'tier':
          if (levelOf(p.skills[req.skill]) < levelForTier(req.tier)) {
            this.note(p, `You need ${this.content.skill(req.skill).name} level ${levelForTier(req.tier)} for that quest.`);
            return false;
          }
          break;
        case 'any_tier':
          if (!this.content.skillIds.some((s) => levelOf(p.skills[s]) >= levelForTier(req.tier))) {
            this.note(p, `You need a skill at level ${levelForTier(req.tier)} for that quest.`);
            return false;
          }
          break;
        case 'item':
          if (countInBag(p.bag, req.itemId) < req.qty) {
            this.note(p, `You need ${req.qty} ${this.content.item(req.itemId).name} for that quest.`);
            return false;
          }
          break;
        case 'unlock':
          break;
      }
    }
    p.quests[questId] = { status: 'active', progress: def.objectives.map(() => 0) };
    p.you.quests = true;
    this.note(p, `Quest accepted: ${def.name}.`);
    this.questEvent(p, 'visit', this.zoneId);
    this.refreshQuests(p);
    return true;
  }

  /** Gives up an active quest; what was done for it is forgotten. */
  abandonQuest(id: number, questId: string): boolean {
    const p = this.byId.get(id);
    if (!p || !p.connected || !this.content.hasQuest(questId)) return false;
    const have = p.quests[questId];
    if (!have || have.status !== 'active') return false;
    delete p.quests[questId];
    p.you.quests = true;
    this.note(p, `Quest abandoned: ${this.content.quest(questId).name}.`);
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
    for (const fire of [...this.fires.values()]) {
      if (this.tick < fire.outAt) continue;
      this.fires.delete(fire.fid);
      this.doused.push(fire.fid);
      for (const q of this.byId.values()) {
        if (q.station?.fid !== fire.fid) continue;
        this.note(q, 'The fire has gone out.');
        this.closeStation(q);
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
          this.closeStation(p);
          p.intent = null;
          p.path = p.t > 0 ? p.path.slice(0, 1) : [];
        } else if (input.to) {
          // A new click: whatever was being done stops, and the walk is planned.
          this.stopAction(p);
          this.closeBank(p);
          this.closeStation(p);
          if (planWalk(this.grid, p, input.to, this.walkOptions)) p.intent = input.use ? { x: input.to.x, y: input.to.y } : null;
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
      if (applied > 0 || wasMoving || p.nudged) {
        p.nudged = false;
        const at = placementOf(p);
        moves.push([p.id, at.cx, at.cy, at.nx, at.ny, at.t, p.dir, moved ? 1 : 0, p.seq]);
      }
      if (p.path.length === 0 && p.t === 0) {
        if (p.intent) this.arrive(p);
        if (p.action && this.tick >= p.nextActionAt) {
          if (p.action.kind === 'make') this.makeOnce(p);
          else this.work(p);
        }
      }
      if (p.eating && this.tick >= p.eating.doneAt) this.swallow(p);
      this.regenerate(p);
    }
    const delta: TickDelta = { tick: this.tick, joined: this.joined, left: this.left, moves, acts: this.acts, nodes: this.nodeEvents, drops: this.drops, taken: this.taken, fires: this.lit, doused: this.doused, chat: this.said };
    this.joined = [];
    this.left = [];
    this.said = [];
    this.acts = [];
    this.nodeEvents = [];
    this.drops = [];
    this.taken = [];
    this.lit = [];
    this.doused = [];
    this.spoke.clear();
    return delta;
  }

  /** The food is down: it heals, within the maximum. */
  private swallow(p: RoomPlayer): void {
    const eating = p.eating!;
    p.eating = null;
    const def = this.content.item(eating.itemId);
    p.hp = Math.min(this.statsOf(p).maxHp, p.hp + healOf(def));
    p.you.stats = true;
    this.note(p, `You eat the ${def.name.toLowerCase()}.`);
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

  /** The walk is over: use what was clicked, if it is beside us (or under us, for an item or a fire). */
  private arrive(p: RoomPlayer): void {
    const cell = p.intent!;
    p.intent = null;
    const obj = objectAt(this.grid, cell.x, cell.y);
    if (obj) {
      if (!beside(p.cell, obj)) return this.note(p, CANT_REACH);
      if (obj.def.kind === 'node') this.startGather(p, obj, obj.def.id);
      else if (obj.def.kind === 'bank') this.openBank(p);
      else if (obj.def.kind === 'npc') this.talk(p, obj, obj.def.id);
      else if (obj.def.kind === 'station') this.openStation(p, { station: obj.def.id, fid: null, cell: { x: obj.x, y: obj.y } });
      return;
    }
    const fire = this.fireAt(cell);
    if (fire) {
      if (Math.max(Math.abs(fire.x - p.cell.x), Math.abs(fire.y - p.cell.y)) > 1) return this.note(p, CANT_REACH);
      return this.openStation(p, { station: 'campfire', fid: fire.fid, cell: { x: fire.x, y: fire.y } });
    }
    const item = this.itemAt(cell, p);
    if (!item) return;
    if (Math.max(Math.abs(item.x - p.cell.x), Math.abs(item.y - p.cell.y)) > 1) return this.note(p, CANT_REACH);
    this.take(p, item);
  }

  /** A word with someone: they say their piece (to the balloon, not the chat), hand over their tool to anyone without one, and a quest that wanted the visit hears of it. */
  private talk(p: RoomPlayer, obj: PlacedObject, npcId: NpcId): void {
    const npc = this.content.npc(npcId);
    p.dir = dirOf(Math.sign(obj.x - p.cell.x), Math.sign(obj.y - p.cell.y));
    this.acts.push([p.id, -1, -1, p.dir]);
    const lines = [npc.greeting];
    const gift = npc.handout;
    if (gift && this.bestTool(p, gift.skill) === 0) {
      if (freeSlots(p.bag) === 0) lines.push(`${npc.name} has a ${this.content.item(gift.itemId).name.toLowerCase()} for you, but your bag is full.`);
      else {
        this.giveItem(p, gift.itemId, 1);
        lines.push(gift.line);
      }
    }
    p.you.talk = { npc: npcId, lines };
    this.questEvent(p, 'talk', npcId);
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
    const ticks = this.gatherTicksFor(p, def);
    p.action = { kind: 'gather', object: obj.index, cell: { x: obj.x, y: obj.y }, doneAt: this.tick + ticks, ticks };
    p.nextActionAt = Math.min(this.tick + this.rules.actionSteps, p.action.doneAt);
    p.dir = dirOf(Math.sign(obj.x - p.cell.x), Math.sign(obj.y - p.cell.y));
    this.acts.push([p.id, obj.x, obj.y, p.dir, ticks]);
  }

  /** Ticks per item for this player at this node: by level, the node's tier and the best tool. */
  private gatherTicksFor(p: RoomPlayer, def: GatherNodeDef): number {
    const toolName = TOOL_FOR[def.skill];
    return gatherTicks(def, levelOf(p.skills[def.skill]), toolName ? this.bestTool(p, def.skill) : 1);
  }

  /**
   * A swing at the node being worked on, every action tick: the checks hold
   * or the work stops; the item lands when its time is up, with its xp, and
   * the next one is timed by the level and tool as they now are.
   */
  private work(p: RoomPlayer): void {
    const action = p.action;
    if (!action || action.kind !== 'gather') return;
    const obj = this.grid.objects[action.object];
    if (!obj || obj.def.kind !== 'node' || this.depleted.has(action.object)) return this.stopAction(p);
    const def = this.content.node(obj.def.id);
    const toolName = TOOL_FOR[def.skill];
    if (toolName && this.bestTool(p, def.skill) === 0) {
      this.note(p, `You need a ${toolName} for that.`);
      return this.stopAction(p);
    }
    if (freeSlots(p.bag) === 0) {
      this.note(p, BAG_FULL);
      return this.stopAction(p);
    }
    if (this.tick < action.doneAt) {
      p.nextActionAt = Math.min(this.tick + this.rules.actionSteps, action.doneAt);
      return;
    }
    addToBag(p.bag, def.itemId, 1, this.content.item(def.itemId).stackable === true);
    p.you.bag = true;
    this.grantXp(p, def.skill, def.xp);
    this.questEvent(p, 'gather', def.itemId);
    if (def.deplete && this.rng.chance(def.deplete.chance)) return this.deplete(action.object, def);
    if (freeSlots(p.bag) === 0) {
      this.note(p, BAG_FULL);
      return this.stopAction(p);
    }
    action.ticks = this.gatherTicksFor(p, def);
    action.doneAt = this.tick + action.ticks;
    p.nextActionAt = Math.min(this.tick + this.rules.actionSteps, action.doneAt);
    this.acts.push([p.id, obj.x, obj.y, p.dir, action.ticks]);
  }

  /** Xp into a skill, with a word and new numbers when a level is reached. */
  private grantXp(p: RoomPlayer, skill: SkillId, amount: number): void {
    const before = p.skills[skill];
    const after = Math.min(MAX_XP, before + amount);
    if (after === before) return;
    p.skills[skill] = after;
    p.you.xp.push([skill, after]);
    if (levelOf(after) > levelOf(before)) {
      this.note(p, `Congratulations, your ${this.content.skill(skill).name} level is now ${levelOf(after)}.`);
      p.you.stats = true;
    }
  }

  /** Something given to the player: into the bag, or at its feet when the bag is full. */
  private giveItem(p: RoomPlayer, itemId: ItemId, qty: number): void {
    const stackable = this.content.item(itemId).stackable === true;
    const left = addToBag(p.bag, itemId, qty, stackable);
    p.you.bag = true;
    if (left === 0) return;
    const item: GroundItem = { gid: this.nextGid++, itemId, qty: left, x: p.cell.x, y: p.cell.y, owner: keyOf(p.name), publicAt: this.tick + this.rules.itemPublicSteps, goneAt: this.tick + this.rules.itemGoneSteps };
    this.items.set(item.gid, item);
    p.you.items.push(itemView(item));
    this.note(p, 'Your bag is full; the rest lies at your feet.');
  }

  // ---- quests ----------------------------------------------------------------------

  /** Something happened that a counted objective may be waiting for. */
  private questEvent(p: RoomPlayer, type: QuestEventType, key: string): void {
    let changed = false;
    for (const [questId, entry] of Object.entries(p.quests)) {
      if (!entry || entry.status !== 'active' || !this.content.hasQuest(questId)) continue;
      this.content.quest(questId).objectives.forEach((o, i) => {
        const wanted = eventKey(o);
        if (!wanted || wanted.type !== type || wanted.key !== key) return;
        const target = targetOf(o);
        if ((entry.progress[i] ?? 0) >= target) return;
        entry.progress[i] = (entry.progress[i] ?? 0) + 1;
        changed = true;
      });
    }
    if (!changed) return;
    p.you.quests = true;
    this.checkQuests(p);
  }

  /** Live objectives are read off the character as it is now. */
  private refreshQuests(p: RoomPlayer): void {
    const worn: GearKind[] = [];
    for (const slot of EQUIP_SLOTS) {
      const item = p.gear[slot];
      const equip = item ? this.content.item(item.itemId).equip : undefined;
      if (equip) worn.push(equip.kind);
    }
    const live = { bag: p.bag, skills: p.skills, worn };
    let changed = false;
    for (const [questId, entry] of Object.entries(p.quests)) {
      if (!entry || entry.status !== 'active' || !this.content.hasQuest(questId)) continue;
      this.content.quest(questId).objectives.forEach((o, i) => {
        const now = liveProgress(o, live);
        if (now === null || now === (entry.progress[i] ?? 0)) return;
        entry.progress[i] = now;
        changed = true;
      });
    }
    if (!changed) return;
    p.you.quests = true;
    this.checkQuests(p);
  }

  /** A quest whose every objective is met is done, with its rewards. */
  private checkQuests(p: RoomPlayer): void {
    for (const [questId, entry] of Object.entries(p.quests)) {
      if (!entry || entry.status !== 'active' || !this.content.hasQuest(questId)) continue;
      const def = this.content.quest(questId);
      if (!isComplete(def, entry.progress)) continue;
      entry.status = 'done';
      p.you.quests = true;
      this.note(p, `Quest complete: ${def.name}. ${def.completionText}`);
      const got: string[] = [];
      for (const reward of def.rewards) {
        if (reward.type === 'xp') {
          this.grantXp(p, reward.skill, reward.amount);
          got.push(`${reward.amount} ${this.content.skill(reward.skill).name} xp`);
        } else if (reward.type === 'gold') {
          p.coins += reward.amount;
          p.you.coins = true;
          got.push(`${reward.amount} coins`);
        } else if (reward.type === 'item') {
          this.giveItem(p, reward.itemId, reward.qty);
          got.push(`${reward.qty > 1 ? `${reward.qty} ` : ''}${this.content.item(reward.itemId).name}`);
        }
      }
      if (got.length > 0) this.note(p, `You receive ${got.join(', ')}.`);
    }
  }

  /** The node empties for everyone until it respawns; whoever was working on it stops. */
  private deplete(index: number, def: GatherNodeDef): void {
    this.depleted.set(index, this.tick + Math.max(1, Math.ceil((def.deplete?.respawnMs ?? 0) / STEP_MS)));
    this.nodeEvents.push([index, 1]);
    for (const q of this.byId.values()) if (q.action?.kind === 'gather' && q.action.object === index) this.stopAction(q);
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

  // ---- stations: campfires, the furnace, the anvil, the sawbench, the tannery -------------

  /** Step away from the station being used. */
  leaveStation(id: number): boolean {
    const p = this.byId.get(id);
    if (!p || !p.connected) return false;
    this.closeStation(p);
    return true;
  }

  /**
   * Build a campfire where you stand from two stones and a log (it burns for the
   * log's time, then you step off it), or feed the one you stand by a log.
   */
  fire(id: number, command: FireCommand): boolean {
    const p = this.byId.get(id);
    if (!p || !p.connected) return false;
    switch (command.op) {
      case 'build': {
        if (p.path.length > 0 || p.t > 0) {
          this.note(p, 'Stand still to build a campfire.');
          return false;
        }
        if (this.fireAt(p.cell) || objectAt(this.grid, p.cell.x, p.cell.y)) {
          this.note(p, 'There is no room for a fire here.');
          return false;
        }
        const log = this.lowestLog(p.bag);
        if (countInBag(p.bag, 'stone') < FIRE_STONES || !log || countInBag(p.bag, log.itemId) < FIRE_LOGS) {
          this.note(p, FIRE_NEEDS);
          return false;
        }
        this.stopAction(p);
        this.closeBank(p);
        this.closeStation(p);
        takeFromBag(p.bag, 'stone', FIRE_STONES);
        takeFromBag(p.bag, log.itemId, FIRE_LOGS);
        p.you.bag = true;
        const fire: Campfire = { fid: this.nextFid++, x: p.cell.x, y: p.cell.y, outAt: this.tick + Math.ceil(fuelMs(log.tier) / STEP_MS) };
        this.fires.set(fire.fid, fire);
        this.lit.push(fireView(fire));
        this.grantXp(p, 'crafting', FIRE_BUILD_XP);
        this.note(p, 'You build a campfire.');
        // Step off it, the way one does, so the fire is used from beside it.
        const off = this.stepOff(p.cell);
        if (off) {
          p.cell = off;
          p.dir = dirOf(Math.sign(fire.x - off.x), Math.sign(fire.y - off.y));
          p.nudged = true;
        }
        return true;
      }
      case 'feed': {
        if (!p.station || p.station.station !== 'campfire') {
          this.note(p, NO_FIRE);
          return false;
        }
        const fire = p.station.fid !== null ? this.fires.get(p.station.fid) : null;
        if (!fire) {
          this.note(p, 'This fire needs no feeding.');
          return false;
        }
        const log = this.lowestLog(p.bag);
        if (!log) {
          this.note(p, 'You have no log to add.');
          return false;
        }
        const leftMs = (fire.outAt - this.tick) * STEP_MS;
        if (leftMs >= FIRE_MAX_MS) {
          this.note(p, 'The fire is burning as high as it can.');
          return false;
        }
        takeFromBag(p.bag, log.itemId, 1);
        p.you.bag = true;
        fire.outAt = this.tick + Math.ceil(Math.min(FIRE_MAX_MS, leftMs + fuelMs(log.tier)) / STEP_MS);
        this.grantXp(p, 'crafting', feedXp(log.tier));
        this.note(p, `You add ${an(this.content.item(log.itemId).name.toLowerCase())} to the fire.`);
        for (const q of this.byId.values()) if (q.station?.fid === fire.fid) q.you.station = true;
        return true;
      }
    }
  }

  /** Make so many of a recipe at the station being stood by: the right station, the level, and the makings in the bag. */
  make(id: number, recipeId: string, qty: number): boolean {
    const p = this.byId.get(id);
    if (!p || !p.connected || !this.content.hasRecipe(recipeId)) return false;
    const recipe = this.content.recipe(recipeId);
    const name = this.content.item(recipe.outputs[0]!.itemId).name.toLowerCase();
    if (!p.station) {
      this.note(p, `Stand by ${an(this.content.station(recipe.station).name.toLowerCase())} first.`);
      return false;
    }
    if (recipe.station !== p.station.station) {
      this.note(p, `You need ${an(this.content.station(recipe.station).name.toLowerCase())} to make ${name}.`);
      return false;
    }
    const need = levelForTier(recipe.tier);
    if (levelOf(p.skills[recipe.skill]) < need) {
      this.note(p, `You need ${this.content.skill(recipe.skill).name} level ${need} to make ${name}.`);
      return false;
    }
    const can = this.canMake(p, recipe);
    if (can === 0) {
      this.note(p, `You have nothing to make ${name} from.`);
      return false;
    }
    this.stopAction(p);
    const steps = this.makeSteps(p, recipe);
    p.action = { kind: 'make', recipe: recipeId, left: Math.min(qty, can), cell: p.station.cell };
    p.nextActionAt = this.tick + steps;
    p.dir = dirOf(Math.sign(p.station.cell.x - p.cell.x), Math.sign(p.station.cell.y - p.cell.y));
    this.acts.push([p.id, p.station.cell.x, p.station.cell.y, p.dir, steps]);
    return true;
  }

  /** One thing made: the makings are used up; at a fire it comes out right by the cook's level or burnt, elsewhere it always comes out. */
  private makeOnce(p: RoomPlayer): void {
    const action = p.action;
    if (!action || action.kind !== 'make' || !p.station) return this.stopAction(p);
    const recipe = this.content.recipe(action.recipe);
    if (this.canMake(p, recipe) === 0) return this.stopAction(p);
    for (const input of recipe.inputs) takeFromBag(p.bag, input.itemId, input.qty);
    p.you.bag = true;
    const steps = this.makeSteps(p, recipe);
    p.nextActionAt = this.tick + steps;
    const need = levelForTier(recipe.tier);
    const comesOut = recipe.skill !== 'cooking' || this.rng.chance(cookChance(levelOf(p.skills[recipe.skill]), need));
    if (comesOut) {
      for (const output of recipe.outputs) this.giveItem(p, output.itemId, output.qty);
      this.grantXp(p, recipe.skill, recipe.xp);
      this.questEvent(p, 'craft', recipe.id);
    } else {
      this.note(p, `You accidentally burn the ${this.content.item(recipe.outputs[0]!.itemId).name.toLowerCase()}.`);
    }
    action.left -= 1;
    if (action.left <= 0 || this.canMake(p, recipe) === 0) this.stopAction(p);
    else this.acts.push([p.id, action.cell.x, action.cell.y, p.dir, steps]);
  }

  private openStation(p: RoomPlayer, ref: StationRef): void {
    p.station = ref;
    p.you.station = true;
    p.dir = dirOf(Math.sign(ref.cell.x - p.cell.x), Math.sign(ref.cell.y - p.cell.y));
    this.acts.push([p.id, -1, -1, p.dir]);
  }

  private closeStation(p: RoomPlayer): void {
    if (!p.station) return;
    p.station = null;
    p.you.station = true;
    if (p.action?.kind === 'make') this.stopAction(p);
  }

  /** The station a player is using as its client should see it; a campfire says how long it burns yet (for ever at the village fire). */
  private stationSession(p: RoomPlayer): StationSession | null {
    if (!p.station) return null;
    if (p.station.fid === null) return { station: p.station.station, fid: null, fuelMs: null };
    const fire = this.fires.get(p.station.fid);
    return fire ? { station: p.station.station, fid: fire.fid, fuelMs: Math.max(0, (fire.outAt - this.tick) * STEP_MS) } : null;
  }

  private fireAt(cell: Cell): Campfire | null {
    for (const fire of this.fires.values()) if (fire.x === cell.x && fire.y === cell.y) return fire;
    return null;
  }

  /** The log of the lowest tier in the bag: the one to burn first. */
  private lowestLog(bag: Bag): { itemId: ItemId; tier: number } | null {
    let best: { itemId: ItemId; tier: number } | null = null;
    for (const slot of bag) {
      if (!slot) continue;
      const def = this.content.item(slot.itemId);
      if (def.group === 'log' && (!best || def.tier < best.tier)) best = { itemId: slot.itemId, tier: def.tier };
    }
    return best;
  }

  /** How many times a recipe's inputs are in the bag. */
  private canMake(p: RoomPlayer, recipe: RecipeDef): number {
    return Math.min(...recipe.inputs.map((input) => Math.floor(countInBag(p.bag, input.itemId) / input.qty)));
  }

  /** Steps between two things made: the recipe's time in action ticks, at least one; a percent quicker per level of the skill (half the time at most), except at a fire, where levels burn less instead. */
  private makeSteps(p: RoomPlayer, recipe: RecipeDef): number {
    const quicker = recipe.skill === 'cooking' ? 1 : Math.max(0.5, 1 - 0.01 * (levelOf(p.skills[recipe.skill]) - 1));
    return Math.max(1, Math.round((recipe.durationMs * quicker) / (this.rules.actionSteps * STEP_MS))) * this.rules.actionSteps;
  }

  /** A free cell beside `cell` to step onto, west first; null when hemmed in. */
  private stepOff(cell: Cell): Cell | null {
    for (const d of [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]) {
      const c = { x: cell.x + d.x, y: cell.y + d.y };
      if (isWalkable(this.grid, c.x, c.y) && !this.fireAt(c) && !this.exits.has(c.y * this.grid.width + c.x)) return c;
    }
    return null;
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
  return { bag: false, bank: false, gear: false, stats: false, quests: false, coins: false, station: false, bestiary: false, talk: null, xp: [], items: [], notes: [] };
}

function fireView(fire: Campfire): FireView {
  return [fire.fid, fire.x, fire.y];
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
