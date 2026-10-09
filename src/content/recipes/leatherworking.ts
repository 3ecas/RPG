import type { RecipeDef } from '@/types/content';
import { tieredDefiner } from '../define';
import { HIDES, LEATHERS, METALS, scaled, WOODS } from '../tiers';

const defineTiered = tieredDefiner<RecipeDef>();

/** Station: tannery, skill: crafting. Each leather tier is made from the hide of the same tier; boots get wooden soles, bodies metal studs and buckles. */
function piece(suffix: 'body' | 'boots' | 'gloves', hides: number, wood: number, bars: number, baseXp: number) {
  return defineTiered(LEATHERS, 'craft_', `_${suffix}`, (leather, tier) => ({
    station: 'tannery', skill: 'crafting', tier, durationMs: 3000 + 500 * hides + 300 * (tier - 1), xp: scaled(baseXp, tier, 1.6),
    inputs: [
      { itemId: HIDES[tier - 1]!, qty: hides },
      ...(wood > 0 ? [{ itemId: `${WOODS[tier - 1]!}_log` as const, qty: wood }] : []),
      ...(bars > 0 ? [{ itemId: `${METALS[tier - 1]!}_bar` as const, qty: bars }] : []),
    ],
    outputs: [{ itemId: `${leather}_${suffix}`, qty: 1 }],
  }));
}

export const LEATHERWORKING = {
  ...piece('gloves', 1, 0, 0, 16),
  ...piece('boots', 1, 1, 0, 14),
  ...piece('body', 3, 0, 1, 40),
};
