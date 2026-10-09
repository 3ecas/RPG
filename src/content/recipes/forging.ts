import type { RecipeDef } from '@/types/content';
import { tieredDefiner } from '../define';
import { HIDES, METALS, scaled, WOODS } from '../tiers';

const defineTiered = tieredDefiner<RecipeDef>();

/**
 * Station: anvil. Bars in, gear out, with the wood and hide of the same tier
 * for grips, hafts and padding. Xp scales with bars used and tier.
 */
function piece(suffix: 'sword' | 'axe' | 'dagger' | 'helmet' | 'platebody' | 'platelegs', bars: number, wood: number, hide: number) {
  return defineTiered(METALS, 'smith_', `_${suffix}`, (metal, tier) => ({
    station: 'anvil', skill: 'smithing', tier, durationMs: 2500 + 500 * bars + 300 * (tier - 1), xp: scaled(12 * bars, tier, 1.6),
    inputs: [
      { itemId: `${metal}_bar`, qty: bars },
      ...(wood > 0 ? [{ itemId: `${WOODS[tier - 1]!}_log` as const, qty: wood }] : []),
      ...(hide > 0 ? [{ itemId: HIDES[tier - 1]!, qty: hide }] : []),
    ],
    outputs: [{ itemId: `${metal}_${suffix}`, qty: 1 }],
  }));
}

export const FORGING = {
  ...piece('dagger', 1, 1, 0),     // a bar and a wooden grip
  ...piece('sword', 2, 1, 0),      // two bars and a grip
  ...piece('axe', 3, 2, 0),        // a heavy head on a long haft
  ...piece('helmet', 1, 0, 1),     // a bar with leather padding
  ...piece('platelegs', 3, 0, 1),  // plates over leather
  ...piece('platebody', 5, 0, 2),  // plates over a leather jerkin
};
