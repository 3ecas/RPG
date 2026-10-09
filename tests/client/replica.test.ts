import { describe, expect, it } from 'vitest';
import { BUBBLE_MS, type InputMessage, Replica, XP_DROP_MS } from '@/client/replica';
import type { EntitySnapshot, ServerMessage } from '@/net/protocol';
import type { ZoneMapDef } from '@/types/content';
import { parseMap } from '@/world/grid';
import { positionOf, STEP_MS, WALK_SPEED } from '@/world/motion';

const map: ZoneMapDef = {
  biome: 'meadow',
  rows: ['^^^^^^^^^^^^', '^S.........^', '^..........^', '^..........^', '^..........^', '^^^^^^^^^^^^'],
  legend: { S: { kind: 'spawn' } },
};
const grid = parseMap(map);
const PER_STEP = (WALK_SPEED * STEP_MS) / 1000;

const ada: EntitySnapshot = { id: 1, name: 'Ada', cx: 1, cy: 1, nx: -1, ny: -1, t: 0, dir: 0, running: false, moving: false, act: null };
const bob: EntitySnapshot = { id: 2, name: 'Bob', cx: 4, cy: 4, nx: -1, ny: -1, t: 0, dir: 3, running: true, moving: false, act: null };

function welcome(entities: EntitySnapshot[] = [ada], seq = 0): ServerMessage {
  return { t: 'welcome', id: 1, token: 'tok', tickMs: 50, tick: 100, zone: 'greenhollow', entities, items: [], nodes: [], seq, resumed: false, bag: [['bronze_hatchet', 1], null], skills: [['lumberjack', 0], ['mining', 83]], gear: [], stats: { hp: 11, maxHp: 11, mana: 6, maxMana: 6, armor: 0, attack: 1, spellPower: 0 } };
}

function tick(tickNo: number, part: Partial<Extract<ServerMessage, { t: 'tick' }>>): ServerMessage {
  return { t: 'tick', tick: tickNo, joined: [], left: [], moves: [], acts: [], nodes: [], drops: [], taken: [], chat: [], ...part };
}

function replica(entities: EntitySnapshot[] = [ada]): { r: Replica; sent: InputMessage[] } {
  const r = new Replica();
  const sent: InputMessage[] = [];
  r.onInput = (m) => sent.push(m);
  r.setGrid(grid);
  r.apply(welcome(entities), 1000);
  r.update(1000);
  return { r, sent };
}

