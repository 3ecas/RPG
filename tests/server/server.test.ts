import { afterEach, describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from '@/net/protocol';
import { type GameServer, startServer } from '@/server/server';

const TICK_MS = 25;
const GRACE_MS = 100;

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

  hello(name: string, token: string | null = null, v = PROTOCOL_VERSION): void {
    this.send({ t: 'hello', v, name, token });
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
const isTick = (m: ServerMessage): m is Extract<ServerMessage, { t: 'tick' }> => m.t === 'tick';
const isReject = (m: ServerMessage): m is Extract<ServerMessage, { t: 'reject' }> => m.t === 'reject';

describe('zone server', () => {
  let server: GameServer | null = null;
  const clients: TestClient[] = [];

  async function start(): Promise<GameServer> {
    server = await startServer({ port: 0, host: '127.0.0.1', zone: 'greenhollow', tickMs: TICK_MS, graceMs: GRACE_MS });
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
    bob.send({ t: 'move', x: spawn.x + 3, y: spawn.y });
    const moved = await ada.next((m) => isTick(m) && m.moves.some((mv) => mv.id === w2.id));
    const step = isTick(moved) ? moved.moves.find((mv) => mv.id === w2.id)! : null;
    expect(step?.steps).toEqual([[spawn.x + 1, spawn.y]]);
    expect(step?.dir).toBe(2);

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
    expect(server!.room.size).toBe(1);
  });

  it('resumes a character by token, replacing the old connection, and lets a dropped one lapse', async () => {
    const { port } = await start();
    const first = await connect(port);
    first.hello('Ada');
    const w1 = await first.next(isWelcome);

    const second = await connect(port);
    second.hello('Ada', w1.token);
    const w2 = await second.next(isWelcome);
    expect(w2.id).toBe(w1.id);
    expect(w2.token).toBe(w1.token);
    expect(await first.closed()).toBe(4000);
    expect(server!.room.size).toBe(1);

    const watcher = await connect(port);
    watcher.hello('Bob');
    await watcher.next(isWelcome);
    second.close();
    const left = await watcher.next((m) => isTick(m) && m.left.includes(w1.id), GRACE_MS * 4);
    expect(isTick(left) && left.left).toEqual([w1.id]);
    expect(server!.room.size).toBe(1);

    // The lapsed token is no longer good for anything: a hello with it starts a fresh character.
    const third = await connect(port);
    third.hello('Ada', w1.token);
    const w3 = await third.next(isWelcome);
    expect(w3.id).not.toBe(w1.id);
    expect(w3.token).not.toBe(w1.token);
  });

  it('answers the health check', async () => {
    const { port } = await start();
    const ada = await connect(port);
    ada.hello('Ada');
    await ada.next(isWelcome);
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; players: number; zone: string; protocol: number };
    expect(body.ok).toBe(true);
    expect(body.players).toBe(1);
    expect(body.zone).toBe('greenhollow');
    expect(body.protocol).toBe(PROTOCOL_VERSION);
    expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(404);
  });
});
