import type { RecipeDef } from '@/types/content';
import { tableDefiner } from '../define';

const defineRecipes = tableDefiner<RecipeDef>();

/** Station: furnace. Ore in, bars out. */
export const SMELTING = defineRecipes({
  smelt_bronze_bar: {
    station: 'furnace', skill: 'smithing', level: 1, durationMs: 3000, xp: 6,
    inputs: [{ itemId: 'copper_ore', qty: 1 }, { itemId: 'tin_ore', qty: 1 }],
    outputs: [{ itemId: 'bronze_bar', qty: 1 }],
  },
  smelt_iron_bar: {
    station: 'furnace', skill: 'smithing', level: 15, durationMs: 3500, xp: 12,
    inputs: [{ itemId: 'iron_ore', qty: 1 }],
    outputs: [{ itemId: 'iron_bar', qty: 1 }],
  },
  smelt_steel_bar: {
    station: 'furnace', skill: 'smithing', level: 30, durationMs: 4000, xp: 18,
    inputs: [{ itemId: 'iron_ore', qty: 1 }, { itemId: 'coal', qty: 2 }],
    outputs: [{ itemId: 'steel_bar', qty: 1 }],
  },
});
