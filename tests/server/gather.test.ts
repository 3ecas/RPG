import { describe, expect, it } from 'vitest';
import { CONTENT } from '@/content';
import { Registry } from '@/core/registry';
import { Rng } from '@/core/rng';
import type { Character } from '@/server/character';
import { Room, type RoomOptions, type RoomPlayer } from '@/server/room';
import { parseState, stateOf } from '@/server/state';
import type { ZoneMapDef } from '@/types/content';
import type { Cell } from '@/world/grid';
import { freeSlots } from '@/world/bag';

/** A field with an oak, a willow, a bank chest and a spawn. */
const map: ZoneMapDef = {
  biome: 'meadow',
  rows: [
    '^^^^^^^^^^',
    '^S.......^',
    '^..A...Q.^',
    '^........^',
    '^......W.^',
    '^^^^^^^^^^',
  ],
  legend: {
    S: { kind: 'spawn' },
    A: { kind: 'node', id: 'oak_tree' },
    W: { kind: 'node', id: 'willow_tree' },
    Q: { kind: 'bank' },
  },
};
const OAK: Cell = { x: 3, y: 2 };
const WILLOW: Cell = { x: 7, y: 4 };
const BANK: Cell = { x: 7, y: 2 };
const content = new Registry(CONTENT);

/** Dice that answer as told, then as a seeded Rng would. The room rolls success first, then depletion, on every success. */
class ScriptedRng extends Rng {
  constructor(private readonly answers: boolean[] = []) {
    super(7);
  }
  override chance(probability: number): boolean {
    return this.answers.length > 0 ? this.answers.shift()! : super.chance(probability);
  }
}

function room(options: Partial<RoomOptions> = {}, def: ZoneMapDef = map): Room {
  return new Room('greenhollow', def, { graceTicks: 3, capacity: 4, content, rng: new ScriptedRng(), rules: { actionSteps: 2, itemPublicSteps: 10, itemGoneSteps: 20 }, ...options });
}

function character(name: string, state: Record<string, unknown> = {}): Character {
  return { name, secretHash: 'h', createdAt: 0, dir: 0, running: false, state };
}

