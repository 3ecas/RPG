import type { RecipeDef } from '@/types/content';
import { tieredDefiner } from '../define';
import { METALS, scaled } from '../tiers';

const defineTiered = tieredDefiner<RecipeDef>();

/** Station: anvil. Bars in, gear out. Xp scales with bars used and tier. */
function piece(suffix: 'sword' | 'axe' | 'dagger' | 'helmet' | 'platebody' | 'platelegs', bars: number) {
  return defineTiered(METALS, 'smith_', `_${suffix}`, (metal, tier) => ({
    station: 'anvil', skill: 'blacksmithing', tier, durationMs: 2500 + 500 * bars + 300 * (tier - 1), xp: scaled(12 * bars, tier, 1.6),
    inputs: [{ itemId: `${metal}_bar`, qty: bars }], outputs: [{ itemId: `${metal}_${suffix}`, qty: 1 }],
  }));
}

export const FORGING = {
  ...piece('dagger', 1),
  ...piece('sword', 2),
  ...piece('axe', 3),
  ...piece('helmet', 1),
  ...piece('platelegs', 3),
  ...piece('platebody', 5),
};
