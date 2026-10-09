import { afterEach, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from '@/net/protocol';
import { hashSecret } from '@/server/character';
import { type GameServer, startServer } from '@/server/server';
import { MemoryStore } from '@/server/store';

const TICK_MS = 25;
const GRACE_MS = 100;
/** What a browser would have made up once and kept. */
const SECRET = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const OTHER_BROWSER = 'ffffffffffffffffffffffffffffffff';

/** A bare WebSocket client that records what the server says and lets a test wait for a message. */
class TestClient {
  readonly received: ServerMessage[] = [];
  closeCode: number | null = null;
  private cursor = 0;
  private waiters: (() => void)[] = [];

  private constructor(private readonly ws: WebSocket) {}

  static connect(port: number): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      const client = new TestClient(ws);
      ws.addEventListener('open', () => resolve(client));
      ws.addEventListener('error', () => reject(new Error('could not connect')));
      ws.addEventListener('message', (event) => {
        client.received.push(JSON.parse(String(event.data)) as ServerMessage);
        client.wake();
      });
      ws.addEventListener('close', (event) => {
        client.closeCode = event.code;
        client.wake();
      });
    });
  }

  send(msg: ClientMessage | string): void {
    this.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }

  hello(name: string, token: string | null = null, v = PROTOCOL_VERSION, secret = SECRET): void {
    this.send({ t: 'hello', v, name, secret, token });
  }

  /** The next unread message matching `pred`, waiting up to `timeoutMs` for it to arrive. */
  next<T extends ServerMessage>(pred: (m: ServerMessage) => m is T, timeoutMs?: number): Promise<T>;
  next(pred: (m: ServerMessage) => boolean, timeoutMs?: number): Promise<ServerMessage>;
  next(pred: (m: ServerMessage) => boolean, timeoutMs = 2000): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error(`timed out waiting for a message; had ${JSON.stringify(this.received.slice(this.cursor))}`)), timeoutMs);
      const scan = (): boolean => {
        for (let i = this.cursor; i < this.received.length; i++) {
          const m = this.received[i]!;
          if (pred(m)) {
            this.cursor = i + 1;
            clearTimeout(deadline);
            resolve(m);
            return true;
          }
        }
        this.cursor = this.received.length;
        return false;
      };
      if (scan()) return;
      const waiter = () => {
        if (scan()) this.waiters = this.waiters.filter((w) => w !== waiter);
      };
      this.waiters.push(waiter);
    });
  }

  closed(timeoutMs = 2000): Promise<number> {
    return new Promise((resolve, reject) => {
      if (this.closeCode !== null) return resolve(this.closeCode);
      const deadline = setTimeout(() => reject(new Error('socket did not close')), timeoutMs);
      this.waiters.push(() => {
        if (this.closeCode !== null) {
          clearTimeout(deadline);
          resolve(this.closeCode);
        }
      });
    });
  }

  close(): void {
    this.ws.close();
  }

  private wake(): void {
    for (const w of [...this.waiters]) w();
  }
}

const isWelcome = (m: ServerMessage): m is Extract<ServerMessage, { t: 'welcome' }> => m.t === 'welcome';
const isZone = (m: ServerMessage): m is Extract<ServerMessage, { t: 'zone' }> => m.t === 'zone';
const isTick = (m: ServerMessage): m is Extract<ServerMessage, { t: 'tick' }> => m.t === 'tick';
const isReject = (m: ServerMessage): m is Extract<ServerMessage, { t: 'reject' }> => m.t === 'reject';
type You = Extract<ServerMessage, { t: 'you' }>;
const isYou = (m: ServerMessage): m is You => m.t === 'you';

/** Walks a client: a click (to use what is there when `use`), then one step per message until `steps` are sent. */
function walk(client: TestClient, seq: number, to: [number, number], steps: number, use = false): number {
  client.send(use ? { t: 'input', seq: ++seq, to, use: true } : { t: 'input', seq: ++seq, to });
  for (let i = 1; i < steps; i++) client.send({ t: 'input', seq: ++seq });
  return seq;
}

