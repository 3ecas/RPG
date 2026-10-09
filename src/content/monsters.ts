import type { MonsterDef } from '@/types/content';
import { tableDefiner } from './define';

const defineMonsters = tableDefiner<MonsterDef>();

/**
 * Two or three monsters per tier. Rough tier baselines:
 * hp 12/30/60/120/220/400 · attack 3/8/14/22/32/45 · armor 2/6/12/20/30/40.
 */
export const MONSTERS = defineMonsters({
  rat: {
    name: 'Giant Rat', description: 'Big as a dog and twice as rude.', tier: 1, hp: 5,
    attack: 1, armor: 1, attackIntervalMs: 2400, gold: [0, 2],
    loot: [{ itemId: 'rat_tail', min: 1, max: 1, chance: 0.6 }, { itemId: 'bone', min: 1, max: 1, chance: 0.3 }],
  },
  cow: {
    name: 'Cow', description: 'It did nothing to deserve this.', tier: 1, hp: 10,
    attack: 1, armor: 2, attackIntervalMs: 3000, gold: [0, 0],
    loot: [{ itemId: 'cowhide', min: 1, max: 1, chance: 1 }, { itemId: 'bone', min: 1, max: 2, chance: 0.5 }],
  },
  goblin: {
    name: 'Goblin', description: 'Small, loud, armed with something sharp.', tier: 1, hp: 12,
    attack: 3, armor: 2, attackIntervalMs: 2400, gold: [1, 8],
    loot: [{ itemId: 'goblin_ear', min: 1, max: 1, chance: 0.3 }, { itemId: 'bronze_dagger', min: 1, max: 1, chance: 0.03 }],
  },
  wolf: {
    name: 'Grey Wolf', description: 'Hunts in the dark between the willows.', tier: 2, hp: 26,
    attack: 8, armor: 5, attackIntervalMs: 2000, gold: [0, 0],
    loot: [{ itemId: 'wolf_pelt', min: 1, max: 1, chance: 0.6 }, { itemId: 'bone', min: 1, max: 2, chance: 0.4 }],
  },
  bandit: {
    name: 'Bandit', description: 'Wants your gold. Has some of their own.', tier: 2, hp: 35,
    attack: 9, armor: 7, attackIntervalMs: 2400, gold: [10, 40],
    loot: [{ itemId: 'bronze_sword', min: 1, max: 1, chance: 0.1 }, { itemId: 'iron_dagger', min: 1, max: 1, chance: 0.05 }, { itemId: 'shrimp', min: 1, max: 2, chance: 0.4 }],
  },
  cave_spider: {
    name: 'Cave Spider', description: 'Too many legs, all of them fast.', tier: 2, hp: 22,
    attack: 7, armor: 4, attackIntervalMs: 1800, gold: [0, 4],
    loot: [{ itemId: 'iron_ore', min: 1, max: 1, chance: 0.15 }],
  },
  skeleton: {
    name: 'Skeleton Miner', description: 'Still swinging a pick, centuries on.', tier: 3, hp: 50,
    attack: 14, armor: 12, attackIntervalMs: 2600, gold: [5, 20],
    loot: [{ itemId: 'bone', min: 1, max: 3, chance: 1 }, { itemId: 'coal', min: 1, max: 2, chance: 0.3 }, { itemId: 'iron_helmet', min: 1, max: 1, chance: 0.02 }],
  },
  bear: {
    name: 'Fen Bear', description: 'Slow to anger, and then not slow at all.', tier: 3, hp: 65,
    attack: 13, armor: 10, attackIntervalMs: 3000, gold: [0, 0],
    loot: [{ itemId: 'bear_pelt', min: 1, max: 1, chance: 0.7 }, { itemId: 'raw_salmon', min: 1, max: 2, chance: 0.4 }],
  },
  bog_lurker: {
    name: 'Bog Lurker', description: 'Mud with intent.', tier: 3, hp: 55,
    attack: 15, armor: 14, attackIntervalMs: 2800, gold: [8, 25],
    loot: [{ itemId: 'lavender', min: 1, max: 2, chance: 0.5 }, { itemId: 'steel_dagger', min: 1, max: 1, chance: 0.03 }],
  },
  troll: {
    name: 'Mountain Troll', description: 'Regrets nothing. Remembers less.', tier: 4, hp: 130,
    attack: 22, armor: 18, attackIntervalMs: 3200, gold: [20, 60],
    loot: [{ itemId: 'troll_hide', min: 1, max: 1, chance: 0.6 }, { itemId: 'mithril_ore', min: 1, max: 2, chance: 0.25 }],
  },
  harpy: {
    name: 'Harpy', description: 'Screams first, claws second.', tier: 4, hp: 95,
    attack: 24, armor: 20, attackIntervalMs: 2000, gold: [15, 50],
    loot: [{ itemId: 'bloodroot', min: 1, max: 2, chance: 0.5 }, { itemId: 'mithril_dagger', min: 1, max: 1, chance: 0.03 }],
  },
  wyvern: {
    name: 'Ash Wyvern', description: 'Half dragon, all appetite.', tier: 5, hp: 230,
    attack: 32, armor: 28, attackIntervalMs: 2600, gold: [40, 120],
    loot: [{ itemId: 'wyvern_scale', min: 1, max: 1, chance: 0.6 }, { itemId: 'adamant_ore', min: 1, max: 2, chance: 0.25 }],
  },
  cultist: {
    name: 'Ash Cultist', description: 'Chants in a language that hurts to hear.', tier: 5, hp: 180,
    attack: 34, armor: 30, attackIntervalMs: 2200, gold: [60, 150],
    loot: [{ itemId: 'moonflower', min: 1, max: 2, chance: 0.5 }, { itemId: 'adamant_sword', min: 1, max: 1, chance: 0.03 }],
  },
  drake: {
    name: 'Reach Drake', description: 'Its breath melts rune.', tier: 6, hp: 400,
    attack: 45, armor: 40, attackIntervalMs: 3000, gold: [100, 300],
    loot: [{ itemId: 'dragon_scale', min: 1, max: 1, chance: 0.6 }, { itemId: 'rune_ore', min: 1, max: 2, chance: 0.25 }],
  },
  lich: {
    name: 'Lich of the Reach', description: 'Was a king. Is a problem.', tier: 6, hp: 350,
    attack: 48, armor: 42, attackIntervalMs: 2400, gold: [150, 400],
    loot: [{ itemId: 'dragonleaf', min: 1, max: 2, chance: 0.5 }, { itemId: 'rune_sword', min: 1, max: 1, chance: 0.03 }, { itemId: 'bone', min: 3, max: 6, chance: 1 }],
  },
});
