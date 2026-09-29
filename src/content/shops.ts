import type { ShopDef } from '@/types/content';
import { tableDefiner } from './define';

const defineShops = tableDefiner<ShopDef>();

const HOUR = 60 * 60 * 1000;

/** Fixed prices, finite stock that restocks over game time. Placed in zones by zones.ts. */
export const SHOPS = defineShops({
  hollow_goods: {
    name: 'Hollow Goods',
    description: 'The village general store. Buys almost anything at a bad price, sells the basics.',
    keeperId: 'keeper_pell',
    markup: 1.6,
    sellRate: 0.4,
    buys: 'all',
    restockMs: HOUR / 4,
    stock: [
      { itemId: 'shrimp', qty: 20 },
      { itemId: 'trout', qty: 5 },
      { itemId: 'oak_log', qty: 'infinite' },
      { itemId: 'rusty_dagger', qty: 'infinite' },
      { itemId: 'leather_gloves', qty: 3 },
      { itemId: 'wooden_shield', qty: 2 },
      { itemId: 'copper_ring', qty: 1, price: 150 },
      { itemId: 'amulet_of_vigor', qty: 1, price: 600 },
    ],
  },
  smithy: {
    name: "Orla's Smithy",
    description: 'Bars and bronze work. Orla buys back metal goods at a fair rate.',
    keeperId: 'smith_orla',
    markup: 1.8,
    sellRate: 0.5,
    buys: ['weapon', 'armor', 'material'],
    restockMs: HOUR / 2,
    stock: [
      { itemId: 'bronze_bar', qty: 10 },
      { itemId: 'bronze_dagger', qty: 3 },
      { itemId: 'bronze_helmet', qty: 2 },
      { itemId: 'iron_bar', qty: 4, price: 80 },
      { itemId: 'steel_bar', qty: 1, price: 220 },
    ],
  },
  prospectors_outpost: {
    name: "Dun's Outpost",
    description: 'A tent full of ore and optimism. The best price for raw ore this side of the woods.',
    keeperId: 'prospector_dun',
    markup: 1.5,
    sellRate: 0.6,
    buys: ['material'],
    restockMs: HOUR / 6,
    stock: [
      { itemId: 'copper_ore', qty: 30 },
      { itemId: 'tin_ore', qty: 30 },
      { itemId: 'iron_ore', qty: 8 },
      { itemId: 'coal', qty: 5 },
      { itemId: 'shrimp', qty: 10 },
    ],
  },
});
