/**
 * What a brand new character starts with: nothing. The first tools come from
 * people: Rowan the lumberjack hands out a stone hatchet and Greta the
 * stonemason a stone pickaxe to anyone who talks to them without one (see
 * `handout` in npcs.ts). The dagger and the food arrive with combat.
 */
import type { ItemStack } from '@/types/content';

export const STARTING_KIT = {
  items: [] as readonly Readonly<ItemStack>[],
} as const;
