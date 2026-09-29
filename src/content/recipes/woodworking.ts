import type { RecipeDef } from '@/types/content';
import { tieredDefiner } from '../define';
import { scaled, WOODS } from '../tiers';

const defineTiered = tieredDefiner<RecipeDef>();

/** Station: sawbench. */
export const WOODWORKING = defineTiered(WOODS, 'carve_', '_shield', (wood, tier) => ({
  station: 'sawbench', skill: 'woodworking', tier, durationMs: 4000 + 400 * (tier - 1), xp: scaled(20, tier, 1.6),
  inputs: [{ itemId: `${wood}_log`, qty: 3 }], outputs: [{ itemId: `${wood}_shield`, qty: 1 }],
}));
