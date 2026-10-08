import { describe, expect, it } from 'vitest';
import { CONTENT } from '@/content';
import { Room } from '@/server/room';
import type { ZoneMapDef } from '@/types/content';
import { RUN_SPEED, STEP_MS, WALK_SPEED } from '@/world/motion';

const map: ZoneMapDef = {
  biome: 'meadow',
  rows: [
    '^^^^^^^^^^',
    '^S.......^',
    '^..A.....^',
    '^...HH...^',
    '^...HH..~^',
    '^.......~^',
    '^^^^^^^^^^',
  ],
  legend: {
    S: { kind: 'spawn' },
    A: { kind: 'node', id: 'oak_tree' },
    H: { kind: 'shop', id: 'hollow_goods' },
  },
};

const PER_STEP = (WALK_SPEED * STEP_MS) / 1000;

function room(overrides: Partial<ConstructorParameters<typeof Room>[2]> = {}): Room {
  return new Room('greenhollow', map, { graceTicks: 3, capacity: 4, ...overrides });
}

function joinOk(r: Room, name: string) {
  const result = r.join(name);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

describe('room: joining and leaving', () => {
  it('places newcomers on the spawn cell and announces them once', () => {
    const r = room();
    const { player, resumed } = joinOk(r, 'Ada');
    expect(resumed).toBe(false);
    expect(player.cell).toEqual({ x: 1, y: 1 });
    expect(r.snapshot()).toEqual([{ id: 1, name: 'Ada', cx: 1, cy: 1, nx: -1, ny: -1, t: 0, dir: 0, running: false, moving: false }]);
    expect(r.advance().joined.map((e) => e.name)).toEqual(['Ada']);
    expect(r.advance().joined).toEqual([]);
  });

  it('refuses a name that is in use, case-insensitively, and a full room', () => {
    const r = room({ capacity: 2 });
    joinOk(r, 'Ada');
    expect(r.join('ada')).toEqual({ ok: false, reason: 'That name is already in the world.' });
    joinOk(r, 'Bob');
    expect(r.join('Cyd')).toEqual({ ok: false, reason: 'The world is full right now.' });
  });

  it('keeps a dropped character for the grace period, then lets it leave', () => {
    const r = room({ graceTicks: 3 });
    const { player } = joinOk(r, 'Ada');
    r.advance();
    r.disconnect(player.id);
    expect(r.advance().left).toEqual([]);
    expect(r.advance().left).toEqual([]);
    expect(r.advance().left).toEqual([player.id]);
    expect(r.size).toBe(0);
  });

  it('stands a dropped character on a whole cell, lets the same name take it over, and a token reconnect keep it', () => {
    const r = room({ graceTicks: 5 });
    const { player } = joinOk(r, 'Ada');
    r.queueInput(player.id, { seq: 1, to: { x: 5, y: 1 } });
    r.queueInput(player.id, { seq: 2 });
    r.queueInput(player.id, { seq: 3 });
    r.advance(); // three steps: 0.6 of the way into (2, 1)
    r.disconnect(player.id);
    expect(player.cell).toEqual({ x: 2, y: 1 }); // the nearer cell
    expect(player.t).toBe(0);
    expect(player.path).toEqual([]);
    const back = joinOk(r, 'ADA');
    expect(back.resumed).toBe(true);
    expect(back.player).toBe(player);
    r.disconnect(player.id);
    expect(r.reconnect(player.id)).toBe(true);
    for (let i = 0; i < 10; i++) r.advance();
    expect(r.size).toBe(1);
    expect(r.reconnect(99)).toBe(false);
  });
});

describe('room: moving on inputs', () => {
  it('applies the queued inputs, a step each, and reports the placement and the input number', () => {
    const r = room();
    const { player } = joinOk(r, 'Ada');
    expect(r.queueInput(player.id, { seq: 1, to: { x: 7, y: 1 } })).toBe(true);
    expect(r.queueInput(player.id, { seq: 2 })).toBe(true);
    const t1 = r.advance();
    expect(t1.moves).toHaveLength(1);
    const [id, cx, cy, nx, ny, t, dir, moving, seq] = t1.moves[0]!;
    expect(id).toBe(player.id);
    expect([cx, cy, nx, ny]).toEqual([1, 1, 2, 1]);
    expect(t).toBeCloseTo(2 * PER_STEP, 3); // both queued inputs are applied to catch up
    expect(dir).toBe(2);
    expect(moving).toBe(1);
    expect(seq).toBe(2);
    const t2 = r.advance();
    expect(t2.moves).toEqual([[player.id, 1, 1, 2, 1, 0.4, 2, 0, 2]]); // no input this tick: one more state so others see it pause
    expect(r.advance().moves).toEqual([]);
  });

  it('refuses stale, duplicate and out-of-order inputs and caps the queue', () => {
    const r = room();
    const { player } = joinOk(r, 'Ada');
    expect(r.queueInput(player.id, { seq: 5, to: { x: 7, y: 1 } })).toBe(true);
    expect(r.queueInput(player.id, { seq: 5 })).toBe(false);
    expect(r.queueInput(player.id, { seq: 4 })).toBe(false);
    for (let s = 6; s < 20; s++) r.queueInput(player.id, { seq: s });
    expect(player.inputs).toHaveLength(8);
    r.advance();
    expect(player.inputs).toHaveLength(5); // three applied this tick
    expect(player.seq).toBe(7);
    expect(r.queueInput(99, { seq: 1 })).toBe(false);
  });

  it('walks from a click to the cell and rests there, at a steady pace', () => {
    const r = room();
    const { player } = joinOk(r, 'Ada');
    let seq = 0;
    r.queueInput(player.id, { seq: ++seq, to: { x: 6, y: 1 } });
    let ticks = 0;
    do {
      r.advance(); // the first tick plans the walk and takes the first step
      ticks++;
      if (player.path.length > 0) r.queueInput(player.id, { seq: ++seq });
    } while (player.path.length > 0 && ticks < 100);
    expect(player.cell).toEqual({ x: 6, y: 1 });
    expect(player.t).toBe(0);
    expect(ticks).toBe(Math.ceil(5 / PER_STEP));
    expect(player.dir).toBe(2);
  });

  it('walks up to things it cannot stand on and changes course on a new click once the current cell is done', () => {
    const r = room();
    const { player } = joinOk(r, 'Ada');
    r.queueInput(player.id, { seq: 1, to: { x: 8, y: 4 } }); // water
    r.advance();
    expect(player.path.length).toBeGreaterThan(0);
    r.queueInput(player.id, { seq: 2, to: { x: 1, y: 5 } }); // changed my mind
    r.advance();
    expect(player.path[player.path.length - 1]).toEqual({ x: 1, y: 5 });
    const before = { cell: { ...player.cell }, t: player.t };
    r.queueInput(player.id, { seq: 3, to: { x: 50, y: 50 } }); // off the map: the walk goes on as it was
    r.advance();
    expect(player.path[player.path.length - 1]).toEqual({ x: 1, y: 5 });
    expect(player.t !== before.t || player.cell.x !== before.cell.x || player.cell.y !== before.cell.y).toBe(true);
  });

  it('runs faster when told to', () => {
    const r = room();
    const { player } = joinOk(r, 'Ada');
    r.setRunning(player.id, true);
    r.queueInput(player.id, { seq: 1, to: { x: 7, y: 1 } });
    r.advance();
    expect(player.t).toBeCloseTo((RUN_SPEED * STEP_MS) / 1000, 9);
  });

  it('ignores inputs from a dropped connection', () => {
    const r = room();
    const { player } = joinOk(r, 'Ada');
    r.disconnect(player.id);
    expect(r.queueInput(player.id, { seq: 1, to: { x: 5, y: 1 } })).toBe(false);
  });
});

describe('room: chat', () => {
  it('delivers one line per player per tick with the next delta', () => {
    const r = room();
    const { player } = joinOk(r, 'Ada');
    expect(r.chat(player.id, 'hello')).toBe(true);
    expect(r.chat(player.id, 'spam')).toBe(false);
    expect(r.advance().chat).toEqual([{ id: player.id, text: 'hello' }]);
    expect(r.chat(player.id, 'again')).toBe(true);
    expect(r.advance().chat).toEqual([{ id: player.id, text: 'again' }]);
    expect(r.advance().chat).toEqual([]);
  });
});

describe('room: real content', () => {
  it('opens every zone map and can walk from the spawn', () => {
    for (const [zoneId, zoneMap] of Object.entries(CONTENT.maps)) {
      const r = new Room(zoneId as never, zoneMap, { graceTicks: 1, capacity: 10 });
      const { player } = joinOk(r, 'Ada');
      expect(r.grid.terrain.length).toBe(r.grid.width * r.grid.height);
      expect(r.queueInput(player.id, { seq: 1, to: { x: player.cell.x + 1, y: player.cell.y } })).toBe(true);
      r.advance();
    }
  });
});
