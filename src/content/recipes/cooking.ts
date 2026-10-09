import type { RecipeDef } from '@/types/content';
import { tieredDefiner } from '../define';
import { CROPS, DISHES, FISH, scaled } from '../tiers';

const defineTiered = tieredDefiner<RecipeDef>();

/** Station: campfire. Fish and crops cook into the food of their tier. The fire burns the logs, not the recipe: a village fire never goes out, a built one is fed with logs. */
export const COOK_FISH = defineTiered(FISH, 'cook_', '', (fish, tier) => ({
  station: 'campfire', skill: 'cooking', tier, durationMs: 1800 + 300 * (tier - 1), xp: scaled(30, tier, 1.5),
  inputs: [{ itemId: `raw_${fish}`, qty: 1 }], outputs: [{ itemId: fish, qty: 1 }],
}));

export const COOK_DISHES = defineTiered(DISHES, 'cook_', '', (dish, tier) => ({
  station: 'campfire', skill: 'cooking', tier, durationMs: 2400 + 300 * (tier - 1), xp: scaled(25, tier, 1.5),
  inputs: [{ itemId: CROPS[tier - 1]!, qty: 2 }], outputs: [{ itemId: dish, qty: 1 }],
}));

export const COOKING = { ...COOK_FISH, ...COOK_DISHES };
