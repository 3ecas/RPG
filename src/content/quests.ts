import type { QuestDef } from '@/types/content';
import { tableDefiner } from './define';

/**
 * Quests can require other quests, so the id union is declared explicitly
 * instead of being derived from the table (TypeScript cannot infer a type that
 * refers to itself). Adding a quest = add its id here + its entry below.
 */
export type QuestId = 'timber_for_pell' | 'village_tour' | 'rat_problem' | 'goblin_menace' | 'apprentice_smith' | 'fresh_catch';

const defineQuests = tableDefiner<QuestDef>();

export const QUESTS: { readonly [K in QuestId]: QuestDef & { readonly id: K } } = defineQuests({
  timber_for_pell: {
    name: 'Timber for Pell',
    description: 'Pell wants five oak logs for new shelves at Hollow Goods. Tell him you will do it, then thin the grove west of the village a little.',
    giverId: 'keeper_pell',
    prerequisites: [],
    objectives: [
      { type: 'talk', npcId: 'keeper_pell' },
      { type: 'gather', itemId: 'oak_log', count: 5 },
    ],
    rewards: [{ type: 'gold', amount: 25 }, { type: 'xp', skill: 'lumberjack', amount: 100 }, { type: 'item', itemId: 'copper_ring', qty: 1 }],
    completionText: 'Five good logs. The shelves will hold. Take this ring; it came off a customer who never came back for it.',
  },
  village_tour: {
    name: 'A Walk Around the Village',
    description: 'Maren thinks a newcomer should know who is who: the captain by the road, Tobb at the pond, Pell at the store. Then go and see the hills to the east.',
    giverId: 'elder_maren',
    prerequisites: [],
    objectives: [
      { type: 'talk', npcId: 'captain_bram' },
      { type: 'talk', npcId: 'angler_tobb' },
      { type: 'talk', npcId: 'keeper_pell' },
      { type: 'visit', zoneId: 'copper_hills' },
    ],
    rewards: [{ type: 'gold', amount: 10 }, { type: 'xp', skill: 'vitality', amount: 50 }],
    completionText: 'Now you know the place. It is not much, but it is ours.',
  },
  rat_problem: {
    name: 'Rat Problem',
    description: 'Maren wants the giant rats in the village cellar dealt with, and proof it was done.',
    giverId: 'elder_maren',
    prerequisites: [],
    objectives: [
      { type: 'kill', monsterId: 'rat', count: 5 },
      { type: 'collect', itemId: 'rat_tail', count: 3 },
    ],
    rewards: [{ type: 'gold', amount: 50 }, { type: 'xp', skill: 'vitality', amount: 150 }, { type: 'item', itemId: 'shrimp', qty: 5 }, { type: 'points', amount: 2 }],
    completionText: 'Tails and all. You have a strong stomach. Here, the village can spare a little coin.',
  },
  goblin_menace: {
    name: 'Goblin Menace',
    description: 'Captain Bram needs the goblin raids on Copper Hills stopped. Ten should send a message.',
    giverId: 'captain_bram',
    prerequisites: [{ type: 'quest', questId: 'rat_problem' }],
    objectives: [{ type: 'kill', monsterId: 'goblin', count: 10 }],
    rewards: [{ type: 'gold', amount: 150 }, { type: 'xp', skill: 'vitality', amount: 400 }, { type: 'points', amount: 2 }],
    completionText: 'Ten goblins. My nephew managed one and it was already asleep. The woods past the hills are open to you.',
  },
  apprentice_smith: {
    name: "Smith's Apprentice",
    description: 'Orla will teach you the trade if you prove you can keep a furnace fed: five bronze bars and one dagger.',
    giverId: 'smith_orla',
    prerequisites: [],
    objectives: [
      { type: 'craft', recipeId: 'smelt_bronze_bar', count: 5 },
      { type: 'craft', recipeId: 'smith_bronze_dagger', count: 1 },
    ],
    rewards: [{ type: 'item', itemId: 'bronze_sword', qty: 1 }, { type: 'xp', skill: 'smithing', amount: 300 }, { type: 'points', amount: 2 }],
    completionText: 'Not bad. Not good, but not bad. Take this sword; I made it on a better day.',
  },
  fresh_catch: {
    name: 'Fresh Catch',
    description: 'Tobb wants ten cooked shrimp for the tavern. Cooked. He was very clear.',
    giverId: 'angler_tobb',
    prerequisites: [],
    objectives: [{ type: 'collect', itemId: 'shrimp', count: 10 }],
    rewards: [{ type: 'gold', amount: 80 }, { type: 'xp', skill: 'fishing', amount: 250 }, { type: 'xp', skill: 'cooking', amount: 150 }, { type: 'points', amount: 2 }],
    completionText: 'Cooked! Wonders never cease. The tavern will be pleased.',
  },
});
