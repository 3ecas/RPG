import type { NpcDef } from '@/types/content';
import { tableDefiner } from './define';

const defineNpcs = tableDefiner<NpcDef>();

export const NPCS = defineNpcs({
  elder_maren: { name: 'Maren', title: 'Village Elder', greeting: 'Welcome to Greenhollow. Small place, big problems. The cellar is full of rats, for a start.' },
  captain_bram: { name: 'Bram', title: 'Guard Captain', greeting: 'Goblins in the hills again. I have two guards and one of them is my nephew.' },
  smith_orla: { name: 'Orla', title: 'Blacksmith', greeting: 'Furnace is hot, anvil is free. Bring me something worth hitting.' },
  angler_tobb: { name: 'Tobb', title: 'Angler', greeting: 'Shrimp in the shallows, trout past the woods. Cook them before you eat them, unlike some people.' },
  keeper_pell: { name: 'Pell', title: 'Shopkeeper', greeting: 'Hollow Goods: if we do not have it, you probably do not need it. Buying, selling, no questions.' },
  lumberjack_rowan: {
    name: 'Rowan', title: 'Lumberjack', greeting: 'The oaks are all yours; they grow back faster than I can cut them. No hatchet? Take one of mine, I have more hatchets than hands.',
    handout: { itemId: 'stone_hatchet', skill: 'lumberjack', line: 'Rowan hands you a stone hatchet.' },
  },
  mason_greta: {
    name: 'Greta', title: 'Stonemason', greeting: 'The loose stones by the outcrop are free for the breaking. Two of them and a log make a fire that will cook anything. No pick? Here, a stone one.',
    handout: { itemId: 'stone_pickaxe', skill: 'mining', line: 'Greta hands you a stone pickaxe.' },
  },
  prospector_dun: { name: 'Dun', title: 'Prospector', greeting: 'Forty years in these hills. I will pay proper money for ore, and I sell picks to people who lose theirs to goblins.' },
  woodsman_hal: { name: 'Hal', title: 'Woodsman', greeting: 'Sawbench is yours if you keep it clear of wolves. I buy logs, I sell planks, I do not do small talk.' },
  quartermaster_bex: { name: 'Bex', title: 'Quartermaster', greeting: 'Kingsport Armory. Everything sharp, everything heavy. Show me your coin.' },
  bazaar_master_ilse: { name: 'Ilse', title: 'Bazaar Master', greeting: 'The Grand Bazaar buys from everyone and sells to anyone. The market floor is through the arch; prices there move with the crowd.' },
  curio_dealer_marek: { name: 'Marek', title: 'Curio Dealer', greeting: 'Rings, charms, oddities. All genuine, some of them.' },
});
