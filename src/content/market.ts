import type { ItemId } from '@/types/ids';
import { CROPS, DISHES, FISH, HERBS, HIDES, METALS, WOODS } from './tiers';

/**
 * Items the market trades: raw materials and food of every tier. Gear comes
 * from crafting, shops and traders, and quest items are not for sale.
 */
export const MARKET_ITEMS: readonly ItemId[] = [
  'copper_ore', 'tin_ore', 'iron_ore', 'coal', 'mithril_ore', 'adamant_ore', 'rune_ore',
  ...METALS.map((m) => `${m}_bar` as const),
  ...WOODS.map((w) => `${w}_log` as const),
  ...FISH.map((f) => `raw_${f}` as const),
  ...FISH,
  ...CROPS,
  ...DISHES,
  ...HERBS,
  ...HIDES,
  'bone',
];
