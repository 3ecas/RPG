/** What a brand new character starts with. */
import type { ItemStack } from '@/types/content';

export const STARTING_KIT = {
  name: 'Adventurer',
  gold: 10,
  items: [
    { itemId: 'rusty_dagger', qty: 1 },
    { itemId: 'shrimp', qty: 5 },
  ] as readonly Readonly<ItemStack>[],
} as const;
