/**
 * The game server: a WebSocket endpoint in front of the world of rooms, a
 * drift-corrected tick loop, sessions with reconnect tokens, characters
 * loaded from and saved to the store, and a limit on everything a client can
 * send. The rules of the world live in the rooms; this file only moves
 * messages and records.
 */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { CONTENT } from '@/content';
import { Registry } from '@/core/registry';
import { type ClientMessage, decodeClientMessage, LIMITS, PROTOCOL_VERSION, type ServerMessage } from '@/net/protocol';
import type { ZoneId } from '@/types/ids';
import { hashSecret, keyOf, newCharacter } from './character';
import type { PlayerInput, RoomPlayer, RoomRules } from './room';
import { type CharacterStore, MemoryStore } from './store';
import { World } from './world';

export interface ServerOptions {
  /** 0 picks a free port. */
  port: number;
  host?: string;
  /** Where new characters start. */
  startZone: ZoneId;
  tickMs: number;
  /** How long a dropped connection may come back for before its character leaves. */
  graceMs: number;
  /** How often everyone online is written to the store; 0 turns the periodic save off (they are still saved on leaving and at shutdown). */
  saveMs?: number;
  /** Most characters per zone at once. */
  capacity?: number;
  /** Where characters are kept between sessions; memory when not given. */
  store?: CharacterStore;
  /** The seed of the world's dice and the timings of actions and ground items; for tests. */
  seed?: number;
  rules?: Partial<RoomRules>;
  log?: (line: string) => void;
}

export interface GameServer {
  readonly port: number;
  readonly world: World;
  readonly store: CharacterStore;
  /** Connections that have said hello and stand in the world. */
  readonly connections: number;
  /** Writes everyone in the world to the store now. */
  saveAll(): Promise<void>;
  /** Saves everyone, closes every socket and the store. */
  close(): Promise<void>;
}

/** Messages a connection may send per second, and how many it may burst: one input per step while moving, plus a little. */
const RATE_PER_SECOND = 30;
const BURST = 60;
/** Off-schema or over-rate messages tolerated before the connection is closed. */
const MAX_STRIKES = 10;
const HELLO_TIMEOUT_MS = 10_000;
const KEEPALIVE_MS = 30_000;
const OTHER_BROWSER = 'That name belongs to a character made in another browser. Until there are accounts, a character answers only to the browser that made it; pick another name here.';

interface Connection {
  socket: WebSocket;
  playerId: number | null;
  /** A hello is being answered: the character is being looked up in the store. */
  joining: boolean;
  strikes: number;
  budget: number;
  refilledAt: number;
  alive: boolean;
  helloTimer: ReturnType<typeof setTimeout> | null;
}

