/**
 * The zone server: a WebSocket endpoint in front of one Room, a
 * drift-corrected tick loop, sessions with reconnect tokens, and a limit on
 * everything a client can send. The rules of the world live in the room;
 * this file only moves messages.
 */
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { CONTENT } from '@/content';
import { Registry } from '@/core/registry';
import { type ClientMessage, decodeClientMessage, LIMITS, PROTOCOL_VERSION, type ServerMessage } from '@/net/protocol';
import type { ZoneId } from '@/types/ids';
import { Room } from './room';

export interface ServerOptions {
  /** 0 picks a free port. */
  port: number;
  host?: string;
  zone: ZoneId;
  tickMs: number;
  /** How long a dropped connection may come back for before its character leaves. */
  graceMs: number;
  capacity?: number;
  log?: (line: string) => void;
}

export interface GameServer {
  readonly port: number;
  readonly room: Room;
  /** Connections that have said hello and stand in the world. */
  readonly connections: number;
  close(): Promise<void>;
}

/** Messages a connection may send per second, and how many it may burst: one input per step while moving, plus a little. */
const RATE_PER_SECOND = 30;
const BURST = 60;
/** Off-schema or over-rate messages tolerated before the connection is closed. */
const MAX_STRIKES = 10;
const HELLO_TIMEOUT_MS = 10_000;
const KEEPALIVE_MS = 30_000;

interface Connection {
  socket: WebSocket;
  playerId: number | null;
  strikes: number;
  budget: number;
  refilledAt: number;
  alive: boolean;
  helloTimer: ReturnType<typeof setTimeout> | null;
}

export function startServer(options: ServerOptions): Promise<GameServer> {
  const log = options.log ?? (() => {});
  const content = new Registry(CONTENT);
  const problems = content.validate();
  if (problems.length > 0) throw new Error(`Content validation failed:\n${problems.join('\n')}`);
  const graceTicks = Math.max(1, Math.ceil(options.graceMs / options.tickMs));
  const room = new Room(options.zone, content.map(options.zone), { graceTicks, capacity: options.capacity ?? 200 });

  const http = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, zone: room.zoneId, tick: room.tick, players: room.size, tickMs: options.tickMs, protocol: PROTOCOL_VERSION }));
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

  const send = (socket: WebSocket, msg: ServerMessage): void => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
  };

  const broadcast = (msg: ServerMessage): void => {
    const text = JSON.stringify(msg);
    for (const conn of byPlayer.values()) if (conn.socket.readyState === WebSocket.OPEN) conn.socket.send(text);
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

  const welcome = (conn: Connection, playerId: number, token: string): void => {
    send(conn.socket, { t: 'welcome', id: playerId, token, tickMs: options.tickMs, tick: room.tick, zone: room.zoneId, entities: room.snapshot(), seq: room.player(playerId)?.seq ?? 0 });
  };

  const hello = (conn: Connection, msg: Extract<ClientMessage, { t: 'hello' }>): void => {
    if (conn.playerId !== null) {
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
      if (owned !== undefined && room.player(owned)) {
        room.reconnect(owned);
        bind(conn, owned);
        welcome(conn, owned, msg.token);
        log(`${room.player(owned)!.name} reconnected`);
        return;
      }
    }
    const result = room.join(msg.name);
    if (!result.ok) {
      send(conn.socket, { t: 'reject', reason: result.reason });
      conn.socket.close(1008, 'Refused');
      return;
    }
    const { player, resumed } = result.value;
    const token = issueToken(player.id);
    bind(conn, player.id);
    welcome(conn, player.id, token);
    log(`${player.name} ${resumed ? 'took their character back' : 'joined'} (${room.size} in ${room.zoneId})`);
  };

  const handle = (conn: Connection, msg: ClientMessage): void => {
    if (msg.t === 'hello') {
      hello(conn, msg);
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
      case 'input': room.queueInput(id, msg.to ? { seq: msg.seq, to: { x: msg.to[0], y: msg.to[1] } } : { seq: msg.seq }); break;
      case 'run': room.setRunning(id, msg.on); break;
      case 'chat': room.chat(id, msg.text); break;
    }
  };

  wss.on('connection', (socket) => {
    const conn: Connection = { socket, playerId: null, strikes: 0, budget: BURST, refilledAt: Date.now(), alive: true, helloTimer: null };
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
        room.disconnect(conn.playerId);
        log(`${room.player(conn.playerId)?.name ?? '?'} dropped; holding their character for ${Math.round(options.graceMs / 1000)} s`);
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
    const delta = room.advance();
    for (const id of delta.left) forget(id);
    broadcast({ t: 'tick', ...delta });
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

  return new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(options.port, options.host ?? '0.0.0.0', () => {
      const port = (http.address() as AddressInfo).port;
      schedule();
      log(`zone ${room.zoneId} listening on port ${port}, tick ${options.tickMs} ms`);
      resolve({
        port,
        room,
        get connections() {
          return byPlayer.size;
        },
        close: () =>
          new Promise<void>((done) => {
            if (tickTimer) clearTimeout(tickTimer);
            clearInterval(keepalive);
            for (const conn of connections) {
              if (conn.helloTimer) clearTimeout(conn.helloTimer);
              conn.socket.close(1001, 'Server shutting down');
            }
            wss.close(() => {
              http.closeAllConnections();
              http.close(() => done());
            });
          }),
      });
    });
  });
}