function enterOk(r: Room, name: string, at: Cell | null = null, state: Record<string, unknown> = {}): RoomPlayer {
  const result = r.enter(character(name, state), at);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

/** Clicks `cell` to use it and feeds one step per tick until the walk is over; returns the ticks it took. */
function useAndArrive(r: Room, p: RoomPlayer, cell: Cell, seq: { n: number }): number {
  r.queueInput(p.id, { seq: ++seq.n, to: cell, use: true });
  let ticks = 0;
  do {
    r.advance();
    ticks++;
    if (p.path.length > 0) r.queueInput(p.id, { seq: ++seq.n });
  } while (p.path.length > 0 && ticks < 200);
  return ticks;
}

const oakIndex = (r: Room) => r.grid.objects.find((o) => o.x === OAK.x && o.y === OAK.y)!.index;
const you = (r: Room, p: RoomPlayer) => r.takeYou().get(p.id);
const logsIn = (p: RoomPlayer) => p.bag.filter((s) => s?.itemId === 'oak_log').length;

describe('gathering: chopping a tree', () => {
  it('walks up to the clicked tree, faces it, and chops a log on every action tick that succeeds', () => {
    const r = room({ rng: new ScriptedRng([true, false, false, true, false]) });
    const p = enterOk(r, 'Ada');
    const seq = { n: 0 };
    useAndArrive(r, p, OAK, seq);
    expect(p.cell).toEqual({ x: 3, y: 1 }); // beside the oak, which stands at (3, 2)
    expect(p.action).toEqual({ kind: 'gather', object: oakIndex(r), cell: OAK });
    expect(p.dir).toBe(0); // facing down, at the tree
    expect(r.snapshot()[0]?.act).toEqual([3, 2]);
    r.takeYou();
    // Two action ticks: the first succeeds (no depletion), the second fails, the third succeeds.
    r.advance();
    const first = r.advance();
    expect(first.acts).toEqual([]);
    expect(logsIn(p)).toBe(1);
    const y1 = you(r, p)!;
    expect(y1.bag?.filter((s) => s?.[0] === 'oak_log')).toHaveLength(1);
    expect(y1.xp).toEqual([['woodcutting', 10]]);
    expect(p.skills.woodcutting).toBe(10);
    r.advance();
    r.advance();
    expect(logsIn(p)).toBe(1);
    r.advance();
    r.advance();
    expect(logsIn(p)).toBe(2);
    expect(p.skills.woodcutting).toBe(20);
    expect(p.action).not.toBeNull(); // still at it
  });

  it('announces the swing to the room and the stop when the walk is interrupted by another click', () => {
    const r = room();
    const p = enterOk(r, 'Ada');
    const seq = { n: 0 };
    r.queueInput(p.id, { seq: ++seq.n, to: OAK, use: true });
    const acts = [];
    for (let i = 0; i < 40 && !p.action; i++) {
      acts.push(...r.advance().acts);
      if (p.path.length > 0) r.queueInput(p.id, { seq: ++seq.n });
    }
    expect(acts).toEqual([[p.id, OAK.x, OAK.y, 0]]);
    r.queueInput(p.id, { seq: ++seq.n, to: { x: 1, y: 3 } });
    expect(r.advance().acts).toEqual([[p.id, -1, -1, 0]]);
    expect(p.action).toBeNull();
  });

  it('refuses without a hatchet, below the level, with a full bag, and when it cannot get beside the tree', () => {
    const r = room();
    const bare = enterOk(r, 'Bare', null, { bag: [] });
    const seq = { n: 0 };
    useAndArrive(r, bare, OAK, seq);
    expect(bare.action).toBeNull();
    expect(you(r, bare)?.notes).toEqual(['You need a hatchet for that.']);

    const low = enterOk(r, 'Low', { x: 6, y: 3 });
    const seq2 = { n: 0 };
    useAndArrive(r, low, WILLOW, seq2);
    expect(you(r, low)?.notes).toEqual(['You need Woodcutting level 15 for the willow tree.']);

    const full = enterOk(r, 'Full', { x: 2, y: 1 }, { bag: new Array(28).fill({ itemId: 'bronze_hatchet', qty: 1 }) });
    const seq3 = { n: 0 };
    useAndArrive(r, full, OAK, seq3);
    expect(you(r, full)?.notes).toEqual(['Your bag is full.']);

    const far = enterOk(r, 'Far');
    const seq4 = { n: 0 };
    r.queueInput(far.id, { seq: ++seq4.n, to: { x: 50, y: 50 }, use: true });
    r.advance();
    expect(you(r, far)?.notes).toEqual(["You can't reach that from here."]);
  });

  it('fills the bag, says so, and stops', () => {
    const r = room({ rng: new ScriptedRng(new Array(60).fill(null).flatMap(() => [true, false])) });
    const p = enterOk(r, 'Ada', { x: 3, y: 1 }, { bag: new Array(26).fill({ itemId: 'bronze_hatchet', qty: 1 }) });
    const seq = { n: 0 };
    useAndArrive(r, p, OAK, seq);
    expect(freeSlots(p.bag)).toBe(2);
    for (let i = 0; i < 4; i++) r.advance();
    expect(freeSlots(p.bag)).toBe(0);
    expect(p.action).toBeNull();
    expect(you(r, p)?.notes).toEqual(['Your bag is full.']);
    expect(p.skills.woodcutting).toBe(20);
  });

  it('fells the tree for everyone, who all stop, and lets it grow back', () => {
    const r = room({ rng: new ScriptedRng([true, true]) });
    // Both already beside the oak, so both are at work before the first action tick.
    const ada = enterOk(r, 'Ada', { x: 3, y: 1 });
    const bob = enterOk(r, 'Bob', { x: 3, y: 3 });
    const sa = { n: 0 };
    const sb = { n: 0 };
    useAndArrive(r, ada, OAK, sa);
    useAndArrive(r, bob, OAK, sb);
    expect(ada.action && bob.action).toBeTruthy();
    const index = oakIndex(r);
    let fell = null;
    for (let i = 0; i < 6 && !fell; i++) {
      const delta = r.advance();
      if (delta.nodes.length > 0) fell = delta;
    }
    expect(fell?.nodes).toEqual([[index, 1]]);
    expect(fell?.acts.map((a) => a[1]).sort()).toEqual([-1, -1]);
    expect(ada.action ?? bob.action).toBeNull();
    expect(r.isDepleted(index)).toBe(true);
    expect(r.snapshotFor(ada.id)?.nodes).toEqual([index]);
    // Clicking it again while it is down is refused.
    useAndArrive(r, bob, OAK, sb);
    expect(you(r, bob)?.notes).toEqual(['The oak tree has nothing left right now.']);
    // Oaks come back after eight seconds: 160 ticks of 50 ms.
    let back = null;
    for (let i = 0; i < 200 && !back; i++) {
      const delta = r.advance();
      if (delta.nodes.length > 0) back = delta;
    }
    expect(back?.nodes).toEqual([[index, 0]]);
    expect(r.isDepleted(index)).toBe(false);
  });

  it('tells of a new level', () => {
    const r = room({ rng: new ScriptedRng([true, false]) });
    const p = enterOk(r, 'Ada', { x: 3, y: 1 }, { skills: { woodcutting: 80 } });
    useAndArrive(r, p, OAK, { n: 0 });
    r.takeYou();
    r.advance();
    r.advance();
    expect(p.skills.woodcutting).toBe(90);
    expect(you(r, p)?.notes).toEqual(['Congratulations, your Woodcutting level is now 2.']);
  });
});

describe('items on the ground', () => {
  it('drops where you stand, yours alone to see for a while, then anyone to take, then gone', () => {
    const r = room();
    const ada = enterOk(r, 'Ada', { x: 2, y: 3 });
    const bob = enterOk(r, 'Bob', { x: 3, y: 3 }); // one step from where the drop will lie
    r.advance();
    expect(r.drop(ada.id, 0)).toBe(true); // the hatchet
    expect(ada.bag[0]).toBeNull();
    const ya = you(r, ada)!;
    expect(ya.bag?.[0]).toBeNull();
    expect(ya.items).toEqual([[1, 'bronze_hatchet', 1, 2, 3]]);
    expect(r.snapshotFor(bob.id)?.items).toEqual([]);
    expect(r.snapshotFor(ada.id)?.items).toEqual([[1, 'bronze_hatchet', 1, 2, 3]]);
    expect(r.drop(ada.id, 0)).toBe(false); // nothing there now
    // Bob cannot take what he cannot see.
    const sb = { n: 0 };
    useAndArrive(r, bob, { x: 2, y: 3 }, sb);
    expect(bob.bag.filter((s) => s !== null)).toHaveLength(1);
    // Ten ticks after the drop it shows to everyone.
    let shown = null;
    for (let i = 0; i < 12 && !shown; i++) {
      const delta = r.advance();
      if (delta.drops.length > 0) shown = delta;
    }
    expect(shown?.drops).toEqual([[1, 'bronze_hatchet', 1, 2, 3]]);
    expect(r.snapshotFor(bob.id)?.items).toEqual([[1, 'bronze_hatchet', 1, 2, 3]]);
    useAndArrive(r, bob, { x: 2, y: 3 }, sb);
    expect(bob.bag.filter((s) => s?.itemId === 'bronze_hatchet')).toHaveLength(2);
    expect(r.groundItem(1)).toBeNull();
    expect(you(r, bob)?.bag?.filter((s) => s?.[0] === 'bronze_hatchet')).toHaveLength(2);
    // What nobody takes goes away.
    r.drop(bob.id, 0);
    let gone = null;
    for (let i = 0; i < 25 && !gone; i++) {
      const delta = r.advance();
      if (delta.taken.length > 0) gone = delta;
    }
    expect(gone?.taken).toEqual([2]);
    expect(r.groundItem(2)).toBeNull();
  });

  it('is taken from the cell or the one beside it, and needs room in the bag', () => {
    const r = room();
    const ada = enterOk(r, 'Ada', { x: 2, y: 3 });
    r.drop(ada.id, 0);
    const sa = { n: 0 };
    useAndArrive(r, ada, { x: 2, y: 3 }, sa); // standing on it already
    expect(ada.bag[0]).toEqual({ itemId: 'bronze_hatchet', qty: 1 });
    r.drop(ada.id, 0);
    const full = enterOk(r, 'Full', { x: 3, y: 3 }, { bag: new Array(28).fill({ itemId: 'oak_log', qty: 1 }) });
    r.advance();
    for (let i = 0; i < 12; i++) r.advance(); // now public
    r.takeYou();
    useAndArrive(r, full, { x: 2, y: 3 }, { n: 0 });
    expect(you(r, full)?.notes).toEqual(['Your bag is full.']);
    expect(r.groundItem(2)).not.toBeNull();
  });
});

describe('the bank', () => {
  it('opens beside the chest, takes deposits and gives withdrawals, and shuts when you walk off', () => {
    const r = room();
    const p = enterOk(r, 'Ada', { x: 5, y: 2 }, { bag: [{ itemId: 'bronze_hatchet', qty: 1 }, { itemId: 'oak_log', qty: 1 }, { itemId: 'oak_log', qty: 1 }] });
    const seq = { n: 0 };
    expect(r.bank(p.id, { t: 'bank', op: 'all' })).toBe(false); // not open yet
    useAndArrive(r, p, BANK, seq);
    expect(p.cell).toEqual({ x: 6, y: 2 });
    expect(p.bankOpen).toBe(true);
    expect(you(r, p)?.bank).toEqual([]);
    expect(r.bank(p.id, { t: 'bank', op: 'deposit', slot: 1, qty: 1 })).toBe(true);
    expect(p.bank).toEqual([{ itemId: 'oak_log', qty: 1 }]);
    expect(p.bag[1]).toBeNull();
    const y = you(r, p)!;
    expect(y.bank).toEqual([['oak_log', 1]]);
    expect(y.bag?.[1]).toBeNull();
    expect(r.bank(p.id, { t: 'bank', op: 'all' })).toBe(true);
    expect(p.bag.every((s) => s === null)).toBe(true);
    expect(p.bank).toEqual([{ itemId: 'oak_log', qty: 2 }, { itemId: 'bronze_hatchet', qty: 1 }]);
    expect(r.bank(p.id, { t: 'bank', op: 'withdraw', item: 'oak_log', qty: 5 })).toBe(true); // only two to give
    expect(p.bag.filter((s) => s?.itemId === 'oak_log')).toHaveLength(2);
    expect(p.bank).toEqual([{ itemId: 'bronze_hatchet', qty: 1 }]);
    expect(r.bank(p.id, { t: 'bank', op: 'withdraw', item: 'oak_log', qty: 1 })).toBe(false);
    expect(r.bank(p.id, { t: 'bank', op: 'withdraw', item: 'unobtainium', qty: 1 })).toBe(false);
    expect(r.bank(p.id, { t: 'bank', op: 'deposit', slot: 20, qty: 1 })).toBe(false);
    r.takeYou();
    r.queueInput(p.id, { seq: ++seq.n, to: { x: 4, y: 2 } });
    r.advance();
    expect(p.bankOpen).toBe(false);
    expect(you(r, p)?.bank).toBeNull();
    expect(r.bank(p.id, { t: 'bank', op: 'all' })).toBe(false);
  });

  it('will not hand out more than the bag can hold', () => {
    const r = room();
    const p = enterOk(r, 'Ada', { x: 6, y: 2 }, { bag: new Array(27).fill({ itemId: 'oak_log', qty: 1 }), bank: [{ itemId: 'oak_log', qty: 10 }] });
    useAndArrive(r, p, BANK, { n: 0 });
    expect(r.bank(p.id, { t: 'bank', op: 'withdraw', item: 'oak_log', qty: 10 })).toBe(true);
    expect(freeSlots(p.bag)).toBe(0);
    expect(p.bank).toEqual([{ itemId: 'oak_log', qty: 9 }]);
    r.takeYou();
    expect(r.bank(p.id, { t: 'bank', op: 'withdraw', item: 'oak_log', qty: 1 })).toBe(false);
    expect(you(r, p)?.notes).toEqual(['Your bag is full.']);
  });
});

describe('what the character keeps', () => {
  it('starts new characters with the kit, reads saved state back, and drops what the content no longer has', () => {
    const fresh = parseState({}, content, [{ itemId: 'bronze_hatchet', qty: 1 }]);
    expect(fresh.bag[0]).toEqual({ itemId: 'bronze_hatchet', qty: 1 });
    expect(fresh.bag.slice(1).every((s) => s === null)).toBe(true);
    expect(fresh.skills.woodcutting).toBe(0);
    expect(fresh.bank).toEqual([]);
    const saved = parseState({ skills: { woodcutting: 150, mining: -5, dancing: 9 }, bag: [null, { itemId: 'oak_log', qty: 1 }, { itemId: 'unobtainium', qty: 1 }, { itemId: 'coal', qty: 0 }], bank: [{ itemId: 'oak_log', qty: 3 }, { itemId: 'oak_log', qty: 2 }, 'junk'] }, content, []);
    expect(saved.skills.woodcutting).toBe(150);
    expect(saved.skills.mining).toBe(0);
    expect(saved.bag.slice(0, 4)).toEqual([null, { itemId: 'oak_log', qty: 1 }, null, null]);
    expect(saved.bank).toEqual([{ itemId: 'oak_log', qty: 5 }]);
    expect(parseState(stateOf(saved), content, []).bag).toEqual(saved.bag);
    const empty = parseState({ bag: [] }, content, [{ itemId: 'bronze_hatchet', qty: 1 }]);
    expect(empty.bag.every((s) => s === null)).toBe(true); // a saved empty bag is not a new character
  });

  it('comes back into a room as it was', () => {
    const r = room();
    const p = enterOk(r, 'Ada', null, { skills: { woodcutting: 2411 }, bag: [{ itemId: 'oak_log', qty: 1 }], bank: [{ itemId: 'oak_log', qty: 40 }] });
    expect(p.skills.woodcutting).toBe(2411);
    expect(p.bag[0]).toEqual({ itemId: 'oak_log', qty: 1 });
    expect(p.bank).toEqual([{ itemId: 'oak_log', qty: 40 }]);
    expect(r.youOf(p.id)).toEqual({ bag: expect.arrayContaining([['oak_log', 1]]), skills: expect.arrayContaining([['woodcutting', 2411], ['mining', 0]]) });
  });
});
