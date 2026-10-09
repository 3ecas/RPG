import { describe, expect, it } from 'vitest';
import { CONTENT } from '@/content';
import { Registry } from '@/core/registry';
import { Rng } from '@/core/rng';
import type { Character } from '@/server/character';
import { Room, type RoomOptions, type RoomPlayer } from '@/server/room';
import type { ZoneMapDef } from '@/types/content';
import type { Cell } from '@/world/grid';
import { countInBag } from '@/world/bag';
import { FIRE_MAX_MS, fuelMs } from '@/world/fire';
import { STEP_MS } from '@/world/motion';

/** A corner of the village: Rowan and Greta, the village fire, a pile of loose stones, and room to walk around a fire. */
const map: ZoneMapDef = {
  biome: 'meadow',
  rows: [
    '^^^^^^^^^^^^',
    '^S.....W...^',
    '^..F...G...^',
    '^.R........^',
    '^..........^',
    '^..........^',
    '^^^^^^^^^^^^',
  ],
  legend: {
    S: { kind: 'spawn' },
    W: { kind: 'npc', id: 'lumberjack_rowan' },
    G: { kind: 'npc', id: 'mason_greta' },
    F: { kind: 'station', id: 'campfire' },
    R: { kind: 'node', id: 'rubble' },
  },
};
/** One cell with nothing free around it. */
const pocket: ZoneMapDef = {
  biome: 'meadow',
  rows: ['^^^^^', '^#S#^', '^###^', '^^^^^'],
  legend: { S: { kind: 'spawn' } },
};
const ROWAN: Cell = { x: 7, y: 1 };
const GRETA: Cell = { x: 7, y: 2 };
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
  it('starts you with nothing; Rowan hands over a stone hatchet once, and Greta a pickaxe', () => {
    const r = room();
    const p = enterOk(r, 'Ada', { x: 6, y: 1 });
    expect(p.bag.every((s) => s === null)).toBe(true);
    r.takeYou();
    const seq = { n: 0 };
    useAndArrive(r, p, ROWAN, seq);
    const y1 = you(r, p)!;
    expect(y1.notes?.[0]).toContain('Rowan: The oaks are all yours');
    expect(y1.notes).toContain('Rowan hands you a stone hatchet.');
    expect(countInBag(p.bag, 'stone_hatchet')).toBe(1);
    useAndArrive(r, p, ROWAN, seq);
    const y2 = you(r, p)!;
    expect(y2.notes).toHaveLength(1); // the greeting only: you have one
    expect(countInBag(p.bag, 'stone_hatchet')).toBe(1);
    useAndArrive(r, p, GRETA, seq);
    expect(you(r, p)?.notes).toContain('Greta hands you a stone pickaxe.');
    expect(countInBag(p.bag, 'stone_pickaxe')).toBe(1);
  });

  it('says so when the bag is full', () => {
    const r = room();
    const p = enterOk(r, 'Bob', { x: 6, y: 2 }, { bag: new Array(28).fill(stack('oak_log')) });
    r.takeYou();
    useAndArrive(r, p, GRETA, { n: 0 });
    expect(you(r, p)?.notes).toContain('Greta has a stone pickaxe for you, but your bag is full.');
    expect(countInBag(p.bag, 'stone_pickaxe')).toBe(0);
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
    const session = you(r, p)!.fire!;
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
    expect(gone.fire).toBeNull();
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
    expect(you(r, q)?.fire?.fid).toBe(1);

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
    expect(you(r, p)?.notes).toEqual(['Stand by a fire first.']);
    expect(r.fire(p.id, { t: 'fire', op: 'build' })).toBe(true);
    expect(countInBag(p.bag, 'oak_log')).toBe(9); // an oak log burnt, the willow kept
    useAndArrive(r, p, { x: 2, y: 4 }, { n: 0 });
    r.takeYou();
    expect(r.fire(p.id, { t: 'fire', op: 'feed' })).toBe(true);
    const fed = you(r, p)!;
    expect(fed.fire?.fuelMs).toBeGreaterThan(fuelMs(1) + fuelMs(1) - 30 * STEP_MS);
    expect(fed.xp).toEqual([['crafting', 20]]);
    expect(fed.notes).toEqual(['You add an oak log to the fire.']);
    for (let i = 0; i < 8; i++) expect(r.fire(p.id, { t: 'fire', op: 'feed' })).toBe(true);
    expect(countInBag(p.bag, 'oak_log')).toBe(0);
    expect(you(r, p)?.fire?.fuelMs).toBeGreaterThan(FIRE_MAX_MS - 1000); // ten minutes less the ticks that passed
    expect(r.fire(p.id, { t: 'fire', op: 'feed' })).toBe(true); // the first willow tops it up to the cap
    expect(you(r, p)?.fire?.fuelMs).toBe(FIRE_MAX_MS);
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
    expect(r.cook(p.id, 'cook_shrimp', 3)).toBe(false);
    expect(you(r, p)?.notes).toEqual(['Stand by a fire first.']);
    useAndArrive(r, p, VILLAGE_FIRE, { n: 0 });
    expect(you(r, p)?.fire).toEqual({ fid: null, fuelMs: null });
    expect(r.cook(p.id, 'cook_trout', 1)).toBe(false);
    expect(you(r, p)?.notes).toEqual(['You need Cooking level 15 to cook trout.']);
    expect(r.cook(p.id, 'smelt_bronze_bar', 1)).toBe(false); // not a campfire recipe
    expect(r.cook(p.id, 'cook_shrimp', 3)).toBe(true);
    expect(p.action).toEqual({ kind: 'cook', recipe: 'cook_shrimp', left: 3, cell: VILLAGE_FIRE });
    expect(r.advance().acts).toEqual([[p.id, 3, 2, 2]]); // facing the fire
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
    expect(r.cook(p.id, 'cook_shrimp', 1)).toBe(false);
    expect(you(r, p)?.notes).toEqual(['You have nothing to make shrimp from.']);
  });

  it('stops, and leaves the fire, when you walk away', () => {
    const r = room();
    const p = enterOk(r, 'Hal', { x: 2, y: 2 }, { bag: [stack('raw_shrimp'), stack('raw_shrimp')] });
    useAndArrive(r, p, VILLAGE_FIRE, { n: 0 });
    r.takeYou();
    expect(r.cook(p.id, 'cook_shrimp', 2)).toBe(true);
    r.advance();
    r.queueInput(p.id, { seq: 50, to: { x: 2, y: 4 } });
    const t = r.advance();
    expect(t.acts).toEqual([[p.id, -1, -1, 2]]);
    expect(p.action).toBeNull();
    expect(you(r, p)?.fire).toBeNull();
    expect(countInBag(p.bag, 'raw_shrimp')).toBe(2);
  });

  it('is kept with the character: coins and the stone tools read back', () => {
    const r = room();
    const p = enterOk(r, 'Ivy', null, { coins: 40, bag: [stack('bronze_hatchet')] });
    expect(p.coins).toBe(40);
    expect(r.youOf(p.id)?.coins).toBe(40);
    expect(p.bag[0]).toEqual({ itemId: 'stone_hatchet', qty: 1 });
  });
});
