/** Outcome of a player command. Gameplay validation returns a reason; it never throws. */
export type Result<T = void> = { ok: true; value: T } | { ok: false; reason: string };

export function ok(): Result<void>;
export function ok<T>(value: T): Result<T>;
export function ok<T>(value?: T): Result<T | void> {
  return { ok: true, value };
}

export function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}
