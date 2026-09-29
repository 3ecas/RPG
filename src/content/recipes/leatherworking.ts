import type { RecipeDef } from '@/types/content';
import { tieredDefiner } from '../define';
import { HIDES, LEATHERS, scaled } from '../tiers';

const defineTiered = tieredDefiner<RecipeDef>();

/** Station: tannery. Each leather tier is made from the hide of the same tier. */
function piece(suffix: 'body' | 'boots' | 'gloves', hides: number, baseXp: number) {
  return defineTiered(LEATHERS, 'craft_', `_${suffix}`, (leather, tier) => ({
    station: 'tannery', skill: 'leatherworking', tier, durationMs: 3000 + 500 * hides + 300 * (tier - 1), xp: scaled(baseXp, tier, 1.6),
    inputs: [{ itemId: HIDES[tier - 1]!, qty: hides }], outputs: [{ itemId: `${leather}_${suffix}`, qty: 1 }],
  }));
}

export const LEATHERWORKING = {
  ...piece('boots', 1, 14),
  ...piece('gloves', 1, 16),
  ...piece('body', 3, 40),
};
