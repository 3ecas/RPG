import { describe, expect, it } from 'vitest';
import { CONTENT } from '@/content';
import { Registry } from '@/core/registry';
import { Rng } from '@/core/rng';
import type { Character } from '@/server/character';
import { eventKey, isComplete, liveProgress, questView, targetOf } from '@/server/quests';
import { Room, type RoomOptions, type RoomPlayer } from '@/server/room';
import { parseState, stateOf } from '@/server/state';
import { World } from '@/server/world';
import type { ZoneMapDef } from '@/types/content';
import type { Cell } from '@/world/grid';
import { emptyBag } from '@/world/bag';

/** The village in little: Pell by the oak, Maren, the captain and Tobb along the row. */
const map: ZoneMapDef = {
  biome: 'meadow',
  rows: [
    '^^^^^^^^^^^^',
    '^S..A......^',
    '^.L........^',
    '^...M.K..O.^',
    '^^^^^^^^^^^^',
  ],
  legend: {
    S: { kind: 'spawn' },
    A: { kind: 'node', id: 'oak_tree' },
    L: { kind: 'npc', id: 'keeper_pell' },
    M: { kind: 'npc', id: 'elder_maren' },
    K: { kind: 'npc', id: 'captain_bram' },
    O: { kind: 'npc', id: 'angler_tobb' },
  },
};
const OAK: Cell = { x: 4, y: 1 };
const PELL: Cell = { x: 2, y: 2 };
const content = new Registry(CONTENT);

class YesRng extends Rng {
  constructor(private readonly answers: boolean[]) {
    super(3);
  }
  override chance(probability: number): boolean {
    return this.answers.length > 0 ? this.answers.shift()! : super.chance(probability);
  }
}

