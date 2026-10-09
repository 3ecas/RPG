/**
 * A character as it is kept between sessions: the name, the browser secret
 * that owns the name (hashed), how it stood, and a free `state` object for
 * everything the coming slices add. The live character in a room extends
 * `Character`; the record the store keeps adds the zone and the cell.
 */
import { createHash } from 'node:crypto';
import type { ZoneId } from '@/types/ids';
import type { Cell, Dir } from '@/world/grid';

export interface Character {
  name: string;
  /** SHA-256 of the secret the creating browser sends with every hello. The secret itself is never stored. */
  secretHash: string;
  /** Milliseconds since the epoch. */
  createdAt: number;
  dir: Dir;
  running: boolean;
  /** Skills, bag, bank, flags such as "finished the tutorial", as the coming slices add them: JSON, so the shape can grow without a migration. */
  state: Record<string, unknown>;
}

export interface CharacterRecord extends Character {
  zone: ZoneId;
  x: number;
  y: number;
  lastSeenAt: number;
}

/** The lookup key of a name: names are unique without regard to case. */
export function keyOf(name: string): string {
  return name.toLowerCase();
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/** A character that has never stood anywhere: it will start on the spawn of `zone`. */
export function newCharacter(name: string, secretHash: string, zone: ZoneId, at: Cell, now: number): CharacterRecord {
  return { name, secretHash, createdAt: now, dir: 0, running: false, state: {}, zone, x: at.x, y: at.y, lastSeenAt: now };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/** A stored document as a record, if it has the shape; null otherwise. Whether the zone still exists is for the world to decide. */
export function parseRecord(raw: unknown): CharacterRecord | null {
  if (!isRecord(raw)) return null;
  const { name, secretHash, createdAt, dir, running, state, zone, x, y, lastSeenAt } = raw;
  if (typeof name !== 'string' || name.length === 0 || typeof secretHash !== 'string' || typeof zone !== 'string') return null;
  if (!isInt(x) || !isInt(y) || !isInt(dir) || dir < 0 || dir > 3 || typeof running !== 'boolean') return null;
  if (typeof createdAt !== 'number' || typeof lastSeenAt !== 'number' || !isRecord(state)) return null;
  return { name, secretHash, createdAt, dir: dir as Dir, running, state, zone: zone as ZoneId, x, y, lastSeenAt };
}