describe('replica: yourself, predicted', () => {
  it('starts from the welcome and knows who it is', () => {
    const { r } = replica([ada, bob]);
    expect(r.selfId).toBe(1);
    expect(r.selfEntity?.name).toBe('Ada');
    expect(r.self.cell).toEqual({ x: 1, y: 1 });
    expect(r.positionAt(r.selfEntity!, 1000)).toEqual({ x: 1.5, y: 1.5, dir: 0, moving: false });
    expect(r.positionAt(r.entities.get(2)!, 1000)).toEqual({ x: 4.5, y: 4.5, dir: 3, moving: false });
  });

  it('moves at once after a click and sends one numbered input per step while the path lasts', () => {
    const { r, sent } = replica();
    r.walkTo({ x: 9, y: 1 });
    r.update(1000 + STEP_MS * 3);
    expect(sent.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(sent[0]).toEqual({ t: 'input', seq: 1, to: [9, 1] }); // the click rides the first input
    expect(sent[1]).toEqual({ t: 'input', seq: 2 });
    expect(positionOf(r.self).x).toBeCloseTo(1.5 + 3 * PER_STEP, 6);
    expect(r.positionAt(r.selfEntity!, 1150).moving).toBe(true);
  });

  it('stops sending once it has arrived, resting on the cell', () => {
    const { r, sent } = replica();
    r.walkTo({ x: 3, y: 1 });
    for (let i = 1; i <= 20; i++) r.update(1000 + STEP_MS * i);
    expect(r.self.cell).toEqual({ x: 3, y: 1 });
    expect(r.self.t).toBe(0);
    expect(sent).toHaveLength(10); // two cells at walking speed, then quiet
    expect(r.positionAt(r.selfEntity!, 2000)).toEqual({ x: 3.5, y: 1.5, dir: 2, moving: false });
  });

  it('keeps its prediction when the server agrees, and replays from the server when it does not', () => {
    const { r } = replica();
    r.walkTo({ x: 9, y: 1 });
    for (let i = 1; i <= 4; i++) r.update(1000 + STEP_MS * i); // inputs 1..4 predicted, one per step: 0.8 of the way into (2, 1)
    const predicted = positionOf(r.self);
    r.apply(tick(101, { moves: [[1, 1, 1, 2, 1, 0.2, 2, 1, 1]] }), 1200); // the server agrees about input 1
    expect(positionOf(r.self)).toEqual(predicted);
    // The server has us a little behind for input 2 (0.3 instead of 0.4): we take its word, replay 3 and 4 on top, and hide the jump at first.
    r.apply(tick(102, { moves: [[1, 1, 1, 2, 1, 0.3, 2, 1, 2]] }), 1250);
    expect(r.self.cell).toEqual({ x: 1, y: 1 });
    expect(r.self.t).toBeCloseTo(0.7, 6);
    expect(r.self.path[r.self.path.length - 1]).toEqual({ x: 9, y: 1 }); // the rest of the way is kept
    const shown = r.positionAt(r.selfEntity!, 1250);
    expect(shown.x).toBeCloseTo(predicted.x, 6); // still drawn where it was, for now
    r.update(1250 + 1000);
    expect(r.positionAt(r.selfEntity!, 2250).x).toBeCloseTo(positionOf(r.self).x, 2); // the offset has faded out
  });

  it('takes a server placement that is off its own path and stands there', () => {
    const { r } = replica();
    r.walkTo({ x: 9, y: 1 });
    for (let i = 1; i <= 4; i++) r.update(1000 + STEP_MS * i);
    r.apply(tick(101, { moves: [[1, 2, 2, -1, -1, 0, 0, 0, 2]] }), 1200); // for input 2 the server has us standing in (2, 2)
    expect(r.self.cell).toEqual({ x: 2, y: 2 });
    expect(r.self.path).toEqual([]); // the server stands still, so inputs 3 and 4 moved nothing
    expect(r.self.t).toBe(0);
  });

  it('takes the server placement while idle and continues the input numbers it was given', () => {
    const r = new Replica();
    r.setGrid(grid);
    r.apply(welcome([ada], 41), 1000);
    r.apply(tick(101, { moves: [[1, 3, 3, -1, -1, 0, 1, 0, 41]] }), 1050);
    expect(r.self.cell).toEqual({ x: 3, y: 3 });
    expect(r.self.dir).toBe(1);
    const sent: InputMessage[] = [];
    r.onInput = (m) => sent.push(m);
    r.update(1050);
    r.walkTo({ x: 3, y: 5 });
    r.update(1050 + STEP_MS);
    expect(sent[0]?.seq).toBe(42);
  });

  it('stops at the next whole cell when told, and tells the server so', () => {
    const { r, sent } = replica();
    r.walkTo({ x: 9, y: 1 });
    r.update(1000 + STEP_MS * 3); // 0.6 of the way into (2, 1)
    r.stop();
    r.update(1000 + STEP_MS * 4);
    expect(sent[3]).toEqual({ t: 'input', seq: 4, stop: true });
    expect(r.self.path).toEqual([{ x: 2, y: 1 }]);
    r.update(1000 + STEP_MS * 6);
    expect(r.self.cell).toEqual({ x: 2, y: 1 });
    expect(r.self.path).toEqual([]);
    expect(sent).toHaveLength(5); // the step that finished the cell, then quiet
    expect(r.positionAt(r.selfEntity!, 2000)).toEqual({ x: 2.5, y: 1.5, dir: 2, moving: false });
  });

  it('does not burst inputs after a long pause', () => {
    const { r, sent } = replica();
    r.walkTo({ x: 9, y: 4 });
    r.update(1000 + 5000);
    expect(sent.length).toBeLessThanOrEqual(3);
  });
});

describe('replica: another zone', () => {
  it('starts over with the new zone, keeping who it is, the chat and the input numbering the server gives', () => {
    const { r, sent } = replica([ada, bob]);
    r.apply(tick(101, { chat: [{ id: 2, text: 'bye' }] }), 1050);
    r.walkTo({ x: 9, y: 1 });
    r.update(1000 + STEP_MS * 3); // inputs 1..3 in flight
    const arrived: EntitySnapshot = { ...ada, cx: 0, cy: 12, dir: 2 };
    const cyd: EntitySnapshot = { ...bob, id: 3, name: 'Cyd', cx: 2, cy: 12 };
    r.apply({ t: 'zone', zone: 'copper_hills', tick: 400, entities: [arrived, cyd], items: [[9, 'copper_ore', 1, 2, 13]], nodes: [4], seq: 1003 }, 1200);
    expect([...r.items.keys()]).toEqual([9]);
    expect([...r.depleted]).toEqual([4]);
    expect(r.zone).toBe('copper_hills');
    expect(r.selfId).toBe(1);
    expect(r.tick).toBe(400);
    expect([...r.entities.keys()]).toEqual([1, 3]);
    expect(r.self.cell).toEqual({ x: 0, y: 12 });
    expect(r.self.path).toEqual([]);
    expect(r.self.dir).toBe(2);
    expect(r.positionAt(r.selfEntity!, 1200)).toEqual({ x: 0.5, y: 12.5, dir: 2, moving: false });
    expect(r.positionAt(r.entities.get(3)!, 1200)).toMatchObject({ x: 2.5, y: 12.5 });
    expect(r.chat.map((c) => c.text)).toEqual(['bye']); // what was said travels with you
    // Standing still sends nothing; the next click numbers on from the server's count, and the old prediction is forgotten.
    r.update(1200 + STEP_MS);
    expect(sent).toHaveLength(3);
    r.walkTo({ x: 2, y: 12 });
    r.update(1200 + STEP_MS * 2);
    expect(sent[3]).toEqual({ t: 'input', seq: 1004, to: [2, 12] });
    r.apply(tick(401, { moves: [[1, 0, 12, 1, 12, 0.2, 2, 1, 1004]] }), 1300); // the server agrees
    expect(r.self.t).toBeCloseTo(0.2, 6);
  });
});

describe('replica: others, interpolated', () => {
  it('upserts joiners, drops leavers and interpolates between the placements the server sent', () => {
    const { r } = replica();
    r.apply(tick(101, { joined: [bob] }), 1050);
    expect(r.entities.get(2)?.name).toBe('Bob');
    r.apply(tick(102, { joined: [bob] }), 1100); // a repeat announcement is harmless
    expect(r.entities.size).toBe(2);
    const e = r.entities.get(2)!;
    r.apply(tick(103, { moves: [[2, 5, 4, -1, -1, 0, 2, 1, 7]] }), 1150);
    r.apply(tick(104, { moves: [[2, 5, 4, 6, 4, 0.5, 2, 1, 8]] }), 1200); // halfway into (6, 4): drawn at 6.0
    // The clock: tick 100 arrived at 1000, so tick t shows at 1000 + (t - 100) × 50, two ticks later.
    expect(r.renderTick(1200)).toBeCloseTo(102, 6);
    expect(r.positionAt(e, 1200)).toEqual({ x: 5, y: 4.5, dir: 2, moving: true }); // tick 102: halfway from where it joined (101) to its first move (103)
    expect(r.positionAt(e, 1275).x).toBeCloseTo(5.75, 6); // halfway between ticks 103 (5.5) and 104 (6.0)
    expect(r.positionAt(e, 1275).moving).toBe(true);
    expect(r.positionAt(e, 1500)).toEqual({ x: 6, y: 4.5, dir: 2, moving: false }); // beyond the last state: held, standing
    r.apply(tick(105, { left: [2] }), 1250);
    expect(r.entities.has(2)).toBe(false);
  });

  it('shows the freshest state the line allows: an early arrival moves the clock, a late one barely', () => {
    const { r } = replica([ada, bob]);
    r.apply(tick(101, { moves: [[2, 5, 4, -1, -1, 0, 2, 1, 1]] }), 1030); // 20 ms early
    expect(r.renderTick(1030)).toBeCloseTo(99, 6);
    r.apply(tick(102, { moves: [[2, 6, 4, -1, -1, 0, 2, 1, 2]] }), 1300); // 220 ms late
    expect(r.renderTick(1300)).toBeGreaterThan(104); // the clock did not jump back to hide the late packet
  });
});

describe('replica: the zone around you', () => {
  it('keeps the items and empty nodes the server tells of, and shows who is working on what', () => {
    const { r, sent } = replica([ada, bob]);
    r.apply(tick(101, { acts: [[2, 5, 4, 2]], nodes: [[7, 1]], drops: [[3, 'oak_log', 1, 4, 5]] }), 1050);
    expect(r.entities.get(2)?.act).toEqual({ x: 5, y: 4 });
    expect(r.positionAt(r.entities.get(2)!, 1200).dir).toBe(2); // turned to face it
    expect(r.depleted.has(7)).toBe(true);
    expect(r.items.get(3)).toEqual({ gid: 3, item: 'oak_log', qty: 1, x: 4, y: 5 });
    r.apply(tick(102, { acts: [[2, -1, -1, 2]], nodes: [[7, 0]], taken: [3] }), 1100);
    expect(r.entities.get(2)?.act).toBeNull();
    expect(r.depleted.size).toBe(0);
    expect(r.items.size).toBe(0);
    // Using something is a click like any other to the prediction; the input says so.
    r.use({ x: 2, y: 1 });
    r.update(1000 + STEP_MS);
    expect(sent[0]).toEqual({ t: 'input', seq: 1, to: [2, 1], use: true });
  });

  it('learns about itself from you messages: the bag, xp with a drop to show, the bank, drops of its own, notes', () => {
    const { r } = replica();
    const notes: string[] = [];
    r.onNote = (text) => notes.push(text);
    expect(r.bag).toEqual([['bronze_hatchet', 1], null]);
    expect(r.skills.get('mining')).toBe(83);
    const before = r.version;
    r.apply({ t: 'you', bag: [['bronze_hatchet', 1], ['oak_log', 1]], xp: [['lumberjack', 10]], items: [[5, 'oak_log', 1, 1, 1]], notes: ['Your bag is full.'] }, 2000);
    expect(r.bag[1]).toEqual(['oak_log', 1]);
    expect(r.skills.get('lumberjack')).toBe(10);
    expect(r.xpDrops).toEqual([{ skill: 'lumberjack', amount: 10, at: 2000 }]);
    expect(r.items.get(5)?.item).toBe('oak_log');
    expect(notes).toEqual(['Your bag is full.']);
    expect(r.version).toBeGreaterThan(before);
    r.apply({ t: 'you', bank: [['oak_log', 3]] }, 2100);
    expect(r.bank).toEqual([['oak_log', 3]]);
    expect(r.gear).toEqual([]);
    expect(r.stats?.maxHp).toBe(11);
    r.apply({ t: 'you', gear: [['main_hand', 'bronze_sword', 1]], stats: { hp: 11, maxHp: 11, mana: 6, maxMana: 6, armor: 0, attack: 6, spellPower: 0 } }, 2150);
    expect(r.gear).toEqual([['main_hand', 'bronze_sword', 1]]);
    expect(r.stats?.attack).toBe(6);
    r.apply({ t: 'you', bank: null }, 2200);
    expect(r.bank).toBeNull();
    r.update(2000 + XP_DROP_MS + 100);
    expect(r.xpDrops).toEqual([]);
  });
});

describe('replica: chat', () => {
  it('keeps a log with names and shows bubbles for a while', () => {
    const { r } = replica([ada, bob]);
    r.apply(tick(101, { chat: [{ id: 2, text: 'hi' }, { id: 1, text: 'hello' }] }), 1300);
    expect(r.chat.map((c) => `${c.name}: ${c.text}`)).toEqual(['Bob: hi', 'Ada: hello']);
    expect(r.bubbles(1300).map((b) => b.id).sort()).toEqual([1, 2]);
    r.apply(tick(102, { chat: [{ id: 2, text: 'again' }] }), 1600);
    expect(r.bubbles(1700).find((b) => b.id === 2)?.text).toBe('again');
    expect(r.bubbles(1300 + BUBBLE_MS + 1).map((b) => b.id)).toEqual([2]);
    expect(r.bubbles(1600 + BUBBLE_MS + 1)).toEqual([]);
  });
});
