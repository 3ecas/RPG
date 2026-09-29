import type { ItemDef } from '@/types/content';
import { tableDefiner } from '../define';

const defineItems = tableDefiner<ItemDef>();

export const WEAPONS = defineItems({
  rusty_dagger: {
    name: 'Rusty Dagger', description: 'It was in the drawer. Better than fists.', category: 'weapon', value: 1,
    equip: { slot: 'weapon', stats: { attack: 1, strength: 1 }, attackIntervalMs: 2400 },
  },
  bronze_dagger: {
    name: 'Bronze Dagger', description: 'Quick and cheap.', category: 'weapon', value: 20,
    equip: { slot: 'weapon', stats: { attack: 3, strength: 2 }, attackIntervalMs: 2000, requirements: [{ skill: 'attack', level: 1 }] },
  },
  bronze_sword: {
    name: 'Bronze Sword', description: 'A proper blade.', category: 'weapon', value: 35,
    equip: { slot: 'weapon', stats: { attack: 5, strength: 4 }, attackIntervalMs: 2400, requirements: [{ skill: 'attack', level: 1 }] },
  },
  iron_dagger: {
    name: 'Iron Dagger', description: 'Holds an edge.', category: 'weapon', value: 60,
    equip: { slot: 'weapon', stats: { attack: 7, strength: 5 }, attackIntervalMs: 2000, requirements: [{ skill: 'attack', level: 10 }] },
  },
  iron_sword: {
    name: 'Iron Sword', description: 'Standard issue for the town guard.', category: 'weapon', value: 90,
    equip: { slot: 'weapon', stats: { attack: 11, strength: 9 }, attackIntervalMs: 2400, requirements: [{ skill: 'attack', level: 10 }] },
  },
  steel_sword: {
    name: 'Steel Sword', description: 'Bright, balanced, expensive.', category: 'weapon', value: 220,
    equip: { slot: 'weapon', stats: { attack: 18, strength: 15 }, attackIntervalMs: 2400, requirements: [{ skill: 'attack', level: 20 }] },
  },
});
