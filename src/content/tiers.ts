/**
 * The six tiers and the material ladder for each family. Position in a list
 * is the tier (index 0 = tier 1). Tiered items, recipes and nodes are
 * generated from these lists, so extending a family is one entry here.
 */
import type { Tier } from '@/types/content';

export const TIERS: readonly Tier[] = [1, 2, 3, 4, 5, 6];

export const TIER_NAMES: Readonly<Record<Tier, string>> = {
  1: 'Novice',
  2: 'Apprentice',
  3: 'Journeyman',
  4: 'Adept',
  5: 'Expert',
  6: 'Master',
};

export const METALS = ['bronze', 'iron', 'steel', 'mithril', 'adamant', 'rune'] as const;
export const WOODS = ['oak', 'willow', 'maple', 'yew', 'ash', 'elder'] as const;
export const FISH = ['shrimp', 'trout', 'salmon', 'tuna', 'lobster', 'swordfish'] as const;
export const CROPS = ['wheat', 'potato', 'carrot', 'cabbage', 'pumpkin', 'sunfruit'] as const;
export const DISHES = ['bread', 'baked_potato', 'carrot_stew', 'cabbage_stew', 'pumpkin_pie', 'sunfruit_tart'] as const;
export const HERBS = ['nettle', 'sage', 'lavender', 'bloodroot', 'moonflower', 'dragonleaf'] as const;
export const HIDES = ['cowhide', 'wolf_pelt', 'bear_pelt', 'troll_hide', 'wyvern_scale', 'dragon_scale'] as const;
export const LEATHERS = ['leather', 'hard_leather', 'studded', 'trollhide', 'scale', 'dragonhide'] as const;

export type Metal = (typeof METALS)[number];
export type Wood = (typeof WOODS)[number];

/** Base value grown by a constant factor per tier: 4 → 9 → 19 → 42 → 93 → 205. */
export function scaled(base: number, tier: Tier, factor = 2.2): number {
  return Math.max(1, Math.round(base * Math.pow(factor, tier - 1)));
}

/** 'hard_leather' → 'Hard Leather'. */
export function titleCase(id: string): string {
  return id.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
