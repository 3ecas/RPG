import type { ItemStack, RecipeDef } from '@/types/content';
import { tieredDefiner } from '../define';
import { type Metal, METALS, scaled } from '../tiers';

const defineTiered = tieredDefiner<RecipeDef>();

/** What goes into each bar. Everything past iron needs coal. */
const INPUTS: Readonly<Record<Metal, readonly Readonly<ItemStack>[]>> = {
  bronze: [{ itemId: 'copper_ore', qty: 1 }, { itemId: 'tin_ore', qty: 1 }],
  iron: [{ itemId: 'iron_ore', qty: 1 }],
  steel: [{ itemId: 'iron_ore', qty: 1 }, { itemId: 'coal', qty: 2 }],
  mithril: [{ itemId: 'mithril_ore', qty: 1 }, { itemId: 'coal', qty: 4 }],
  adamant: [{ itemId: 'adamant_ore', qty: 1 }, { itemId: 'coal', qty: 6 }],
  rune: [{ itemId: 'rune_ore', qty: 1 }, { itemId: 'coal', qty: 8 }],
};

/** Station: furnace. Ore in, bars out. */
export const SMELTING = defineTiered(METALS, 'smelt_', '_bar', (metal, tier) => ({
  station: 'furnace', skill: 'blacksmithing', tier, durationMs: 3000 + 300 * (tier - 1), xp: scaled(8, tier, 1.6),
  inputs: INPUTS[metal], outputs: [{ itemId: `${metal}_bar`, qty: 1 }],
}));
