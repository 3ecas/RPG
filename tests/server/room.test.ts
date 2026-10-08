import { describe, expect, it } from 'vitest';
import { CONTENT } from '@/content';
import type { ZoneMapDef } from '@/types/content';
import { Room } from '@/server/room';

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

function room(overrides: Partial<ConstructorParameters<typeof Room>[2]> = {}): Room {
  return new Room('greenhollow', map, { graceTicks: 3, capacity: 4, ...overrides });
}

function joinOk(r: Room, name: string) {
  const result = r.join(name);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

describe('room: joining and leaving', () => {
  it('places newcomers on the spawn and announces them once', () => {
    const r = room();
    const { player, resumed } = joinOk(r, 'Ada');
    expect(resumed).toBe(false);
    expect([player.x, player.y]).toEqual([1, 1]);
    expect(r.snapshot()).toEqual([{ id: 1, name: 'Ada', x: 1, y: 1, dir: 0, running: false }]);
    const first = r.advance();
    expect(first.joined.map((e) => e.name)).toEqual(['Ada']);
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
    const gone = r.advance();
    expect(gone.left).toEqual([player.id]);
    expect(r.size).toBe(0);
  });

  it('lets the same name take over a dropped character, and a token reconnect keep it', () => {
    const r = room({ graceTicks: 5 });
    const { player } = joinOk(r, 'Ada');
    r.move(player.id, 5, 1);
    r.advance();
    r.disconnect(player.id);
    expect(player.path).toEqual([]); // stands still while away
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

describe('room: walking', () => {
  it('walks one cell a tick along a server-side path and faces the way it goes', () => {
    const r = room();
    const { player } = joinOk(r, 'Ada');
    expect(r.move(player.id, 3, 1)).toBe(true);
    const t1 = r.advance();
    expect(t1.moves).toEqual([{ id: player.id, steps: [[2, 1]], dir: 2 }]);
    const t2 = r.advance();
    expect(t2.moves).toEqual([{ id: player.id, steps: [[3, 1]], dir: 2 }]);
    expect(r.advance().moves).toEqual([]);
    expect([player.x, player.y, player.dir]).toEqual([3, 1, 2]);
  });

  it('runs two cells a tick and reports both cells in order', () => {
    const r = room();
    const { player } = joinOk(r, 'Ada');
    r.setRunning(player.id, true);
    r.move(player.id, 4, 1);
    expect(r.advance().moves).toEqual([{ id: player.id, steps: [[2, 1], [3, 1]], dir: 2 }]);
    expect(r.advance().moves).toEqual([{ id: player.id, steps: [[4, 1]], dir: 2 }]);
  });

  it('takes diagonals and walks up to things it cannot stand on', () => {
    const r = room();
    const { player } = joinOk(r, 'Ada');
    expect(r.move(player.id, 8, 4)).toBe(true); // water
    let last: [number, number] | undefined;
    for (let i = 0; i < 20; i++) {
      const delta = r.advance();
      const move = delta.moves[0];
      if (move) last = move.steps[move.steps.length - 1];
    }
    expect(last).toBeDefined();
    expect([[7, 4], [8, 3]]).toContainEqual(last);
    expect(r.move(player.id, 50, 50)).toBe(false); // off the map
    expect(r.move(player.id, 0, 0)).toBe(true); // the forest corner: walks to the nearest open cell
  });

  it('replaces the current path when a new click comes in, and ignores the dropped', () => {
    const r = room();
    const { player } = joinOk(r, 'Ada');
    r.move(player.id, 8, 1);
    r.advance();
    r.move(player.id, 1, 5);
    const next = r.advance().moves[0]!;
    expect(next.steps[0]![1]).toBe(2); // heading down now
    r.disconnect(player.id);
    expect(r.move(player.id, 8, 1)).toBe(false);
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
  it('opens every zone map', () => {
    for (const [zoneId, zoneMap] of Object.entries(CONTENT.maps)) {
      const r = new Room(zoneId as never, zoneMap, { graceTicks: 1, capacity: 10 });
      const { player } = joinOk(r, 'Ada');
      expect(r.grid.terrain.length).toBe(r.grid.width * r.grid.height);
      expect(r.move(player.id, player.x + 1, player.y)).toBe(true);
    }
  });
});
