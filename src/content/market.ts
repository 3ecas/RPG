import type { ItemId } from '@/types/ids';

/**
 * Items the market trades. Raw materials and food only: gear comes from
 * crafting, shops and traders, and quest items are not for sale.
 */
export const MARKET_ITEMS: readonly ItemId[] = [
  'copper_ore', 'tin_ore', 'iron_ore', 'coal',
  'bronze_bar', 'iron_bar', 'steel_bar',
  'oak_log', 'willow_log',
  'raw_shrimp', 'raw_trout', 'shrimp', 'trout',
  'cowhide', 'wolf_pelt', 'bone',
];
