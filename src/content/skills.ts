import type { SkillDef } from '@/types/content';
import { tableDefiner } from './define';

const defineSkills = tableDefiner<SkillDef>();

/**
 * Thirteen skills, each from level 1 to 100, each level giving something
 * (see unlocks.ts). Four gather, four make, three fight, two are the mind.
 */
export const SKILLS = defineSkills({
  lumberjack: { name: 'Lumberjack', verb: 'Chopping', group: 'gathering', description: 'Logs from trees, oak to elder. A log takes 250 ticks at level 1 and 50 at level 100; a better hatchet is quicker still.' },
  mining: { name: 'Mining', verb: 'Mining', group: 'gathering', description: 'Ore and coal from rocks, copper to rune. An ore takes 250 ticks at level 1 and 50 at level 100; a better pickaxe is quicker still.' },
  fishing: { name: 'Fishing', verb: 'Fishing', group: 'gathering', description: 'Raw fish from the water, shrimp to swordfish. A catch takes 250 ticks at level 1 and 50 at level 100.' },
  harvesting: { name: 'Harvesting', verb: 'Harvesting', group: 'gathering', description: 'Crops from fields and herbs from the wild. A pick takes 250 ticks at level 1 and 50 at level 100.' },
  smithing: { name: 'Smithing', verb: 'Smithing', group: 'production', description: 'Smelt bars in a furnace, forge metal weapons and armor at an anvil.' },
  crafting: { name: 'Crafting', verb: 'Crafting', group: 'production', description: 'Shields, bows and staffs from logs; light armor from hides.' },
  cooking: { name: 'Cooking', verb: 'Cooking', group: 'production', description: 'Raw food into meals that heal.' },
  hand_weapons: { name: 'Hand Weapons', verb: 'Fighting', group: 'combat', description: 'Swords, axes and daggers. Every level adds to what they deal.' },
  bows: { name: 'Bows', verb: 'Shooting', group: 'combat', description: 'Bows and arrows. Every level adds to what they deal.' },
  vitality: { name: 'Vitality', verb: 'Enduring', group: 'combat', description: 'Max hit points and how fast they come back. Heavier armor needs more of it.' },
  spirit: { name: 'Spirit', verb: 'Meditating', group: 'magic', description: 'Max mana and how fast it comes back.' },
  magic: { name: 'Magic', verb: 'Casting', group: 'magic', description: 'Spell power, with staffs and tomes. Every level adds to it.' },
  witchcraft: { name: 'Witchcraft', verb: 'Brewing', group: 'magic', description: 'Potions and charms from herbs. Every level brews stronger.' },
});
