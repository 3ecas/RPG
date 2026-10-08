import { describe, expect, it } from 'vitest';
import { BUBBLE_MS, Replica } from '@/client/replica';
import type { EntitySnapshot, ServerMessage } from '@/net/protocol';

const ada: EntitySnapshot = { id: 1, name: 'Ada', x: 1, y: 1, dir: 0, running: false };
const bob: EntitySnapshot = { id: 2, name: 'Bob', x: 4, y: 4, dir: 3, running: true };

function welcome(entities: EntitySnapshot[] = [ada]): ServerMessage {
  return { t: 'welcome', id: 1, token: 'tok', tickMs: 300, tick: 10, zone: 'greenhollow', entities };
}

function tick(tickNo: number, part: Partial<Extract<ServerMessage, { t: 'tick' }>>): ServerMessage {
  return { t: 'tick', tick: tickNo, joined: [], left: [], moves: [], chat: [], ...part };
}

describe('replica', () => {
  it('starts from the welcome snapshot and knows who it is', () => {
    const r = new Replica();
    r.apply(welcome([ada, bob]), 1000);
    expect(r.selfId).toBe(1);
    expect(r.self?.name).toBe('Ada');
    expect(r.zone).toBe('greenhollow');
    expect(r.entities.size).toBe(2);
    expect(r.positionAt(r.entities.get(2)!, 1000)).toEqual({ x: 4, y: 4, moving: false });
  });

  it('upserts joiners and drops leavers', () => {
    const r = new Replica();
    r.apply(welcome(), 1000);
    r.apply(tick(11, { joined: [bob] }), 1300);
    expect(r.entities.get(2)?.name).toBe('Bob');
    r.apply(tick(12, { joined: [bob] }), 1600); // a repeat announcement is harmless
    expect(r.entities.size).toBe(2);
    r.apply(tick(13, { left: [2] }), 1900);
    expect(r.entities.has(2)).toBe(false);
  });

  it('plays a tick one playback delay after arrival and interpolates through its steps', () => {
    const r = new Replica();
    r.apply(welcome(), 1000); // delay = 150: tick 10 shows at 1150, tick 11 at 1450
    r.apply(tick(11, { moves: [{ id: 1, steps: [[2, 1]], dir: 2 }] }), 1300);
    const e = r.entities.get(1)!;
    expect([e.x, e.y, e.dir]).toEqual([2, 1, 2]);
    expect(r.positionAt(e, 1400)).toEqual({ x: 1, y: 1, moving: false }); // not yet
    expect(r.positionAt(e, 1600)).toEqual({ x: 1.5, y: 1, moving: true }); // halfway through the tick
    expect(r.positionAt(e, 1800)).toEqual({ x: 2, y: 1, moving: false });
  });

  it('walks two cells in one tick when running, each over half the tick', () => {
    const r = new Replica();
    r.apply(welcome(), 1000);
    r.apply(tick(11, { moves: [{ id: 1, steps: [[2, 2], [3, 3]], dir: 2 }] }), 1300); // shows at 1450
    const e = r.entities.get(1)!;
    expect(r.positionAt(e, 1525)).toEqual({ x: 1.5, y: 1.5, moving: true }); // a quarter in: half of the first step
    expect(r.positionAt(e, 1600)).toEqual({ x: 2, y: 2, moving: true });
    expect(r.positionAt(e, 1675)).toEqual({ x: 2.5, y: 2.5, moving: true });
  });

  it('shifts its clock when a tick arrives late and pulls back when it runs far ahead', () => {
    const r = new Replica();
    r.apply(welcome(), 1000);
    // Tick 11 is due at 1450 but arrives at 1700: it plays at once, and tick 12 follows one tick later.
    r.apply(tick(11, { moves: [{ id: 1, steps: [[2, 1]], dir: 2 }] }), 1700);
    const e = r.entities.get(1)!;
    expect(e.moveAt).toBe(1700);
    r.apply(tick(12, { moves: [{ id: 1, steps: [[3, 1]], dir: 2 }] }), 1750);
    expect(e.moveAt).toBe(2000);
    // After a stall the server's catch-up burst arrives early: never schedule more than tickMs + delay ahead.
    r.apply(tick(13, { moves: [{ id: 1, steps: [[4, 1]], dir: 2 }] }), 1760);
    expect(e.moveAt).toBe(1760 + 300 + 150);
  });

  it('keeps a chat log with names and shows bubbles for a while', () => {
    const r = new Replica();
    r.apply(welcome([ada, bob]), 1000);
    r.apply(tick(11, { chat: [{ id: 2, text: 'hi' }, { id: 1, text: 'hello' }] }), 1300); // shows at 1450
    expect(r.chat.map((c) => `${c.name}: ${c.text}`)).toEqual(['Bob: hi', 'Ada: hello']);
    expect(r.bubbles(1400)).toEqual([]); // not shown yet
    expect(r.bubbles(1500).map((b) => b.id).sort()).toEqual([1, 2]);
    r.apply(tick(12, { chat: [{ id: 2, text: 'again' }] }), 1600); // shows at 1750
    expect(r.bubbles(1800).find((b) => b.id === 2)?.text).toBe('again'); // only the latest per speaker
    expect(r.bubbles(1450 + BUBBLE_MS + 1).map((b) => b.id)).toEqual([2]);
    expect(r.bubbles(1750 + BUBBLE_MS + 1)).toEqual([]);
  });
});