function room(options: Partial<RoomOptions> = {}): Room {
  return new Room('greenhollow', map, { graceTicks: 3, capacity: 4, content, rng: new YesRng([]), rules: { actionSteps: 2 }, ...options });
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

describe('quests: the helpers', () => {
  it('knows targets, event keys and live progress', () => {
    expect(targetOf({ type: 'gather', itemId: 'oak_log', count: 5 })).toBe(5);
    expect(targetOf({ type: 'talk', npcId: 'keeper_pell' })).toBe(1);
    expect(eventKey({ type: 'talk', npcId: 'keeper_pell' })).toEqual({ type: 'talk', key: 'keeper_pell' });
    expect(eventKey({ type: 'visit', zoneId: 'copper_hills' })).toEqual({ type: 'visit', key: 'copper_hills' });
    expect(eventKey({ type: 'collect', itemId: 'oak_log', count: 3 })).toBeNull();
    const bag = emptyBag();
    bag[0] = { itemId: 'oak_log', qty: 1 };
    bag[1] = { itemId: 'oak_log', qty: 1 };
    const live = { bag, skills: { lumberjack: 2411 } as never, worn: ['weapon' as const] };
    expect(liveProgress({ type: 'collect', itemId: 'oak_log', count: 3 }, live)).toBe(2);
    expect(liveProgress({ type: 'reach_tier', skill: 'lumberjack', tier: 2 }, live)).toBe(1);
    expect(liveProgress({ type: 'reach_tier', skill: 'lumberjack', tier: 3 }, live)).toBe(0);
    expect(liveProgress({ type: 'any_tier', tier: 2 }, live)).toBe(1);
    expect(liveProgress({ type: 'equip', kind: 'weapon' }, live)).toBe(1);
    expect(liveProgress({ type: 'equip', kind: 'head' }, live)).toBe(0);
    expect(liveProgress({ type: 'gather', itemId: 'oak_log', count: 1 }, live)).toBeNull();
    const def = content.quest('timber_for_pell');
    expect(isComplete(def, [1, 4])).toBe(false);
    expect(isComplete(def, [1, 5])).toBe(true);
    expect(questView({ timber_for_pell: { status: 'active', progress: [1, 2] } })).toEqual([['timber_for_pell', 'active', [1, 2]]]);
  });
});

describe('quests: in the room', () => {
  it('is taken from the journal, moves on talk and gather, and completes with its rewards', () => {
    const r = room({ rng: new YesRng(new Array(20).fill(false)) }); // the oak never falls
    const p = enterOk(r, 'Ada', { x: 3, y: 1 }, { bag: [{ itemId: 'stone_hatchet', qty: 1 }] });
    r.takeYou();
    expect(r.acceptQuest(p.id, 'timber_for_pell')).toBe(true);
    const y1 = you(r, p)!;
    expect(y1.quests).toEqual([['timber_for_pell', 'active', [0, 0]]]);
    expect(y1.notes).toEqual(['Quest accepted: Timber for Pell.']);
    expect(r.acceptQuest(p.id, 'timber_for_pell')).toBe(false);
    expect(you(r, p)?.notes).toEqual(['You are already on Timber for Pell.']);
    const seq = { n: 0 };
    useAndArrive(r, p, PELL, seq);
    const y2 = you(r, p)!;
    expect(y2.talk?.npc).toBe('keeper_pell');
    expect(y2.quests).toEqual([['timber_for_pell', 'active', [1, 0]]]);
    useAndArrive(r, p, OAK, seq);
    expect(p.action).not.toBeNull();
    let done = null;
    for (let i = 0; i < 1400 && !done; i++) {
      r.advance();
      const y = you(r, p);
      if (y?.quests?.[0]?.[1] === 'done') done = y;
    }
    expect(done?.quests).toEqual([['timber_for_pell', 'done', [1, 5]]]);
    expect(done?.notes?.some((n) => n.startsWith('Quest complete: Timber for Pell.'))).toBe(true);
    expect(done?.notes?.some((n) => n === 'You receive 25 coins, 100 Lumberjack xp, Copper Ring.')).toBe(true);
    expect(p.skills.lumberjack).toBe(5 * 10 + 100);
    expect(p.coins).toBe(25);
    expect(done?.coins).toBe(25);
    expect(p.bag.some((s) => s?.itemId === 'copper_ring')).toBe(true);
    expect(p.quests.timber_for_pell?.status).toBe('done');
    expect(r.acceptQuest(p.id, 'timber_for_pell')).toBe(false);
    expect(you(r, p)?.notes).toEqual(['You have already finished Timber for Pell.']);
    expect(r.abandonQuest(p.id, 'timber_for_pell')).toBe(false);
  });

  it('refuses quests that are not there, or need another quest first, and can be given up', () => {
    const r = room();
    const p = enterOk(r, 'Bob');
    r.takeYou();
    expect(r.acceptQuest(p.id, 'dragon_slaying')).toBe(false);
    expect(r.acceptQuest(p.id, 'goblin_menace')).toBe(false);
    expect(you(r, p)?.notes).toEqual(['You need to finish Rat Problem first.']);
    expect(r.acceptQuest(p.id, 'village_tour')).toBe(true);
    expect(r.abandonQuest(p.id, 'village_tour')).toBe(true);
    expect(you(r, p)?.notes).toEqual(['Quest accepted: A Walk Around the Village.', 'Quest abandoned: A Walk Around the Village.']);
    expect(p.quests.village_tour).toBeUndefined();
    expect(r.abandonQuest(p.id, 'village_tour')).toBe(false);
  });

  it('reads live objectives off the character, and counts a visit when you arrive in the zone', () => {
    const r = room();
    const p = enterOk(r, 'Cyd', null, { bag: [{ itemId: 'shrimp', qty: 1 }] });
    r.takeYou();
    r.acceptQuest(p.id, 'fresh_catch'); // have ten shrimp in your bag
    expect(you(r, p)?.quests).toEqual([['fresh_catch', 'active', [1]]]);
    // Nine more shrimp arrive (a bank withdrawal would do it; here the bag is filled by hand and the bag change flagged).
    for (let i = 1; i < 10; i++) p.bag[i] = { itemId: 'shrimp', qty: 1 };
    r.bank(p.id, { t: 'bank', op: 'close' }); // any command that marks the bag; a close marks nothing, so flag it as a withdrawal would
    p.you.bag = true;
    const y = you(r, p)!;
    expect(y.quests).toEqual([['fresh_catch', 'done', [10]]]);
    expect(y.notes?.[0]).toContain('Quest complete: Fresh Catch.');

    const w = new World(content, { startZone: 'greenhollow', graceTicks: 3, capacity: 10, seed: 1 });
    const walker = w.enter({ name: 'Dee', secretHash: 'h', createdAt: 0, dir: 0, running: false, state: {}, zone: 'greenhollow', x: 38, y: 11, lastSeenAt: 0 });
    if (!walker.ok) throw new Error(walker.reason);
    const dee = walker.value;
    const hollow = w.room('greenhollow');
    hollow.acceptQuest(dee.id, 'village_tour');
    w.takeYou();
    let seq = 0;
    w.queueInput(dee.id, { seq: ++seq, to: { x: 39, y: 11 } });
    for (let i = 0; i < 20; i++) {
      const tick = w.advance();
      if (tick.moved.length > 0) break;
      w.queueInput(dee.id, { seq: ++seq });
    }
    expect(w.zoneOf(dee.id)).toBe('copper_hills');
    expect(w.takeYou().get(dee.id)?.quests).toEqual([['village_tour', 'active', [0, 0, 0, 1]]]);
  });

  it('is kept with the character and read back, dropping what the content no longer has', () => {
    const state = parseState({ coins: 12.7, quests: { timber_for_pell: { status: 'active', progress: [1, 3, 9] }, rat_problem: { status: 'done' }, nope: { status: 'active', progress: [] }, village_tour: { status: 'maybe', progress: [] } } }, content, []);
    expect(state.quests).toEqual({ timber_for_pell: { status: 'active', progress: [1, 3] }, rat_problem: { status: 'done', progress: [0, 0] } });
    expect(state.coins).toBe(12);
    expect(stateOf(state).quests).toEqual({ timber_for_pell: { status: 'active', progress: [1, 3] }, rat_problem: { status: 'done', progress: [0, 0] } });
    expect(stateOf(state).coins).toBe(12);
    expect(parseState({ coins: -4 }, content, []).coins).toBe(0);
    const r = room();
    const p = enterOk(r, 'Eve', null, { quests: { timber_for_pell: { status: 'active', progress: [1, 4] } } });
    expect(r.youOf(p.id)?.quests).toEqual([['timber_for_pell', 'active', [1, 4]]]);
  });
});
