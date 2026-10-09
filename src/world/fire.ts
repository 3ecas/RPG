/**
 * Campfires. The village fires never go out; one a player builds burns for
 * as long as its fuel lasts and can be fed logs. Two stones and a log build
 * one; a log of a higher tier burns longer. Pure numbers, shared by the room
 * that runs them and the window that shows them.
 */
import type { Tier } from '@/types/content';

export const FIRE_STONES = 2;
export const FIRE_LOGS = 1;
/** Milliseconds a log of a tier burns for: a minute per tier, oak to elder. */
export function fuelMs(logTier: Tier | number): number {
  return 60_000 * Math.max(1, Math.min(6, Math.floor(logTier)));
}
/** The most fuel a fire holds; a log added past this is refused. */
export const FIRE_MAX_MS = 10 * 60_000;
/** Crafting xp for building a fire, and for every log added, by the log's tier. */
export const FIRE_BUILD_XP = 15;
export function feedXp(logTier: Tier | number): number {
  return 5 * Math.max(1, Math.min(6, Math.floor(logTier)));
}