const until = async (check: () => Promise<boolean>, what: string, timeoutMs = 2000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
};

describe('game server', () => {
  let server: GameServer | null = null;
  const clients: TestClient[] = [];

  async function start(store = new MemoryStore()): Promise<GameServer> {
    server = await startServer({ port: 0, host: '127.0.0.1', startZone: 'greenhollow', tickMs: TICK_MS, graceMs: GRACE_MS, saveMs: 0, store, seed: 1, rules: { actionSteps: 1, itemPublicSteps: 8, itemGoneSteps: 400 } });
    return server;
  }

  async function connect(port: number): Promise<TestClient> {
    const c = await TestClient.connect(port);
    clients.push(c);
    return c;
  }

  afterEach(async () => {
    for (const c of clients) c.close();
    clients.length = 0;
    await server?.close();
    server = null;
  });

  it('lets two players see each other walk and talk', async () => {
    const { port } = await start();
    const ada = await connect(port);
    ada.hello('Ada');
    const w1 = await ada.next(isWelcome);
    expect(w1.tickMs).toBe(TICK_MS);
    expect(w1.zone).toBe('greenhollow');
    expect(w1.resumed).toBe(false);
    expect(w1.entities.map((e) => e.name)).toEqual(['Ada']);
    expect(w1.token).toMatch(/^[0-9a-f-]{36}$/);

    const bob = await connect(port);
    bob.hello('Bob');
    const w2 = await bob.next(isWelcome);
    expect(w2.entities.map((e) => e.name).sort()).toEqual(['Ada', 'Bob']);
    expect(w2.id).not.toBe(w1.id);
    const joined = await ada.next((m) => isTick(m) && m.joined.some((e) => e.id === w2.id));
    expect(isTick(joined) && joined.joined.find((e) => e.id === w2.id)?.name).toBe('Bob');

    const spawn = w2.entities.find((e) => e.id === w2.id)!;
    expect(w2.seq).toBe(0);
    bob.send({ t: 'input', seq: 1, to: [spawn.cx + 3, spawn.cy] });
    const moved = await ada.next((m) => isTick(m) && m.moves.some((mv) => mv[0] === w2.id));
    const state = isTick(moved) ? moved.moves.find((mv) => mv[0] === w2.id)! : null;
    expect(state?.slice(1, 5)).toEqual([spawn.cx, spawn.cy, spawn.cx + 1, spawn.cy]); // leaving the spawn cell, straight east
    expect(state?.[5]).toBeCloseTo(0.2, 3); // one step at walking speed
    expect(state?.[6]).toBe(2);
    expect(state?.[7]).toBe(1);
    expect(state?.[8]).toBe(1);
    bob.send({ t: 'input', seq: 2 });
    const walked = await ada.next((m) => isTick(m) && m.moves.some((mv) => mv[0] === w2.id && mv[8] === 2));
    const after = isTick(walked) ? walked.moves.find((mv) => mv[0] === w2.id)! : null;
    expect(after?.[5]).toBeCloseTo(0.4, 3);

    bob.send({ t: 'chat', text: '  hello   there ' });
    const said = await ada.next((m) => isTick(m) && m.chat.length > 0);
    expect(isTick(said) && said.chat).toEqual([{ id: w2.id, text: 'hello there' }]);

    bob.send({ t: 'ping', at: 42 });
    expect(await bob.next((m) => m.t === 'pong')).toEqual({ t: 'pong', at: 42 });
  });

  it('turns away the wrong protocol version, a taken name, and junk', async () => {
    const { port } = await start();
    const old = await connect(port);
    old.hello('Ada', null, PROTOCOL_VERSION + 1);
    expect((await old.next(isReject)).reason).toMatch(/out of date/);
    expect(await old.closed()).toBe(1008);

    const ada = await connect(port);
    ada.hello('Ada');
    await ada.next(isWelcome);
    const twin = await connect(port);
    twin.hello('ada');
    expect((await twin.next(isReject)).reason).toMatch(/already in the world/);
    expect(await twin.closed()).toBe(1008);

    const vandal = await connect(port);
    for (let i = 0; i < 10; i++) vandal.send('{"t":"teleport"}');
    expect(await vandal.closed()).toBe(1008);
    expect(server!.world.size).toBe(1);
  });

  it('resumes a character by token, replacing the old connection, and brings a lapsed one back from the store where it stood', async () => {
    const { port } = await start();
    const first = await connect(port);
    first.hello('Ada');
    const w1 = await first.next(isWelcome);
    const spawn = w1.entities.find((e) => e.id === w1.id)!;

    const second = await connect(port);
    second.hello('Ada', w1.token);
    const w2 = await second.next(isWelcome);
    expect(w2.id).toBe(w1.id);
    expect(w2.token).toBe(w1.token);
    expect(w2.resumed).toBe(true);
    expect(await first.closed()).toBe(4000);
    expect(server!.world.size).toBe(1);

    // One cell east, then the connection goes and the grace period runs out.
    walk(second, w2.seq, [spawn.cx + 1, spawn.cy], 5);
    const watcher = await connect(port);
    watcher.hello('Bob');
    await watcher.next(isWelcome);
    await watcher.next((m) => isTick(m) && m.moves.some((mv) => mv[0] === w1.id && mv[8] === 5));
    second.close();
    const left = await watcher.next((m) => isTick(m) && m.left.includes(w1.id), GRACE_MS * 6);
    expect(isTick(left) && left.left).toEqual([w1.id]);
    expect(server!.world.size).toBe(1);
    expect(await server!.store.load('ada')).toMatchObject({ name: 'Ada', zone: 'greenhollow', x: spawn.cx + 1, y: spawn.cy, dir: 2 });

    // The lapsed token is no longer good for anything, but the name and secret bring the saved character back.
    const third = await connect(port);
    third.hello('Ada', w1.token);
    const w3 = await third.next(isWelcome);
    expect(w3.id).not.toBe(w1.id);
    expect(w3.token).not.toBe(w1.token);
    expect(w3.resumed).toBe(true);
    const me = w3.entities.find((e) => e.id === w3.id)!;
    expect([me.cx, me.cy, me.dir]).toEqual([spawn.cx + 1, spawn.cy, 2]);
  });

  it('ties a name to the browser that made it', async () => {
    const { port } = await start();
    const ada = await connect(port);
    ada.hello('Ada');
    const w1 = await ada.next(isWelcome);
    const spawn = w1.entities.find((e) => e.id === w1.id)!;
    walk(ada, 0, [spawn.cx, spawn.cy + 1], 5);
    await ada.next((m) => isTick(m) && m.moves.some((mv) => mv[0] === w1.id && mv[8] === 5));
    ada.close();
    await until(async () => server!.world.player(w1.id)?.connected === false, 'the drop');

    // Within the grace period, another browser cannot take the dropped character over by name.
    const thief = await connect(port);
    thief.hello('ada', null, PROTOCOL_VERSION, OTHER_BROWSER);
    expect((await thief.next(isReject)).reason).toMatch(/another browser/);
    expect(await thief.closed()).toBe(1008);
    expect(server!.world.player(w1.id)?.connected).toBe(false);

    // Nor after it, from the store.
    await until(async () => server!.world.size === 0, 'the lapse');
    const later = await connect(port);
    later.hello('Ada', null, PROTOCOL_VERSION, OTHER_BROWSER);
    expect((await later.next(isReject)).reason).toMatch(/another browser/);

    // The right browser gets it back, where it stood.
    const owner = await connect(port);
    owner.hello('Ada');
    const w2 = await owner.next(isWelcome);
    expect(w2.resumed).toBe(true);
    const me = w2.entities.find((e) => e.id === w2.id)!;
    expect([me.cx, me.cy]).toEqual([spawn.cx, spawn.cy + 1]);
    expect((await server!.store.load('ada'))?.secretHash).toBe(hashSecret(SECRET));
  });

  it('walks a player through an exit into the next zone, where the others cannot see them any more', async () => {
    const store = new MemoryStore();
    await store.save({ name: 'Ada', secretHash: hashSecret(SECRET), createdAt: 1, dir: 0, running: false, state: {}, zone: 'greenhollow', x: 38, y: 11, lastSeenAt: 1 });
    const { port } = await start(store);
    const bob = await connect(port);
    bob.hello('Bob');
    const wb = await bob.next(isWelcome);
    const ada = await connect(port);
    ada.hello('Ada');
    const wa = await ada.next(isWelcome);
    expect(wa.resumed).toBe(true);
    expect(wa.entities.find((e) => e.id === wa.id)).toMatchObject({ cx: 38, cy: 11 });
    await bob.next((m) => isTick(m) && m.joined.some((e) => e.id === wa.id));

    const sent = walk(ada, wa.seq, [39, 11], 5); // the road east, one cell
    const zone = await ada.next(isZone);
    expect(zone.zone).toBe('copper_hills');
    expect(zone.seq).toBe(sent + 1000);
    expect(zone.entities.map((e) => e.name)).toEqual(['Ada']);
    expect(zone.entities[0]).toMatchObject({ cx: 0, cy: 12, nx: -1, t: 0 });
    const gone = await bob.next((m) => isTick(m) && m.left.includes(wa.id));
    expect(isTick(gone) && gone.left).toEqual([wa.id]);
    expect(server!.world.zoneOf(wa.id)).toBe('copper_hills');
    expect(server!.world.room('greenhollow').size).toBe(1);

    // Ticks now come from the hills; a step there is Ada's alone to see.
    ada.send({ t: 'input', seq: zone.seq + 1, to: [3, 12] });
    const moved = await ada.next((m) => isTick(m) && m.moves.some((mv) => mv[0] === wa.id));
    expect(isTick(moved) && moved.moves[0]?.slice(1, 5)).toEqual([0, 12, 1, 12]);
    const bobSaw = bob.received.filter((m) => isTick(m) && m.moves.some((mv) => mv[0] === wa.id && mv[1] === 0 && mv[2] === 12));
    expect(bobSaw).toEqual([]);
    expect(wb.id).not.toBe(wa.id);
    await until(async () => (await store.load('ada'))?.zone === 'copper_hills', 'the save after the zone change');
  });

  it('brings everyone back after a restart with the same store', async () => {
    const store = new MemoryStore();
    const first = await start(store);
    const ada = await connect(first.port);
    ada.hello('Ada');
    const w1 = await ada.next(isWelcome);
    const spawn = w1.entities.find((e) => e.id === w1.id)!;
    ada.send({ t: 'run', on: true });
    walk(ada, 0, [spawn.cx + 2, spawn.cy], 6); // two cells at running speed
    await ada.next((m) => isTick(m) && m.moves.some((mv) => mv[0] === w1.id && mv[8] === 6));
    expect(server!.world.player(w1.id)?.cell).toEqual({ x: spawn.cx + 2, y: spawn.cy });
    await first.close(); // saves everyone on the way out
    server = null;
    expect(await ada.closed()).toBe(1001);
    expect(await store.load('ada')).toMatchObject({ x: spawn.cx + 2, y: spawn.cy, running: true, zone: 'greenhollow' });

    const second = await start(store);
    const back = await connect(second.port);
    back.hello('Ada');
    const w2 = await back.next(isWelcome);
    expect(w2.resumed).toBe(true);
    const me = w2.entities.find((e) => e.id === w2.id)!;
    expect([me.cx, me.cy, me.running]).toEqual([spawn.cx + 2, spawn.cy, true]);
  });

  it('chops a tree, drops the log for the other player to find once it shows, and keeps it all in the store', async () => {
    const store = new MemoryStore();
    const base = { secretHash: hashSecret(SECRET), createdAt: 1, dir: 0 as const, running: false, zone: 'greenhollow' as const, lastSeenAt: 1 };
    await store.save({ ...base, name: 'Ada', state: { bag: [{ itemId: 'stone_hatchet', qty: 1 }], coins: 3 }, x: 3, y: 3 }); // beside the oak at (3, 2)
    await store.save({ ...base, name: 'Bob', state: {}, x: 5, y: 3 });
    const { port } = await start(store);
    const ada = await connect(port);
    ada.hello('Ada');
    const wa = await ada.next(isWelcome);
    expect(wa.bag[0]).toEqual(['stone_hatchet', 1]);
    expect(wa.skills).toContainEqual(['lumberjack', 0]);
    expect(wa.gear).toEqual([]);
    expect(wa.stats).toEqual({ hp: 11, maxHp: 11, mana: 6, maxMana: 6, armor: 0, attack: 1, spellPower: 0 });
    expect(wa.quests).toEqual([]);
    expect(wa.coins).toBe(3);
    expect(wa.fires).toEqual([]);
    expect(wa.items).toEqual([]);
    const bob = await connect(port);
    bob.hello('Bob');
    const wb = await bob.next(isWelcome);

    ada.send({ t: 'input', seq: 1, to: [3, 2], use: true });
    const swing = await bob.next((m) => isTick(m) && m.acts.some((a) => a[0] === wa.id && a[1] === 3));
    expect(isTick(swing) && swing.acts).toEqual([[wa.id, 3, 2, 3]]); // facing up, at the tree
    const chopped = await ada.next((m): m is You => isYou(m) && !!m.bag?.some((s) => s?.[0] === 'oak_log'), 8000);
    expect(chopped.xp?.[0]?.[0]).toBe('lumberjack');
    expect(chopped.xp?.[0]?.[1]).toBeGreaterThanOrEqual(10);
    const slot = chopped.bag!.findIndex((s) => s?.[0] === 'oak_log');

    walk(ada, 1, [4, 3], 6); // one cell east: the chopping stops
    await bob.next((m) => isTick(m) && m.acts.some((a) => a[0] === wa.id && a[1] === -1));
    await bob.next((m) => isTick(m) && m.moves.some((mv) => mv[0] === wa.id && mv[1] === 4 && mv[5] === 0));
    ada.send({ t: 'drop', slot });
    const dropped = await ada.next((m): m is You => isYou(m) && !!m.items);
    const [gid, itemId, , x, y] = dropped.items![0]!;
    expect(itemId).toBe('oak_log');
    expect(bob.received.some((m) => isTick(m) && m.drops.some((d) => d[0] === gid))).toBe(false);
    const shown = await bob.next((m) => isTick(m) && m.drops.some((d) => d[0] === gid), 2000);
    expect(isTick(shown) && shown.drops[0]).toEqual([gid, 'oak_log', 1, x, y]);
    walk(bob, 0, [x, y], 12, true); // two cells west, then the log is his
    const taken = await ada.next((m) => isTick(m) && m.taken.includes(gid), 4000);
    expect(isTick(taken) && taken.taken).toEqual([gid]);
    const bobsBag = await bob.next((m): m is You => isYou(m) && !!m.bag?.some((s) => s?.[0] === 'oak_log'));
    expect(bobsBag.bag?.filter((s) => s?.[0] === 'oak_log')).toHaveLength(1);
    expect(wb.id).not.toBe(wa.id);

    await server!.saveAll();
    const saved = await store.load('bob');
    expect((saved?.state.bag as unknown[]).filter((s) => (s as { itemId?: string } | null)?.itemId === 'oak_log')).toHaveLength(1);
    expect(((await store.load('ada'))?.state.skills as Record<string, number>).lumberjack).toBeGreaterThanOrEqual(10);
  });

  it('answers the health check', async () => {
    const { port } = await start();
    const ada = await connect(port);
    ada.hello('Ada');
    await ada.next(isWelcome);
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; players: number; zones: Record<string, number>; protocol: number; store: string };
    expect(body.ok).toBe(true);
    expect(body.players).toBe(1);
    expect(body.zones).toEqual({ greenhollow: 1 });
    expect(body.protocol).toBe(PROTOCOL_VERSION);
    expect(body.store).toBe('memory');
    expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(404);
  });
});
