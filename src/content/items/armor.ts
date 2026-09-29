import type { ItemDef } from '@/types/content';
import { tableDefiner } from '../define';

const defineItems = tableDefiner<ItemDef>();

export const ARMOR = defineItems({
  leather_body: {
    name: 'Leather Body', description: 'Stitched cowhide. Light and quiet.', category: 'armor', value: 25,
    equip: { slot: 'body', stats: { defence: 3 } },
  },
  leather_boots: {
    name: 'Leather Boots', description: 'Keeps the mud out.', category: 'armor', value: 10,
    equip: { slot: 'feet', stats: { defence: 1 } },
  },
  wooden_shield: {
    name: 'Wooden Shield', description: 'Oak planks and a strap.', category: 'armor', value: 12,
    equip: { slot: 'shield', stats: { defence: 3 } },
  },
  bronze_helmet: {
    name: 'Bronze Helmet', description: 'Dents easily, but so does your head.', category: 'armor', value: 20,
    equip: { slot: 'head', stats: { defence: 3 }, requirements: [{ skill: 'defence', level: 1 }] },
  },
  bronze_shield: {
    name: 'Bronze Shield', description: 'A round bronze shield.', category: 'armor', value: 35,
    equip: { slot: 'shield', stats: { defence: 5 }, requirements: [{ skill: 'defence', level: 1 }] },
  },
  bronze_platelegs: {
    name: 'Bronze Platelegs', description: 'Heavy on the hips.', category: 'armor', value: 35,
    equip: { slot: 'legs', stats: { defence: 6 }, requirements: [{ skill: 'defence', level: 1 }] },
  },
  bronze_platebody: {
    name: 'Bronze Platebody', description: 'Covers everything that matters.', category: 'armor', value: 50,
    equip: { slot: 'body', stats: { defence: 9 }, requirements: [{ skill: 'defence', level: 1 }] },
  },
  iron_helmet: {
    name: 'Iron Helmet', description: 'Solid iron, padded inside.', category: 'armor', value: 55,
    equip: { slot: 'head', stats: { defence: 6 }, requirements: [{ skill: 'defence', level: 10 }] },
  },
  iron_shield: {
    name: 'Iron Shield', description: 'Takes a beating.', category: 'armor', value: 90,
    equip: { slot: 'shield', stats: { defence: 9 }, requirements: [{ skill: 'defence', level: 10 }] },
  },
  iron_platelegs: {
    name: 'Iron Platelegs', description: 'Clanks with every step.', category: 'armor', value: 90,
    equip: { slot: 'legs', stats: { defence: 11 }, requirements: [{ skill: 'defence', level: 10 }] },
  },
  iron_platebody: {
    name: 'Iron Platebody', description: 'The guard captain wears one of these.', category: 'armor', value: 130,
    equip: { slot: 'body', stats: { defence: 16 }, requirements: [{ skill: 'defence', level: 10 }] },
  },
  steel_helmet: {
    name: 'Steel Helmet', description: 'Polished to a shine.', category: 'armor', value: 150,
    equip: { slot: 'head', stats: { defence: 10 }, requirements: [{ skill: 'defence', level: 20 }] },
  },
  steel_platebody: {
    name: 'Steel Platebody', description: 'Knight-grade plate.', category: 'armor', value: 360,
    equip: { slot: 'body', stats: { defence: 26 }, requirements: [{ skill: 'defence', level: 20 }] },
  },
});
