/**
 * Levels from experience. The curve is the classic one: level 2 at 83 xp,
 * level 99 at a little over thirteen million, each level about ten percent
 * further than the last, so the early dings come every few minutes and the
 * late ones are a season's work. Levels run to 100. Tiers of content are
 * bands of levels, and every level makes a skill a little better.
 */
import { MAX_LEVEL, TIER_LEVELS, type Tier } from '@/types/content';

export { MAX_LEVEL, TIER_LEVELS };

/** Cumulative xp needed for each level, by level; index 0 is unused and level 1 is 0 xp. */
const XP_FOR_LEVEL: readonly number[] = (() => {
  const out = [0, 0];
  let points = 0;
  for (let level = 1; level < MAX_LEVEL; level++) {
    points += Math.floor(level + 300 * Math.pow(2, level / 7));
    out.push(Math.floor(points / 4));
  }
  return out;
})();

export const MAX_XP = XP_FOR_LEVEL[MAX_LEVEL]!;

export function xpForLevel(level: number): number {
  const at = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return XP_FOR_LEVEL[at]!;
}

/** The level a total of `xp` has reached. */
export function levelOf(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= XP_FOR_LEVEL[level + 1]!) level++;
  return level;
}

export function levelForTier(tier: Tier): number {
  return TIER_LEVELS[tier - 1]!;
}

/** Where `xp` stands in its level: the level, the xp into it and the xp the level spans (0 at the top). */
export function progressOf(xp: number): { level: number; into: number; span: number } {
  const level = levelOf(xp);
  const floor = xpForLevel(level);
  const span = level >= MAX_LEVEL ? 0 : xpForLevel(level + 1) - floor;
  return { level, into: Math.max(0, xp - floor), span };
}

/**
 * The chance that something cooked comes out right rather than burnt: two in
 * three at the level the food opens at, a percent better per level after it,
 * and never quite certain.
 */
export function cookChance(level: number, need: number): number {
  return Math.min(0.98, 0.66 + 0.01 * Math.max(0, level - need));
}

/**
 * The chance that one try at a gather node succeeds: the node's expected
 * time per item for a level 1 character with a tier 1 tool, two percent
 * better for every level after the first and a fifth per tool tier, never
 * below one in twenty nor above nineteen in twenty. Slow at first, quick
 * by the end.
 */
export function gatherChance(node: { durationMs: number }, level: number, toolTier: number, actionMs: number): number {
  const base = actionMs / node.durationMs;
  const chance = base * (1 + 0.02 * (Math.max(1, level) - 1)) * (1 + 0.2 * (Math.max(1, toolTier) - 1));
  return Math.min(0.95, Math.max(0.05, chance));
}
