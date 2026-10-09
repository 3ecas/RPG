import { describe, expect, it } from 'vitest';
import { CONTENT } from '@/content';
import { Registry } from '@/core/registry';
import type { CharacterRecord } from '@/server/character';
import type { RoomPlayer } from '@/server/room';
import { SEQ_GAP, World } from '@/server/world';
import type { ZoneId } from '@/types/ids';

const content = new Registry(CONTENT);

function world(overrides: Partial<ConstructorParameters<typeof World>[1]> = {}): World {
  return new World(content, { startZone: 'greenhollow', graceTicks: 3, capacity: 10, ...overrides });
}

function record(name: string, zone: ZoneId, x: number, y: number): CharacterRecord {
  return { name, secretHash: 'h', createdAt: 1, dir: 1, running: false, state: {}, zone, x, y, lastSeenAt: 1 };
}

function enterOk(w: World, r: CharacterRecord): RoomPlayer {
  const result = w.enter(r);
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}

/** Walks `player` to `to` by feeding one step per tick, until it leaves its room or arrives. Returns the ticks of the world along the way. */
function walk(w: World, player: RoomPlayer, to: { x: number; y: number }, maxTicks = 100) {
  let seq = player.seq;
  const ticks = [];
  w.queueInput(player.id, { seq: ++seq, to });
  for (let i = 0; i < maxTicks; i++) {
    const tick = w.advance();
    ticks.push(tick);
    if (tick.moved.length > 0 || player.path.length === 0) break;
    w.queueInput(player.id, { seq: ++seq });
  }
  return ticks;
}

describe('world: rooms', () => {
  it('runs one room per zone with ids unique across them, and finds people wherever they stand', () => {
    const w = world();
    expect(w.rooms.size).toBe(content.zoneIds.length);
    const ada = enterOk(w, record('Ada', 'greenhollow', -1, -1));
    const bob = enterOk(w, record('Bob', 'copper_hills', -1, -1));
    expect([ada.id, bob.id]).toEqual([1, 2]);
    expect(w.zoneOf(ada.id)).toBe('greenhollow');
    expect(w.zoneOf(bob.id)).toBe('copper_hills');
    expect(w.byName('BOB')).toBe(bob);
    expect(w.byName('Cyd')).toBeNull();
    expect(w.player(bob.id)).toBe(bob);
    expect(w.size).toBe(2);
    expect(w.players().map((p) => p.name).sort()).toEqual(['Ada', 'Bob']);
    expect(() => world({ startZone: 'atlantis' as ZoneId })).toThrow(/start zone/);
  });

  it('stands a character where its record says, on the spawn when it cannot, and in the starting zone when its zone is gone', () => {
    const w = world();
    const hills = w.room('copper_hills');
    expect(enterOk(w, record('Ada', 'copper_hills', 10, 12)).cell).toEqual({ x: 10, y: 12 }); // on the road
    const rock = enterOk(w, record('Bob', 'copper_hills', 0, 0));
    expect(rock.cell).toEqual(hills.grid.spawn);
    expect(w.zoneOf(rock.id)).toBe('copper_hills');
    const lost = enterOk(w, record('Cyd', 'atlantis' as ZoneId, 3, 3));
    expect(w.zoneOf(lost.id)).toBe('greenhollow');
    expect(lost.cell).toEqual(w.room('greenhollow').grid.spawn);
    expect(lost.dir).toBe(1);
  });

  it('records a character where it stands, in the nearer cell mid-step, and not at all once it has left', () => {
    const w = world();
    const ada = enterOk(w, record('Ada', 'greenhollow', 10, 13));
    const saved = w.recordOf(ada, 500)!;
    expect(saved).toMatchObject({ name: 'Ada', zone: 'greenhollow', x: 10, y: 13, lastSeenAt: 500, dir: 1 });
    expect(saved.state).toMatchObject({ skills: { lumberjack: 0 }, bank: [] });
    expect((saved.state.bag as unknown[])[0]).toEqual({ itemId: 'bronze_hatchet', qty: 1 });
    w.queueInput(ada.id, { seq: 1, to: { x: 15, y: 13 } });
    w.queueInput(ada.id, { seq: 2 });
    w.queueInput(ada.id, { seq: 3 });
    w.advance(); // 0.6 of the way into (11, 13)
    expect(w.recordOf(ada, 600)?.x).toBe(11);
    expect(w.recordOf(ada, 600)?.dir).toBe(2);
    w.disconnect(ada.id);
    expect(w.recordOf(ada, 700)?.x).toBe(11);
    let gone: number[] = [];
    for (let i = 0; i < 3; i++) gone = w.advance().gone;
    expect(gone).toEqual([ada.id]);
    expect(w.size).toBe(0);
    expect(w.recordOf(ada, 800)).toBeNull();
    expect(w.queueInput(ada.id, { seq: 4 })).toBe(false);
  });
});