export function startServer(options: ServerOptions): Promise<GameServer> {
  const log = options.log ?? (() => {});
  const store = options.store ?? new MemoryStore();
  const content = new Registry(CONTENT);
  const problems = content.validate();
  if (problems.length > 0) throw new Error(`Content validation failed:\n${problems.join('\n')}`);
  const graceTicks = Math.max(1, Math.ceil(options.graceMs / options.tickMs));
  const world = new World(content, { startZone: options.startZone, graceTicks, capacity: options.capacity ?? 200, seed: options.seed, rules: options.rules });

  const http = createServer((req, res) => {
    if (req.url === '/health') {
      const zones: Record<string, number> = {};
      for (const room of world.rooms.values()) if (room.size > 0) zones[room.zoneId] = room.size;
      const tick = world.room(options.startZone).tick;
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, tick, players: world.size, zones, tickMs: options.tickMs, protocol: PROTOCOL_VERSION, store: store.kind }));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('This is the game server; it speaks WebSocket. Open the client instead.');
  });
  const wss = new WebSocketServer({ server: http, maxPayload: LIMITS.MESSAGE_CHARS * 4 });

  const connections = new Set<Connection>();
  /** The live connection of each character in the world. */
  const byPlayer = new Map<number, Connection>();
  /** Session tokens: proof that a reconnecting socket owns a character. */
  const tokens = new Map<string, number>();
  const tokenOf = new Map<number, string>();
  /** One hello at a time per name, so two tabs racing for the same character meet an orderly answer. */
  const nameLocks = new Map<string, Promise<void>>();

  const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

  const send = (socket: WebSocket, msg: ServerMessage): void => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  };

  const reject = (conn: Connection, reason: string): void => {
    send(conn.socket, { t: 'reject', reason });
    conn.socket.close(1008, 'Refused');
  };

  const forget = (playerId: number): void => {
    const token = tokenOf.get(playerId);
    if (token) tokens.delete(token);
    tokenOf.delete(playerId);
    byPlayer.delete(playerId);
  };

  /** A fresh token for a character; any older token for it stops working. */
  const issueToken = (playerId: number): string => {
    const old = tokenOf.get(playerId);
    if (old) tokens.delete(old);
    const token = randomUUID();
    tokens.set(token, playerId);
    tokenOf.set(playerId, token);
    return token;
  };

  const strike = (conn: Connection, why: string): void => {
    conn.strikes += 1;
    if (conn.strikes >= MAX_STRIKES) {
      log(`closing a connection: ${why}`);
      conn.socket.close(1008, 'Too many bad messages');
    }
  };

  const allow = (conn: Connection, now: number): boolean => {
    conn.budget = Math.min(BURST, conn.budget + ((now - conn.refilledAt) / 1000) * RATE_PER_SECOND);
    conn.refilledAt = now;
    if (conn.budget < 1) return false;
    conn.budget -= 1;
    return true;
  };

  const bind = (conn: Connection, playerId: number): void => {
    const previous = byPlayer.get(playerId);
    if (previous && previous !== conn) {
      previous.playerId = null;
      previous.socket.close(4000, 'Replaced by a new connection');
    }
    conn.playerId = playerId;
    byPlayer.set(playerId, conn);
    if (conn.helloTimer) {
      clearTimeout(conn.helloTimer);
      conn.helloTimer = null;
    }
  };

  /** Set once the final save of a shutdown is done: the sockets closing after it have nothing new to write. */
  let closing = false;

  /** Writes these characters as they stand now; a store that fails is logged, never fatal to the game. */
  const persist = (players: RoomPlayer[]): Promise<void> => {
    if (closing) return Promise.resolve();
    const now = Date.now();
    const records = players.flatMap((p) => world.recordOf(p, now) ?? []);
    if (records.length === 0) return Promise.resolve();
    return store.saveMany(records).catch((error: unknown) => log(`could not save ${records.map((r) => r.name).join(', ')}: ${describe(error)}`));
  };

  const withName = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const previous = nameLocks.get(key) ?? Promise.resolve();
    const run = previous.then(fn);
    const settled: Promise<void> = run.then(
      () => undefined,
      () => undefined,
    ).then(() => {
      if (nameLocks.get(key) === settled) nameLocks.delete(key);
    });
    nameLocks.set(key, settled);
    return run;
  };

  const welcome = (conn: Connection, player: RoomPlayer, token: string, resumed: boolean): void => {
    const snapshot = world.snapshotFor(player.id)!;
    const you = world.youOf(player.id)!;
    send(conn.socket, { t: 'welcome', id: player.id, token, tickMs: options.tickMs, resumed, bag: you.bag, skills: you.skills, gear: you.gear, belt: you.belt, stats: you.stats, quests: you.quests, coins: you.coins, bestiary: you.bestiary, ...snapshot });
  };

  /** Who this connection is: a character coming back on its token, a character of this browser's loaded from the store, or a new one. */
  const hello = async (conn: Connection, msg: Extract<ClientMessage, { t: 'hello' }>): Promise<void> => {
    if (conn.playerId !== null || conn.joining) {
      strike(conn, 'a second hello');
      return;
    }
    if (msg.v !== PROTOCOL_VERSION) {
      send(conn.socket, { t: 'reject', reason: 'This client is out of date. Reload the page.' });
      conn.socket.close(1008, 'Protocol version');
      return;
    }
    if (msg.token) {
      const owned = tokens.get(msg.token);
      const player = owned !== undefined ? world.player(owned) : null;
      if (player) {
        world.reconnect(player.id);
        bind(conn, player.id);
        welcome(conn, player, msg.token, true);
        log(`${player.name} reconnected`);
        return;
      }
    }
    conn.joining = true;
    try {
      await withName(keyOf(msg.name), async () => {
        if (conn.socket.readyState !== WebSocket.OPEN) return;
        const secretHash = hashSecret(msg.secret);
        const present = world.byName(msg.name);
        if (present) {
          if (present.secretHash !== secretHash) return reject(conn, OTHER_BROWSER);
          if (present.connected) return reject(conn, 'That name is already in the world.');
          // Dropped and back under its own name from the same browser: the character is taken over.
          world.reconnect(present.id);
          const token = issueToken(present.id);
          bind(conn, present.id);
          welcome(conn, present, token, true);
          log(`${present.name} took their character back`);
          return;
        }
        let record = await store.load(keyOf(msg.name));
        if (conn.socket.readyState !== WebSocket.OPEN) return;
        if (record && record.secretHash !== secretHash) return reject(conn, OTHER_BROWSER);
        const resumed = record !== null;
        if (!record) {
          const start = world.room(options.startZone);
          record = newCharacter(msg.name, secretHash, start.zoneId, start.grid.spawn, Date.now());
        }
        const placed = world.enter(record);
        if (!placed.ok) return reject(conn, placed.reason);
        const player = placed.value;
        if (!resumed) void persist([player]); // the name is this browser's from now on
        const token = issueToken(player.id);
        bind(conn, player.id);
        welcome(conn, player, token, resumed);
        log(`${player.name} ${resumed ? 'is back' : 'joined'} in ${world.zoneOf(player.id)} (${world.size} in the world)`);
      });
    } catch (error) {
      log(`could not let ${msg.name} in: ${describe(error)}`);
      if (conn.socket.readyState === WebSocket.OPEN) reject(conn, 'Your character could not be loaded. Try again in a moment.');
    } finally {
      conn.joining = false;
    }
  };

  const handle = (conn: Connection, msg: ClientMessage): void => {
    if (msg.t === 'hello') {
      void hello(conn, msg);
      return;
    }
    if (msg.t === 'ping') {
      send(conn.socket, { t: 'pong', at: msg.at });
      return;
    }
    const id = conn.playerId;
    if (id === null) {
      strike(conn, 'a message before hello');
      return;
    }
    switch (msg.t) {
      case 'input': {
        const input: PlayerInput = { seq: msg.seq };
        if (msg.to) {
          input.to = { x: msg.to[0], y: msg.to[1] };
          input.use = msg.use === true;
        }
        if (msg.stop) input.stop = true;
        world.queueInput(id, input);
        break;
      }
      case 'run': world.setRunning(id, msg.on); break;
      case 'chat': world.chat(id, msg.text); break;
      case 'drop': world.drop(id, msg.slot); break;
      case 'equip': world.equip(id, msg.slot); break;
      case 'unequip': world.unequip(id, msg.slot); break;
      case 'eat': world.eat(id, msg.slot); break;
      case 'belt': world.belt(id, msg); break;
      case 'swap': world.swap(id, msg.from, msg.to); break;
      case 'quest': if (msg.op === 'accept') world.acceptQuest(id, msg.id); else world.abandonQuest(id, msg.id); break;
      case 'fire': world.fire(id, msg); break;
      case 'station': world.leaveStation(id); break;
      case 'make': world.make(id, msg.recipe, msg.qty); break;
      case 'bank': world.bank(id, msg); break;
    }
  };

  wss.on('connection', (socket) => {
    const conn: Connection = { socket, playerId: null, joining: false, strikes: 0, budget: BURST, refilledAt: Date.now(), alive: true, helloTimer: null };
    connections.add(conn);
    conn.helloTimer = setTimeout(() => {
      if (conn.playerId === null) socket.close(1008, 'No hello');
    }, HELLO_TIMEOUT_MS);
    socket.on('message', (data, isBinary) => {
      if (isBinary) return strike(conn, 'a binary message');
      if (!allow(conn, Date.now())) return strike(conn, 'too many messages');
      const msg = decodeClientMessage(data.toString());
      if (!msg) return strike(conn, 'an off-schema message');
      handle(conn, msg);
    });
    socket.on('pong', () => {
      conn.alive = true;
    });
    socket.on('close', () => {
      connections.delete(conn);
      if (conn.helloTimer) clearTimeout(conn.helloTimer);
      if (conn.playerId !== null && byPlayer.get(conn.playerId) === conn) {
        byPlayer.delete(conn.playerId);
        const player = world.player(conn.playerId);
        world.disconnect(conn.playerId);
        if (player) {
          void persist([player]);
          log(`${player.name} dropped; holding their character for ${Math.round(options.graceMs / 1000)} s`);
        }
      }
    });
    socket.on('error', () => {
      /* 'close' follows */
    });
  });

  // The tick runs on a fixed schedule from the start, so a slow tick never delays the next one.
  const startedAt = Date.now();
  let ticks = 0;
  let tickTimer: ReturnType<typeof setTimeout> | null = null;
  const step = (): void => {
    const { deltas, moved, gone } = world.advance();
    for (const id of gone) forget(id);
    for (const { player, to } of moved) {
      const conn = byPlayer.get(player.id);
      if (conn) send(conn.socket, { t: 'zone', ...world.snapshotFor(player.id)! });
      log(`${player.name} walked into ${to}`);
    }
    // Each room's delta goes to the connections standing in it, encoded once per room.
    const encoded = new Map<ZoneId, string>();
    for (const conn of byPlayer.values()) {
      if (conn.playerId === null || conn.socket.readyState !== WebSocket.OPEN) continue;
      const zone = world.zoneOf(conn.playerId);
      if (!zone) continue;
      let text = encoded.get(zone);
      if (text === undefined) {
        text = JSON.stringify({ t: 'tick', ...deltas.get(zone)! });
        encoded.set(zone, text);
      }
      conn.socket.send(text);
    }
    // What only each player learns: their bag, xp, bank and drops.
    for (const [id, you] of world.takeYou()) {
      const conn = byPlayer.get(id);
      if (conn) send(conn.socket, { t: 'you', ...you });
    }
    if (moved.length > 0) void persist(moved.map((m) => m.player));
    schedule();
  };
  const schedule = (): void => {
    ticks += 1;
    tickTimer = setTimeout(step, Math.max(0, startedAt + ticks * options.tickMs - Date.now()));
  };

  const keepalive = setInterval(() => {
    for (const conn of connections) {
      if (!conn.alive) {
        conn.socket.terminate();
        continue;
      }
      conn.alive = false;
      conn.socket.ping();
    }
  }, KEEPALIVE_MS);

  const saveMs = options.saveMs ?? 30_000;
  const saver = saveMs > 0 ? setInterval(() => void persist(world.players()), saveMs) : null;

  const listen = (): Promise<GameServer> => new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(options.port, options.host ?? '0.0.0.0', () => {
      const port = (http.address() as AddressInfo).port;
      schedule();
      log(`${world.rooms.size} zones listening on port ${port}, tick ${options.tickMs} ms, characters in ${store.kind}`);
      resolve({
        port,
        world,
        store,
        get connections() {
          return byPlayer.size;
        },
        saveAll: () => persist(world.players()),
        close: async () => {
          if (tickTimer) clearTimeout(tickTimer);
          clearInterval(keepalive);
          if (saver) clearInterval(saver);
          await persist(world.players());
          closing = true;
          for (const conn of connections) {
            if (conn.helloTimer) clearTimeout(conn.helloTimer);
            conn.socket.close(1001, 'Server shutting down');
          }
          await new Promise<void>((done) => {
            wss.close(() => {
              http.closeAllConnections();
              http.close(() => done());
            });
          });
          await store.close();
        },
      });
    });
  });

  // The store first: a file that cannot be read or a database that cannot be reached is a reason not to start.
  return store.open().then(listen, (error: unknown) => {
    clearInterval(keepalive);
    if (saver) clearInterval(saver);
    throw new Error(`The character store (${store.kind}) could not be opened: ${describe(error)}`);
  });
}
