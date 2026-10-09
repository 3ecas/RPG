import type { RecipeDef } from '@/types/content';
import { tieredDefiner } from '../define';
import { HIDES, METALS, scaled, WOODS } from '../tiers';

const defineTiered = tieredDefiner<RecipeDef>();

/** Station: sawbench, skill: crafting. Shields, bows and staffs from the tier's wood, with a bar or a hide of the tier. */
export const SHIELD_RECIPES = defineTiered(WOODS, 'carve_', '_shield', (wood, tier) => ({
  station: 'sawbench', skill: 'crafting', tier, durationMs: 4000 + 400 * (tier - 1), xp: scaled(20, tier, 1.6),
  inputs: [{ itemId: `${wood}_log`, qty: 3 }, { itemId: `${METALS[tier - 1]!}_bar`, qty: 1 }, { itemId: HIDES[tier - 1]!, qty: 1 }],
  outputs: [{ itemId: `${wood}_shield`, qty: 1 }],
}));

export const BOW_RECIPES = defineTiered(WOODS, 'carve_', '_bow', (wood, tier) => ({
  station: 'sawbench', skill: 'crafting', tier, durationMs: 3500 + 400 * (tier - 1), xp: scaled(18, tier, 1.6),
  inputs: [{ itemId: `${wood}_log`, qty: 2 }, { itemId: HIDES[tier - 1]!, qty: 1 }],
  outputs: [{ itemId: `${wood}_bow`, qty: 1 }],
}));

export const STAFF_RECIPES = defineTiered(WOODS, 'carve_', '_staff', (wood, tier) => ({
  station: 'sawbench', skill: 'crafting', tier, durationMs: 4500 + 400 * (tier - 1), xp: scaled(24, tier, 1.6),
  inputs: [{ itemId: `${wood}_log`, qty: 2 }, { itemId: `${METALS[tier - 1]!}_bar`, qty: 1 }],
  outputs: [{ itemId: `${wood}_staff`, qty: 1 }],
}));

export const WOODWORKING = { ...SHIELD_RECIPES, ...BOW_RECIPES, ...STAFF_RECIPES };
