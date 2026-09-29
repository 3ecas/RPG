import type { SkillDef } from '@/types/content';
import { tableDefiner } from './define';

const defineSkills = tableDefiner<SkillDef>();

/** Every skill has its own six-tier progression. Tier gates what it can use. */
export const SKILLS = defineSkills({
  mining: { name: 'Mining', verb: 'Mining', group: 'gathering', description: 'Ore and coal from rocks. Copper first, rune last.' },
  woodcutting: { name: 'Woodcutting', verb: 'Chopping', group: 'gathering', description: 'Logs from trees, oak to elder.' },
  fishing: { name: 'Fishing', verb: 'Fishing', group: 'gathering', description: 'Raw fish from the water, shrimp to swordfish.' },
  farming: { name: 'Farming', verb: 'Harvesting', group: 'gathering', description: 'Crops from fields, for the kitchen.' },
  harvesting: { name: 'Harvesting', verb: 'Picking', group: 'gathering', description: 'Herbs from the wild. Alchemists pay well.' },
  blacksmithing: { name: 'Blacksmithing', verb: 'Smithing', group: 'production', description: 'Smelt bars in a furnace, forge metal weapons and armor at an anvil.' },
  woodworking: { name: 'Woodworking', verb: 'Carving', group: 'production', description: 'Shields and handles from logs.' },
  leatherworking: { name: 'Leatherworking', verb: 'Tanning', group: 'production', description: 'Hides into light armor.' },
  cooking: { name: 'Cooking', verb: 'Cooking', group: 'production', description: 'Raw food into meals that heal.' },
  swords: { name: 'Swords', verb: 'Fighting', group: 'combat', description: 'Balanced blades. Trained by fighting with a sword.' },
  axes: { name: 'Axes', verb: 'Fighting', group: 'combat', description: 'Slow and brutal. Trained by fighting with an axe.' },
  daggers: { name: 'Daggers', verb: 'Fighting', group: 'combat', description: 'Fast and precise. Trained by fighting with a dagger.' },
  shields: { name: 'Shields', verb: 'Blocking', group: 'combat', description: 'Trained by taking attacks with a shield equipped.' },
  armor: { name: 'Armor', verb: 'Enduring', group: 'combat', description: 'Trained by taking attacks. Each tier hardens you.' },
  vitality: { name: 'Vitality', verb: 'Surviving', group: 'combat', description: 'Trained by dealing damage. Each tier adds hit points.' },
});
