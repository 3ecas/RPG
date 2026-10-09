/** What a brand new character starts with: enough to chop the first tree. The dagger and the food arrive with combat. */
import type { ItemStack } from '@/types/content';

export const STARTING_KIT = {
  items: [{ itemId: 'bronze_hatchet', qty: 1 }] as readonly Readonly<ItemStack>[],
} as const;
