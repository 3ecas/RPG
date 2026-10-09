/**
 * Levels from experience. The curve is the classic one: level 2 at 83 xp,
 * level 99 at a little over thirteen million, each level about ten percent
 * further than the last, so the early dings come every few minutes and the
 * late ones are a season's work. Tiers of content are bands of levels.
 */
import type { Tier } from '@/types/content';

export const MAX_LEVEL = 99;

/** The level at which each tier's content opens, by tier (index 0 is tier 1). */
export const TIER_LEVELS: readonly number[] = [1, 15, 30, 50, 70, 85];

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
 * The chance that one try at a gather node succeeds: the node's expected
 * time per item (for a character at the tier's level with a tier 1 tool),
 * better by three percent per level above that and a fifth per tool tier,
 * never below one in twenty nor above nineteen in twenty.
 */
export function gatherChance(node: { durationMs: number; tier: Tier }, level: number, toolTier: number, actionMs: number): number {
  const base = actionMs / node.durationMs;
  const chance = base * (1 + 0.03 * (level - levelForTier(node.tier))) * (1 + 0.2 * (Math.max(1, toolTier) - 1));
  return Math.min(0.95, Math.max(0.05, chance));
}
