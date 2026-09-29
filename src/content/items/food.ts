import type { ItemDef } from '@/types/content';
import { tableDefiner } from '../define';

const defineItems = tableDefiner<ItemDef>();

export const FOOD = defineItems({
  shrimp: {
    name: 'Shrimp', description: 'Pink and crunchy. Heals 4.', category: 'food', value: 6,
    consume: { effects: [{ type: 'heal', amount: 4 }] },
  },
  trout: {
    name: 'Trout', description: 'Pan-fried. Heals 9.', category: 'food', value: 18,
    consume: { effects: [{ type: 'heal', amount: 9 }] },
  },
});
