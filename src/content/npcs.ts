import type { NpcDef } from '@/types/content';
import { tableDefiner } from './define';

const defineNpcs = tableDefiner<NpcDef>();

export const NPCS = defineNpcs({
  elder_maren: { name: 'Maren', title: 'Village Elder', greeting: 'Welcome to Greenhollow. Small place, big problems. The cellar is full of rats, for a start.' },
  captain_bram: { name: 'Bram', title: 'Guard Captain', greeting: 'Goblins in the hills again. I have two guards and one of them is my nephew.' },
  smith_orla: { name: 'Orla', title: 'Blacksmith', greeting: 'Furnace is hot, anvil is free. Bring me something worth hitting.' },
  angler_tobb: { name: 'Tobb', title: 'Angler', greeting: 'Shrimp in the shallows, trout past the woods. Cook them before you eat them, unlike some people.' },
  keeper_pell: { name: 'Pell', title: 'Shopkeeper', greeting: 'Hollow Goods: if we do not have it, you probably do not need it. Buying, selling, no questions.' },
  prospector_dun: { name: 'Dun', title: 'Prospector', greeting: 'Forty years in these hills. I will pay proper money for ore, and I sell picks to people who lose theirs to goblins.' },
});
