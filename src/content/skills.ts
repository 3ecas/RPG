import type { SkillDef } from '@/types/content';
import { tableDefiner } from './define';

const defineSkills = tableDefiner<SkillDef>();

export const SKILLS = defineSkills({
  mining: { name: 'Mining', verb: 'Mining', group: 'gathering', description: 'Pull ore and coal out of rocks.' },
  woodcutting: { name: 'Woodcutting', verb: 'Chopping', group: 'gathering', description: 'Chop trees for logs.' },
  fishing: { name: 'Fishing', verb: 'Fishing', group: 'gathering', description: 'Catch raw fish from the water.' },
  smithing: { name: 'Smithing', verb: 'Smithing', group: 'production', description: 'Smelt bars in a furnace and forge them at an anvil.' },
  crafting: { name: 'Crafting', verb: 'Crafting', group: 'production', description: 'Work leather and wood at a workbench.' },
  cooking: { name: 'Cooking', verb: 'Cooking', group: 'production', description: 'Turn raw food into meals that heal.' },
  attack: { name: 'Attack', verb: 'Fighting', group: 'combat', description: 'Accuracy with weapons.' },
  strength: { name: 'Strength', verb: 'Fighting', group: 'combat', description: 'How hard you hit.' },
  defence: { name: 'Defence', verb: 'Fighting', group: 'combat', description: 'How often enemies miss you.' },
  hitpoints: { name: 'Hitpoints', verb: 'Surviving', group: 'combat', description: 'How much punishment you can take.' },
});
