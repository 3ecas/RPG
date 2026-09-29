import type { RecipeDef } from '@/types/content';
import { tableDefiner } from '../define';

const defineRecipes = tableDefiner<RecipeDef>();

/** Station: campfire. */
export const COOKING = defineRecipes({
  cook_shrimp: { station: 'campfire', skill: 'cooking', level: 1, durationMs: 2000, xp: 30, inputs: [{ itemId: 'raw_shrimp', qty: 1 }], outputs: [{ itemId: 'shrimp', qty: 1 }] },
  cook_trout: { station: 'campfire', skill: 'cooking', level: 15, durationMs: 2500, xp: 70, inputs: [{ itemId: 'raw_trout', qty: 1 }], outputs: [{ itemId: 'trout', qty: 1 }] },
});
