/**
 * The wire protocol between the browser and the zone server: JSON messages
 * typed as unions shared by both sides. The client sends intents; the server
 * answers a join with a snapshot and then sends one delta per tick. Nothing
 * from a client is trusted: parseClientMessage() returns null for anything
 * that is not exactly on the schema, and the limits here hold on both sides.
 */
import type { Dir } from '@/world/grid';

/** Bumped whenever a message changes shape; the server turns other versions away. */
export const PROTOCOL_VERSION = 4;

export const LIMITS = {
  NAME_MIN: 3,
  NAME_MAX: 12,
  CHAT_MAX: 80,
  /** Longest client message accepted, as JSON text. */
  MESSAGE_CHARS: 1024,
  TOKEN_MAX: 64,
  /** The browser's secret is random and at least this long (and at most TOKEN_MAX). */
  SECRET_MIN: 16,
  COORD_MAX: 4096,
} as const;

/** Where a character is: the cell it stands in or is leaving, the cell it is walking into (-1, -1 when standing) and how far along it is. */
export interface Placement {
  cx: number;
  cy: number;
  nx: number;
  ny: number;
  t: number;
}

export interface EntitySnapshot extends Placement {
  id: number;
  name: string;
  dir: Dir;
  running: boolean;
  moving: boolean;
}

export type ClientMessage =
  /**
   * First message on a connection: who you are, the secret this browser made
   * up once and keeps (the character answers only to it until accounts
   * arrive), and your session token if you are coming back.
   */
  | { t: 'hello'; v: number; name: string; secret: string; token: string | null }
  /**
   * One step of movement, sent every step while a path is being walked.
   * `seq` numbers them so the server can say how far it got. `to` plans a
   * walk to a clicked cell before the step is taken.
   */
  | { t: 'input'; seq: number; to?: [number, number] }
  | { t: 'run'; on: boolean }
  | { t: 'chat'; text: string }
  | { t: 'ping'; at: number };

/** Where an entity is after this tick: id, its placement, facing, whether it moved, and the last input the server applied for it. */
export type MoveState = [id: number, cx: number, cy: number, nx: number, ny: number, t: number, dir: Dir, moving: 0 | 1, seq: number];

export interface ChatLine {
  id: number;
  text: string;
}

export interface TickDelta {
  tick: number;
  joined: EntitySnapshot[];
  left: number[];
  moves: MoveState[];
  chat: ChatLine[];
}

/** A zone as a client first sees it: which one, the server tick, everyone in it, and the number of the client's last input the server applied. */
export interface ZoneSnapshot {
  zone: string;
  tick: number;
  entities: EntitySnapshot[];
  seq: number;
}

export type ServerMessage =
  /** You are in the world: your id, a session token, the step length, whether this is a character coming back, and the zone you stand in. */
  | ({ t: 'welcome'; id: number; token: string; tickMs: number; resumed: boolean } & ZoneSnapshot)
  /** You walked into another zone: forget the old one, here is the new. Your id and token stay. */
  | ({ t: 'zone' } & ZoneSnapshot)
  | ({ t: 'tick' } & TickDelta)
  | { t: 'reject'; reason: string }
  | { t: 'pong'; at: number };

const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*(?: [A-Za-z0-9_]+)*$/;
const SECRET_RE = /^[A-Za-z0-9_-]+$/;
/** Control characters, format characters (zero-width spaces, bidi marks, the byte-order mark) and the Unicode line and paragraph separators. */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/** A display name as the server stores it: trimmed, single spaces, a letter first, within the limits. Null if unusable. */
export function normalizeName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < LIMITS.NAME_MIN || name.length > LIMITS.NAME_MAX || !NAME_RE.test(name)) return null;
  return name;
}

/** Whether this is a secret a browser could have made: letters, digits, dash and underscore, within the limits. */
export function isSecret(v: unknown): v is string {
  return typeof v === 'string' && v.length >= LIMITS.SECRET_MIN && v.length <= LIMITS.TOKEN_MAX && SECRET_RE.test(v);
}

/** Chat text as it will be shown: no control or invisible characters, collapsed whitespace, cut to the limit. Null when nothing is left. */
export function sanitizeChat(raw: string): string | null {
  const text = raw.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
  if (text.length === 0) return null;
  return text.length > LIMITS.CHAT_MAX ? text.slice(0, LIMITS.CHAT_MAX) : text;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

/** The message a client sent, if it is exactly one of ours; null otherwise. Names and chat come back normalized. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!isRecord(raw) || typeof raw.t !== 'string') return null;
  switch (raw.t) {
    case 'hello': {
      if (!isInt(raw.v, 0, 1_000_000) || typeof raw.name !== 'string' || raw.name.length > LIMITS.NAME_MAX * 4) return null;
      if (!isSecret(raw.secret)) return null;
      const token = raw.token;
      if (token !== null && token !== undefined && (typeof token !== 'string' || token.length > LIMITS.TOKEN_MAX)) return null;
      const name = normalizeName(raw.name);
      if (!name) return null;
      return { t: 'hello', v: raw.v, name, secret: raw.secret, token: typeof token === 'string' && token.length > 0 ? token : null };
    }
    case 'input': {
      if (!isInt(raw.seq, 0, 1_000_000_000)) return null;
      const to = raw.to;
      if (to === undefined || to === null) return { t: 'input', seq: raw.seq };
      if (!Array.isArray(to) || to.length !== 2 || !isInt(to[0], 0, LIMITS.COORD_MAX) || !isInt(to[1], 0, LIMITS.COORD_MAX)) return null;
      return { t: 'input', seq: raw.seq, to: [to[0], to[1]] };
    }
    case 'run':
      return typeof raw.on === 'boolean' ? { t: 'run', on: raw.on } : null;
    case 'chat': {
      if (typeof raw.text !== 'string' || raw.text.length > LIMITS.CHAT_MAX * 4) return null;
      const text = sanitizeChat(raw.text);
      return text ? { t: 'chat', text } : null;
    }
    case 'ping':
      return typeof raw.at === 'number' && Number.isFinite(raw.at) ? { t: 'ping', at: raw.at } : null;
    default:
      return null;
  }
}

/** JSON text from a client to a message, or null when oversized, malformed or off the schema. */
export function decodeClientMessage(text: string): ClientMessage | null {
  if (text.length > LIMITS.MESSAGE_CHARS) return null;
  try {
    return parseClientMessage(JSON.parse(text));
  } catch {
    return null;
  }
}

const SERVER_TYPES: ReadonlySet<string> = new Set(['welcome', 'zone', 'tick', 'reject', 'pong']);

/** A light check that text from the server has one of our shapes. The server is trusted; this only catches a wrong endpoint. */
export function decodeServerMessage(text: string): ServerMessage | null {
  try {
    const raw: unknown = JSON.parse(text);
    return isRecord(raw) && typeof raw.t === 'string' && SERVER_TYPES.has(raw.t) ? (raw as ServerMessage) : null;
  } catch {
    return null;
  }
}
