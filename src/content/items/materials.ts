import type { ItemDef } from '@/types/content';
import { tableDefiner } from '../define';

const defineItems = tableDefiner<ItemDef>();

export const MATERIALS = defineItems({
  copper_ore: { name: 'Copper Ore', description: 'Dull orange rock. Half of a bronze bar.', category: 'material', value: 4 },
  tin_ore: { name: 'Tin Ore', description: 'Silvery rock. The other half of a bronze bar.', category: 'material', value: 4 },
  iron_ore: { name: 'Iron Ore', description: 'Heavy and rust-streaked.', category: 'material', value: 12 },
  coal: { name: 'Coal', description: 'Burns hot enough to make steel.', category: 'material', value: 20 },
  bronze_bar: { name: 'Bronze Bar', description: 'Smelted from copper and tin.', category: 'material', value: 15 },
  iron_bar: { name: 'Iron Bar', description: 'A solid bar of iron.', category: 'material', value: 30 },
  steel_bar: { name: 'Steel Bar', description: 'Iron forged with coal. Rings when struck.', category: 'material', value: 60 },
  oak_log: { name: 'Oak Log', description: 'Sturdy wood.', category: 'material', value: 5 },
  willow_log: { name: 'Willow Log', description: 'Light, flexible wood.', category: 'material', value: 12 },
  raw_shrimp: { name: 'Raw Shrimp', description: 'Needs cooking.', category: 'material', value: 3 },
  raw_trout: { name: 'Raw Trout', description: 'A fat river trout. Needs cooking.', category: 'material', value: 10 },
  cowhide: { name: 'Cowhide', description: 'Can be worked into leather armor.', category: 'material', value: 8 },
  wolf_pelt: { name: 'Wolf Pelt', description: 'Thick grey fur.', category: 'material', value: 25 },
  bone: { name: 'Bone', description: 'Somebody used to need this.', category: 'misc', value: 2 },
  rat_tail: { name: 'Rat Tail', description: 'Proof of a dead rat.', category: 'misc', value: 1 },
  goblin_ear: { name: 'Goblin Ear', description: 'The guard captain pays for these.', category: 'misc', value: 2 },
});
