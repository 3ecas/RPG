import type { RecipeDef } from '@/types/content';
import { tieredDefiner } from '../define';
import { CROPS, DISHES, FISH, scaled, WOODS } from '../tiers';

const defineTiered = tieredDefiner<RecipeDef>();

/** Station: campfire. Fish and crops cook into the food of their tier; every cook burns a log of the same tier. */
export const COOK_FISH = defineTiered(FISH, 'cook_', '', (fish, tier) => ({
  station: 'campfire', skill: 'cooking', tier, durationMs: 2000 + 300 * (tier - 1), xp: scaled(30, tier, 1.5),
  inputs: [{ itemId: `raw_${fish}`, qty: 1 }, { itemId: `${WOODS[tier - 1]!}_log`, qty: 1 }], outputs: [{ itemId: fish, qty: 1 }],
}));

export const COOK_DISHES = defineTiered(DISHES, 'cook_', '', (dish, tier) => ({
  station: 'campfire', skill: 'cooking', tier, durationMs: 2500 + 300 * (tier - 1), xp: scaled(25, tier, 1.5),
  inputs: [{ itemId: CROPS[tier - 1]!, qty: 2 }, { itemId: `${WOODS[tier - 1]!}_log`, qty: 1 }], outputs: [{ itemId: dish, qty: 1 }],
}));

export const COOKING = { ...COOK_FISH, ...COOK_DISHES };
