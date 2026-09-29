import type { RecipeDef } from '@/types/content';
import { tableDefiner } from '../define';

const defineRecipes = tableDefiner<RecipeDef>();

/** Station: workbench. Leather and wood. */
export const CRAFTING = defineRecipes({
  craft_leather_boots: { station: 'workbench', skill: 'crafting', level: 1, durationMs: 3000, xp: 14, inputs: [{ itemId: 'cowhide', qty: 1 }], outputs: [{ itemId: 'leather_boots', qty: 1 }] },
  craft_wooden_shield: { station: 'workbench', skill: 'crafting', level: 1, durationMs: 4000, xp: 20, inputs: [{ itemId: 'oak_log', qty: 2 }], outputs: [{ itemId: 'wooden_shield', qty: 1 }] },
  craft_leather_body: { station: 'workbench', skill: 'crafting', level: 5, durationMs: 5000, xp: 40, inputs: [{ itemId: 'cowhide', qty: 3 }], outputs: [{ itemId: 'leather_body', qty: 1 }] },
});
