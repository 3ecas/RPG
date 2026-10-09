import { describe, expect, it } from 'vitest';
import { CONTENT } from '@/content';
import { Registry } from '@/core/registry';
import { Rng } from '@/core/rng';
import type { Character } from '@/server/character';
import { Room, type RoomOptions, type RoomPlayer } from '@/server/room';
import { stateOf } from '@/server/state';
import type { ZoneMapDef } from '@/types/content';
import type { Cell } from '@/world/grid';
import { countInBag } from '@/world/bag';
import { FIRE_MAX_MS, fuelMs } from '@/world/fire';
import { EAT_TICKS } from '@/world/food';
import { STEP_MS } from '@/world/motion';
import { xpForLevel } from '@/world/skills';

/** A corner of the village: Rowan and Greta, the village fire, a pile of loose stones, a furnace and an anvil, and room to walk around a fire. */
const map: ZoneMapDef = {
  biome: 'meadow',
  rows: [
    '^^^^^^^^^^^^',
    '^S.....W.O.^',
    '^..F...G...^',
    '^.R...U.N..^',
    '^..........^',
    '^..........^',
    '^^^^^^^^^^^^',
  ],
  legend: {
    S: { kind: 'spawn' },
    W: { kind: 'npc', id: 'lumberjack_rowan' },
    G: { kind: 'npc', id: 'mason_greta' },
    O: { kind: 'npc', id: 'angler_tobb' },
    F: { kind: 'station', id: 'campfire' },
    U: { kind: 'station', id: 'furnace' },
    N: { kind: 'station', id: 'anvil' },
    R: { kind: 'node', id: 'rubble' },
  },
};
const FURNACE: Cell = { x: 6, y: 3 };
const ANVIL: Cell = { x: 8, y: 3 };
/** One cell with nothing free around it. */
const pocket: ZoneMapDef = {
  biome: 'meadow',
  rows: ['^^^^^', '^#S#^', '^###^', '^^^^^'],
  legend: { S: { kind: 'spawn' } },
};
const ROWAN: Cell = { x: 7, y: 1 };
const GRETA: Cell = { x: 7, y: 2 };
const TOBB: Cell = { x: 9, y: 1 };
const VILLAGE_FIRE: Cell = { x: 3, y: 2 };
const content = new Registry(CONTENT);

class ScriptedRng extends Rng {
  constructor(private readonly answers: boolean[] = []) {
    super(11);
  }
  override chance(probability: number): boolean {
    return this.answers.length > 0 ? this.answers.shift()! : super.chance(probability);
  }
}

function room(options: Partial<RoomOptions> = {}, def: ZoneMapDef = map): Room {
  return new Room('greenhollow', def, { graceTicks: 3, capacity: 6, content, rng: new ScriptedRng(), rules: { actionSteps: 2, itemPublicSteps: 10, itemGoneSteps: 20 }, ...options });
}

function character(name: string, state: Record<string, unknown> = {}): Character {
  return { name, secretHash: 'h', createdAt: 0, dir: 0, running: false, state };
}

