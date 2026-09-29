import type { TraderDef } from '@/types/content';
import { tableDefiner } from './define';

const defineTraders = tableDefiner<TraderDef>();

const MINUTE = 60 * 1000;

/** Barter only, no gold. A few of each trader's offers are shown at a time and rotate on a timer. */
export const TRADERS = defineTraders({
  peddler_vex: {
    name: 'Vex',
    title: 'Wandering Peddler',
    description: 'Half goblin, half cart. Trades whatever fell off the last one.',
    refreshMs: 30 * MINUTE,
    offersShown: 3,
    offers: [
      { give: [{ itemId: 'copper_ore', qty: 10 }, { itemId: 'tin_ore', qty: 10 }], get: [{ itemId: 'bronze_bar', qty: 8 }] },
      { give: [{ itemId: 'oak_log', qty: 20 }], get: [{ itemId: 'iron_ore', qty: 3 }], uses: 5 },
      { give: [{ itemId: 'rat_tail', qty: 3 }], get: [{ itemId: 'shrimp', qty: 4 }], uses: 5 },
      { give: [{ itemId: 'cowhide', qty: 2 }], get: [{ itemId: 'leather_boots', qty: 1 }] },
      { give: [{ itemId: 'bone', qty: 15 }], get: [{ itemId: 'bronze_helmet', qty: 1 }], uses: 1 },
      { give: [{ itemId: 'goblin_ear', qty: 4 }], get: [{ itemId: 'bronze_sword', qty: 1 }], uses: 1 },
      { give: [{ itemId: 'raw_shrimp', qty: 15 }], get: [{ itemId: 'copper_ring', qty: 1 }], uses: 1 },
      { give: [{ itemId: 'bronze_dagger', qty: 3 }], get: [{ itemId: 'iron_dagger', qty: 1 }], uses: 1 },
    ],
  },
  woods_hermit: {
    name: 'Ysolde',
    title: 'Hermit of the Willows',
    description: 'Lives in a hollow tree. Wants furs and fish; has things no shop sells.',
    refreshMs: 45 * MINUTE,
    offersShown: 3,
    offers: [
      { give: [{ itemId: 'wolf_pelt', qty: 3 }], get: [{ itemId: 'steel_bar', qty: 1 }], uses: 2 },
      { give: [{ itemId: 'willow_log', qty: 10 }], get: [{ itemId: 'coal', qty: 2 }], uses: 5 },
      { give: [{ itemId: 'raw_trout', qty: 5 }], get: [{ itemId: 'iron_bar', qty: 1 }], uses: 4 },
      { give: [{ itemId: 'wolf_pelt', qty: 1 }], get: [{ itemId: 'trout', qty: 3 }], uses: 5 },
      { give: [{ itemId: 'bone', qty: 30 }], get: [{ itemId: 'amulet_of_vigor', qty: 1 }], uses: 1 },
      { give: [{ itemId: 'iron_ore', qty: 12 }], get: [{ itemId: 'steel_bar', qty: 2 }], uses: 2 },
    ],
  },
});
