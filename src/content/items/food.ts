import type { ItemDef } from '@/types/content';
import { tieredDefiner } from '../define';
import { DISHES, FISH, scaled, titleCase } from '../tiers';

const defineTiered = tieredDefiner<ItemDef>();

const FISH_HEAL = [4, 9, 14, 20, 28, 40];
const DISH_HEAL = [3, 7, 12, 18, 25, 35];

export const COOKED_FISH = defineTiered(FISH, '', '', (fish, tier) => ({
  name: titleCase(fish), description: `Cooked. Heals ${FISH_HEAL[tier - 1]}.`, category: 'food', tier, value: scaled(6, tier),
  consume: { effects: [{ type: 'heal', amount: FISH_HEAL[tier - 1]! }] },
}));

export const DISH_ITEMS = defineTiered(DISHES, '', '', (dish, tier) => ({
  name: titleCase(dish), description: `Home cooking. Heals ${DISH_HEAL[tier - 1]}.`, category: 'food', tier, value: scaled(5, tier),
  consume: { effects: [{ type: 'heal', amount: DISH_HEAL[tier - 1]! }] },
}));

export const FOOD = { ...COOKED_FISH, ...DISH_ITEMS };