describe('world: walking between zones', () => {
  it('carries a player who steps onto an exit to the matching entrance of the next zone', () => {
    const w = world();
    const ada = enterOk(w, record('Ada', 'greenhollow', 38, 11)); // beside the road east
    const bob = enterOk(w, record('Bob', 'copper_hills', -1, -1));
    w.advance();
    const ticks = walk(w, ada, { x: 39, y: 11 });
    const last = ticks[ticks.length - 1]!;
    expect(last.moved).toEqual([{ player: ada, from: 'greenhollow', to: 'copper_hills' }]);
    expect(last.gone).toEqual([]);
    expect(last.deltas.get('greenhollow')!.left).toEqual([ada.id]);
    expect(w.zoneOf(ada.id)).toBe('copper_hills');
    expect(ada.cell).toEqual(w.room('copper_hills').entrance('greenhollow'));
    expect(ada.cell).toEqual({ x: 0, y: 12 });
    expect(ada.path).toEqual([]);
    expect(w.room('greenhollow').size).toBe(0);
    expect(w.room('copper_hills').players()).toEqual([bob, ada]);
    // The next tick tells Copper Hills about the arrival; standing on the entrance does not send her back.
    const next = w.advance();
    expect(next.deltas.get('copper_hills')!.joined.map((e) => e.id)).toEqual([ada.id]);
    expect(next.moved).toEqual([]);
    for (let i = 0; i < 5; i++) expect(w.advance().moved).toEqual([]);
    expect(w.zoneOf(ada.id)).toBe('copper_hills');
  });

  it('jumps the input numbers on arrival so steps sent for the old zone are refused as stale', () => {
    const w = world();
    const ada = enterOk(w, record('Ada', 'greenhollow', 38, 11));
    const ticks = walk(w, ada, { x: 39, y: 11 });
    const stepsTaken = ticks.length;
    expect(ada.seq).toBe(stepsTaken + SEQ_GAP);
    expect(w.queueInput(ada.id, { seq: stepsTaken + 1, to: { x: 20, y: 11 } })).toBe(false); // in flight from the old zone
    expect(w.queueInput(ada.id, { seq: ada.seq + 1, to: { x: 5, y: 12 } })).toBe(true);
    w.advance();
    expect(ada.path.length).toBeGreaterThan(0);
    expect(ada.path[ada.path.length - 1]).toEqual({ x: 5, y: 12 });
  });

  it('can walk the whole road from the village to the hills and back', () => {
    const w = world();
    const ada = enterOk(w, record('Ada', 'greenhollow', 38, 11));
    walk(w, ada, { x: 39, y: 11 });
    expect(w.zoneOf(ada.id)).toBe('copper_hills');
    walk(w, ada, { x: 1, y: 12 }); // one cell in
    expect(ada.cell).toEqual({ x: 1, y: 12 });
    const back = walk(w, ada, { x: 0, y: 12 });
    expect(back[back.length - 1]!.moved.map((m) => m.to)).toEqual(['greenhollow']);
    expect(ada.cell).toEqual({ x: 39, y: 11 });
    expect(w.room('greenhollow').player(ada.id)).toBe(ada);
  });
});
