import type { RecipeDef } from '@/types/content';
import { tieredDefiner } from '../define';
import { HIDES, METALS, scaled, WOODS } from '../tiers';

const defineTiered = tieredDefiner<RecipeDef>();

/** Station: sawbench. Planks of the tier's wood, a metal rim, and a hide strap. */
export const WOODWORKING = defineTiered(WOODS, 'carve_', '_shield', (wood, tier) => ({
  station: 'sawbench', skill: 'woodworking', tier, durationMs: 4000 + 400 * (tier - 1), xp: scaled(20, tier, 1.6),
  inputs: [{ itemId: `${wood}_log`, qty: 3 }, { itemId: `${METALS[tier - 1]!}_bar`, qty: 1 }, { itemId: HIDES[tier - 1]!, qty: 1 }],
  outputs: [{ itemId: `${wood}_shield`, qty: 1 }],
}));
