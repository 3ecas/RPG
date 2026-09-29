import type { MonsterDef } from '@/types/content';
import { tableDefiner } from './define';

const defineMonsters = tableDefiner<MonsterDef>();

export const MONSTERS = defineMonsters({
  rat: {
    name: 'Giant Rat', description: 'Big as a dog and twice as rude.', level: 1, hp: 5,
    attack: 1, strength: 1, defence: 1, attackIntervalMs: 2400, gold: [0, 2],
    loot: [{ itemId: 'rat_tail', min: 1, max: 1, chance: 0.6 }, { itemId: 'bone', min: 1, max: 1, chance: 0.3 }],
  },
  cow: {
    name: 'Cow', description: 'It did nothing to deserve this.', level: 2, hp: 10,
    attack: 1, strength: 2, defence: 2, attackIntervalMs: 3000, gold: [0, 0],
    loot: [{ itemId: 'cowhide', min: 1, max: 1, chance: 1 }, { itemId: 'bone', min: 1, max: 2, chance: 0.5 }],
  },
  goblin: {
    name: 'Goblin', description: 'Small, loud, armed with something sharp.', level: 3, hp: 12,
    attack: 3, strength: 2, defence: 2, attackIntervalMs: 2400, gold: [1, 8],
    loot: [{ itemId: 'goblin_ear', min: 1, max: 1, chance: 0.3 }, { itemId: 'bronze_dagger', min: 1, max: 1, chance: 0.03 }],
  },
  wolf: {
    name: 'Grey Wolf', description: 'Hunts in the dark between the willows.', level: 8, hp: 26,
    attack: 8, strength: 6, defence: 5, attackIntervalMs: 2000, gold: [0, 0],
    loot: [{ itemId: 'wolf_pelt', min: 1, max: 1, chance: 0.6 }, { itemId: 'bone', min: 1, max: 2, chance: 0.4 }],
  },
  bandit: {
    name: 'Bandit', description: 'Wants your gold. Has some of their own.', level: 12, hp: 35,
    attack: 11, strength: 9, defence: 8, attackIntervalMs: 2400, gold: [10, 40],
    loot: [{ itemId: 'bronze_sword', min: 1, max: 1, chance: 0.1 }, { itemId: 'iron_dagger', min: 1, max: 1, chance: 0.05 }, { itemId: 'shrimp', min: 1, max: 2, chance: 0.4 }],
  },
  skeleton: {
    name: 'Skeleton Miner', description: 'Still swinging a pick, centuries on.', level: 16, hp: 45,
    attack: 14, strength: 12, defence: 12, attackIntervalMs: 2600, gold: [5, 20],
    loot: [{ itemId: 'bone', min: 1, max: 3, chance: 1 }, { itemId: 'iron_ore', min: 1, max: 2, chance: 0.25 }, { itemId: 'iron_helmet', min: 1, max: 1, chance: 0.02 }],
  },
});