function enterOk(r: Room, name: string, at: Cell | null = null, state: Record<string, unknown> = {}): RoomPlayer {
  const result = r.enter(character(name, state), at);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

function useAndArrive(r: Room, p: RoomPlayer, cell: Cell, seq: { n: number }): void {
  r.queueInput(p.id, { seq: ++seq.n, to: cell, use: true });
  let ticks = 0;
  do {
    r.advance();
    ticks++;
    if (p.path.length > 0) r.queueInput(p.id, { seq: ++seq.n });
  } while (p.path.length > 0 && ticks < 200);
}

const you = (r: Room, p: RoomPlayer) => r.takeYou().get(p.id);
const stack = (itemId: string, qty = 1) => ({ itemId, qty });
/** 36 steps per shrimp here: 1800 ms at 100 ms action ticks. */
const SHRIMP_STEPS = 36;

describe('tools from people', () => {
  it('starts you with nothing; Rowan hands over a stone hatchet once, Greta a pickaxe, Tobb a rod, all onto the belt', () => {
    const r = room();
    const p = enterOk(r, 'Ada', { x: 6, y: 1 });
    expect(p.bag.every((s) => s === null)).toBe(true);
    expect(p.belt).toEqual({});
    r.takeYou();
    const seq = { n: 0 };
    useAndArrive(r, p, ROWAN, seq);
    const y1 = you(r, p)!;
    expect(y1.talk?.npc).toBe('lumberjack_rowan');
    expect(y1.talk?.lines[0]).toContain('The oaks are all yours');
    expect(y1.talk?.lines[1]).toBe('Rowan hands you a stone hatchet.');
    expect(y1.notes).toBeUndefined(); // words go to the balloon, not the chat
    expect(y1.belt).toEqual([['lumberjack', 'stone_hatchet']]);
    expect(y1.bag).toBeUndefined(); // the belt took it, not the bag
    expect(p.belt.lumberjack?.itemId).toBe('stone_hatchet');
    expect(countInBag(p.bag, 'stone_hatchet')).toBe(0);
    useAndArrive(r, p, ROWAN, seq);
    const y2 = you(r, p)!;
    expect(y2.talk?.lines).toHaveLength(1); // the greeting only: you have one
    useAndArrive(r, p, GRETA, seq);
    expect(you(r, p)?.talk?.lines[1]).toBe('Greta hands you a stone pickaxe.');
    expect(p.belt.mining?.itemId).toBe('stone_pickaxe');
    useAndArrive(r, p, TOBB, seq);
    expect(you(r, p)?.talk?.lines[1]).toBe('Tobb hands you an oak fishing rod.');
    expect(p.belt.fishing?.itemId).toBe('oak_rod');
    expect(r.youOf(p.id)?.belt).toEqual([['lumberjack', 'stone_hatchet'], ['mining', 'stone_pickaxe'], ['fishing', 'oak_rod']]);
  });

  it('hangs the tool on the belt even when the bag is full, and knows a tool in the bag counts too', () => {
    const r = room();
    const p = enterOk(r, 'Bob', { x: 6, y: 2 }, { bag: new Array(28).fill(stack('oak_log')) });
    r.takeYou();
    useAndArrive(r, p, GRETA, { n: 0 });
    expect(you(r, p)?.talk?.lines[1]).toBe('Greta hands you a stone pickaxe.');
    expect(p.belt.mining?.itemId).toBe('stone_pickaxe');
    const q = enterOk(r, 'Cat', { x: 6, y: 1 }, { bag: [stack('iron_hatchet')] });
    r.takeYou();
    useAndArrive(r, q, ROWAN, { n: 0 });
    expect(you(r, q)?.talk?.lines).toHaveLength(1); // a hatchet in the bag is a hatchet
    expect(q.belt.lumberjack).toBeUndefined();
  });
});

describe('eating', () => {
  it('takes the food now and heals 35 ticks later, one thing at a time, and only food', () => {
    const r = room();
    const p = enterOk(r, 'Jem', null, { hp: 3, bag: [stack('shrimp'), stack('shrimp'), stack('oak_log')] });
    expect(p.hp).toBe(3);
    r.takeYou();
    expect(r.eat(p.id, 2)).toBe(false);
    expect(you(r, p)?.notes).toEqual(["You can't eat the oak log."]);
    expect(r.eat(p.id, 5)).toBe(false);
    expect(r.eat(p.id, 0)).toBe(true);
    expect(p.bag[0]).toBeNull();
    expect(you(r, p)?.bag?.[0]).toBeNull();
    expect(r.eat(p.id, 1)).toBe(false);
    expect(you(r, p)?.notes).toEqual(['You are still eating.']);
    for (let i = 0; i < EAT_TICKS - 1; i++) r.advance();
    expect(p.hp).toBe(5); // two points came back on their own meanwhile; the shrimp is still going down
    r.advance();
    expect(p.hp).toBe(11); // a shrimp is six
    const y = you(r, p)!;
    expect(y.stats?.hp).toBe(11);
    expect(y.notes).toEqual(['You eat the shrimp.']);
    p.hp = 2;
    expect(r.eat(p.id, 1)).toBe(true);
    for (let i = 0; i < EAT_TICKS; i++) r.advance();
    expect(p.hp).toBeGreaterThanOrEqual(8);
    expect(p.hp).toBeLessThanOrEqual(11); // never past the maximum
  });

  it('remembers the creatures met, and tells the journal', () => {
    const r = room();
    const p = enterOk(r, 'Kit', null, { bestiary: ['rat', 'nope'] });
    expect(p.bestiary).toEqual(['rat']);
    expect(r.youOf(p.id)?.bestiary).toEqual(['rat']);
    r.takeYou();
    expect(r.meet(p.id, 'rat')).toBe(false);
    expect(r.meet(p.id, 'dragon')).toBe(false);
    expect(r.meet(p.id, 'goblin')).toBe(true);
    expect(you(r, p)?.bestiary).toEqual(['rat', 'goblin']);
  });
});

describe('campfires', () => {
  it('is built from two stones and a log where you stand, which you step off, and burns down and goes out', () => {
    const r = room();
    const p = enterOk(r, 'Cyd', { x: 2, y: 4 }, { bag: [stack('stone'), stack('stone'), stack('oak_log'), stack('raw_shrimp')] });
    r.takeYou();
    expect(r.fire(p.id, { t: 'fire', op: 'build' })).toBe(true);
    expect(p.cell).toEqual({ x: 1, y: 4 }); // a step west
    expect(p.dir).toBe(2); // facing the fire
    const tick = r.advance();
    expect(tick.fires).toEqual([[1, 2, 4]]);
    expect(tick.moves).toEqual([[p.id, 1, 4, -1, -1, 0, 2, 0, 0]]);
    const y = you(r, p)!;
    expect(y.notes).toEqual(['You build a campfire.']);
    expect(y.xp).toEqual([['crafting', 15]]);
    expect(countInBag(p.bag, 'stone')).toBe(0);
    expect(countInBag(p.bag, 'oak_log')).toBe(0);
    expect(r.snapshotFor(p.id)?.fires).toEqual([[1, 2, 4]]);
    expect(r.fire(p.id, { t: 'fire', op: 'build' })).toBe(false);
    expect(you(r, p)?.notes).toEqual(['A campfire takes 2 stones and a log.']);

    // Using it: the session says how long it burns; it goes out on time, for everyone, and the session with it.
    useAndArrive(r, p, { x: 2, y: 4 }, { n: 0 });
    const session = you(r, p)!.station!;
    expect(session.station).toBe('campfire');
    expect(session.fid).toBe(1);
    expect(session.fuelMs).toBeGreaterThan(fuelMs(1) - 20 * STEP_MS);
    expect(session.fuelMs).toBeLessThanOrEqual(fuelMs(1));
    let out = null;
    for (let i = 0; i < fuelMs(1) / STEP_MS + 5 && !out; i++) {
      const t = r.advance();
      if (t.doused.length > 0) out = t;
    }
    expect(out?.doused).toEqual([1]);
    const gone = you(r, p)!;
    expect(gone.station).toBeNull();
    expect(gone.notes).toEqual(['The fire has gone out.']);
    expect(r.snapshotFor(p.id)?.fires).toEqual([]);
  });

  it('refuses without the makings, mid-walk, or on top of another fire, and is walked around and used from beside', () => {
    const r = room();
    const p = enterOk(r, 'Dee', { x: 2, y: 4 }, { bag: [stack('stone'), stack('oak_log')] });
    r.takeYou();
    expect(r.fire(p.id, { t: 'fire', op: 'build' })).toBe(false);
    expect(you(r, p)?.notes).toEqual(['A campfire takes 2 stones and a log.']);
    const q = enterOk(r, 'Eve', { x: 4, y: 4 }, { bag: [stack('stone'), stack('stone'), stack('stone'), stack('stone'), stack('oak_log'), stack('oak_log')] });
    r.takeYou();
    r.queueInput(q.id, { seq: 1, to: { x: 9, y: 4 } });
    r.advance();
    expect(r.fire(q.id, { t: 'fire', op: 'build' })).toBe(false);
    expect(you(r, q)?.notes).toEqual(['Stand still to build a campfire.']);
    r.queueInput(q.id, { seq: 2, stop: true });
    for (let i = 0; i < 20 && (q.path.length > 0 || q.t > 0); i++) {
      r.advance();
      if (q.path.length > 0) r.queueInput(q.id, { seq: 3 + i });
    }
    expect(r.fire(q.id, { t: 'fire', op: 'build' })).toBe(true);
    const fireCell = { ...q.cell };
    fireCell.x += 1; // stepped west of it
    // Walk to the far side of the fire: the way goes around it, never through.
    const beyond = { x: fireCell.x + 2, y: fireCell.y };
    r.queueInput(q.id, { seq: 100, to: beyond });
    const walked: string[] = [];
    for (let i = 0; i < 40 && (q.path.length > 0 || q.t > 0 || i === 0); i++) {
      r.advance();
      walked.push(`${q.cell.x},${q.cell.y}`);
      if (q.path.length > 0) r.queueInput(q.id, { seq: 101 + i });
    }
    expect(q.cell).toEqual(beyond);
    expect(walked).not.toContain(`${fireCell.x},${fireCell.y}`);
    // Clicking the fire stops beside it and uses it.
    r.queueInput(q.id, { seq: 200, to: fireCell, use: true });
    for (let i = 0; i < 40 && (q.path.length > 0 || q.t > 0 || i === 0); i++) {
      r.advance();
      if (q.path.length > 0) r.queueInput(q.id, { seq: 201 + i });
    }
    expect(q.cell).toEqual({ x: fireCell.x + 1, y: fireCell.y });
    expect(you(r, q)?.station?.fid).toBe(1);

    // Hemmed in, there is nowhere to step off to; standing on the fire, no second one fits.
    const r2 = room({}, pocket);
    const h = enterOk(r2, 'Hem', null, { bag: [stack('stone'), stack('stone'), stack('stone'), stack('stone'), stack('oak_log'), stack('oak_log')] });
    r2.takeYou();
    expect(r2.fire(h.id, { t: 'fire', op: 'build' })).toBe(true);
    expect(h.cell).toEqual({ x: 2, y: 1 });
    expect(r2.fire(h.id, { t: 'fire', op: 'build' })).toBe(false);
    expect(you(r2, h)?.notes).toEqual(['You build a campfire.', 'There is no room for a fire here.']);
  });

  it('is fed logs, the lowest tier first, until it holds all it can', () => {
    const r = room();
    const logs = [stack('willow_log'), stack('willow_log'), ...new Array(10).fill(null).map(() => stack('oak_log'))];
    const p = enterOk(r, 'Fay', { x: 2, y: 4 }, { bag: [stack('stone'), stack('stone'), ...logs] });
    r.takeYou();
    expect(r.fire(p.id, { t: 'fire', op: 'feed' })).toBe(false);
    expect(you(r, p)?.notes).toEqual(['Stand by a campfire first.']);
    expect(r.fire(p.id, { t: 'fire', op: 'build' })).toBe(true);
    expect(countInBag(p.bag, 'oak_log')).toBe(9); // an oak log burnt, the willow kept
    useAndArrive(r, p, { x: 2, y: 4 }, { n: 0 });
    r.takeYou();
    expect(r.fire(p.id, { t: 'fire', op: 'feed' })).toBe(true);
    const fed = you(r, p)!;
    expect(fed.station?.fuelMs).toBeGreaterThan(fuelMs(1) + fuelMs(1) - 30 * STEP_MS);
    expect(fed.xp).toEqual([['crafting', 20]]);
    expect(fed.notes).toEqual(['You add an oak log to the fire.']);
    for (let i = 0; i < 8; i++) expect(r.fire(p.id, { t: 'fire', op: 'feed' })).toBe(true);
    expect(countInBag(p.bag, 'oak_log')).toBe(0);
    expect(you(r, p)?.station?.fuelMs).toBeGreaterThan(FIRE_MAX_MS - 1000); // ten minutes less the ticks that passed
    expect(r.fire(p.id, { t: 'fire', op: 'feed' })).toBe(true); // the first willow tops it up to the cap
    expect(you(r, p)?.station?.fuelMs).toBe(FIRE_MAX_MS);
    expect(r.fire(p.id, { t: 'fire', op: 'feed' })).toBe(false); // the second cannot go in
    expect(you(r, p)?.notes).toEqual(['The fire is burning as high as it can.']);
    expect(countInBag(p.bag, 'willow_log')).toBe(1);
  });
});

describe('cooking', () => {
  it('cooks raw shrimp at the village fire one by one, with xp for each that comes out right', () => {
    const r = room({ rng: new ScriptedRng([true, false, true]) });
    const p = enterOk(r, 'Gil', { x: 2, y: 2 }, { bag: [stack('raw_shrimp'), stack('raw_shrimp'), stack('raw_shrimp'), stack('raw_trout')] });
    r.takeYou();
    expect(r.make(p.id, 'cook_shrimp', 3)).toBe(false);
    expect(you(r, p)?.notes).toEqual(['Stand by a campfire first.']);
    useAndArrive(r, p, VILLAGE_FIRE, { n: 0 });
    expect(you(r, p)?.station).toEqual({ station: 'campfire', fid: null, fuelMs: null });
    expect(r.make(p.id, 'cook_trout', 1)).toBe(false);
    expect(you(r, p)?.notes).toEqual(['You need Cooking level 15 to make trout.']);
    expect(r.make(p.id, 'smelt_bronze_bar', 1)).toBe(false); // not a campfire recipe
    expect(you(r, p)?.notes).toEqual(['You need a furnace to make bronze bar.']);
    expect(r.make(p.id, 'cook_shrimp', 3)).toBe(true);
    expect(p.action).toEqual({ kind: 'make', recipe: 'cook_shrimp', left: 3, cell: VILLAGE_FIRE });
    expect(r.advance().acts).toEqual([[p.id, 3, 2, 2, 36]]); // facing the fire, 36 ticks a shrimp
    for (let i = 1; i < SHRIMP_STEPS; i++) r.advance();
    const first = you(r, p)!;
    expect(countInBag(p.bag, 'shrimp')).toBe(1);
    expect(countInBag(p.bag, 'raw_shrimp')).toBe(2);
    expect(first.xp).toEqual([['cooking', 30]]);
    for (let i = 0; i < SHRIMP_STEPS; i++) r.advance();
    const second = you(r, p)!;
    expect(second.notes).toEqual(['You accidentally burn the shrimp.']);
    expect(countInBag(p.bag, 'raw_shrimp')).toBe(1);
    let stopped = null;
    for (let i = 0; i < SHRIMP_STEPS && !stopped; i++) {
      const t = r.advance();
      if (t.acts.some((a) => a[0] === p.id && a[1] === -1)) stopped = t;
    }
    expect(stopped).not.toBeNull();
    expect(countInBag(p.bag, 'shrimp')).toBe(2);
    expect(countInBag(p.bag, 'raw_shrimp')).toBe(0);
    expect(p.action).toBeNull();
    expect(p.skills.cooking).toBe(60);
    r.takeYou();
    expect(r.make(p.id, 'cook_shrimp', 1)).toBe(false);
    expect(you(r, p)?.notes).toEqual(['You have nothing to make shrimp from.']);
  });

  it('smelts bars at the furnace and forges a dagger at the anvil, by level, quicker with every level', () => {
    const r = room();
    const p = enterOk(r, 'Lia', { x: 5, y: 3 }, { bag: [stack('copper_ore'), stack('tin_ore'), stack('copper_ore'), stack('tin_ore'), stack('iron_ore'), stack('oak_log')] });
    r.takeYou();
    r.acceptQuest(p.id, 'apprentice_smith');
    useAndArrive(r, p, FURNACE, { n: 0 });
    expect(you(r, p)?.station).toEqual({ station: 'furnace', fid: null, fuelMs: null });
    expect(r.make(p.id, 'smelt_iron_bar', 1)).toBe(false);
    expect(you(r, p)?.notes).toEqual(['You need Smithing level 15 to make iron bar.']);
    expect(r.make(p.id, 'smith_bronze_dagger', 1)).toBe(false);
    expect(you(r, p)?.notes).toEqual(['You need an anvil to make bronze dagger.']);
    expect(r.make(p.id, 'smelt_bronze_bar', 5)).toBe(true); // only the makings for two
    expect(p.action).toMatchObject({ kind: 'make', recipe: 'smelt_bronze_bar', left: 2 });
    expect(r.advance().acts).toEqual([[p.id, 6, 3, 2, 60]]); // 3000 ms at level 1, in 100 ms action ticks
    for (let i = 1; i < 60; i++) r.advance();
    expect(countInBag(p.bag, 'bronze_bar')).toBe(1);
    expect(countInBag(p.bag, 'copper_ore')).toBe(1);
    for (let i = 0; i < 60; i++) r.advance();
    expect(countInBag(p.bag, 'bronze_bar')).toBe(2);
    expect(countInBag(p.bag, 'copper_ore')).toBe(0);
    expect(p.action).toBeNull();
    expect(p.skills.smithing).toBe(16);
    expect(you(r, p)?.quests).toEqual([['apprentice_smith', 'active', [2, 0]]]);
    useAndArrive(r, p, ANVIL, { n: 50 });
    expect(you(r, p)?.station?.station).toBe('anvil');
    expect(r.make(p.id, 'smith_bronze_dagger', 1)).toBe(true);
    for (let i = 0; i < 60; i++) r.advance();
    expect(countInBag(p.bag, 'bronze_dagger')).toBe(1);
    expect(countInBag(p.bag, 'bronze_bar')).toBe(1);
    expect(countInBag(p.bag, 'oak_log')).toBe(0);
    expect(p.skills.smithing).toBe(28);
    expect(you(r, p)?.quests).toEqual([['apprentice_smith', 'active', [2, 1]]]);
    // A seasoned smith works faster: level 51 is half the time.
    const q = enterOk(r, 'Mo', { x: 7, y: 3 }, { skills: { smithing: xpForLevel(51) }, bag: [stack('copper_ore'), stack('tin_ore')] });
    useAndArrive(r, q, FURNACE, { n: 0 });
    r.takeYou();
    expect(r.make(q.id, 'smelt_bronze_bar', 1)).toBe(true);
    expect(r.advance().acts).toEqual([[q.id, 6, 3, 1, 30]]);
  });

  it('stops, and leaves the fire, when you walk away', () => {
    const r = room();
    const p = enterOk(r, 'Hal', { x: 2, y: 2 }, { bag: [stack('raw_shrimp'), stack('raw_shrimp')] });
    useAndArrive(r, p, VILLAGE_FIRE, { n: 0 });
    r.takeYou();
    expect(r.make(p.id, 'cook_shrimp', 2)).toBe(true);
    r.advance();
    r.queueInput(p.id, { seq: 50, to: { x: 2, y: 4 } });
    const t = r.advance();
    expect(t.acts).toEqual([[p.id, -1, -1, 2]]);
    expect(p.action).toBeNull();
    expect(you(r, p)?.station).toBeNull();
    expect(countInBag(p.bag, 'raw_shrimp')).toBe(2);
  });

  it('is kept with the character: coins, the stone tools and the belt read back', () => {
    const r = room();
    const p = enterOk(r, 'Ivy', null, { coins: 40, bag: [stack('bronze_hatchet')], belt: { mining: stack('bronze_pickaxe'), fishing: stack('oak_log'), lumberjack: stack('oak_rod') } });
    expect(p.coins).toBe(40);
    expect(r.youOf(p.id)?.coins).toBe(40);
    expect(p.bag[0]).toEqual({ itemId: 'stone_hatchet', qty: 1 });
    expect(p.belt).toEqual({ mining: { itemId: 'stone_pickaxe', qty: 1 } }); // a log is no tool, a rod is no hatchet
    expect(stateOf(p).belt).toEqual({ mining: { itemId: 'stone_pickaxe', qty: 1 } });
  });
});
