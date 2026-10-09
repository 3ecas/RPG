import type { ItemDef } from '@/types/content';
import { tieredDefiner } from '../define';
import { METALS, scaled, titleCase } from '../tiers';

const defineTiered = tieredDefiner<ItemDef>();

/** Gathering tools, one per metal tier. You need one in the bag to gather with the skill; the tier sets the pace. */
export const HATCHETS = defineTiered(METALS, '', '_hatchet', (metal, tier) => ({
  name: `${titleCase(metal)} Hatchet`, description: `A ${metal} hatchet for felling trees.`, category: 'misc', group: 'tool', tier, value: scaled(16, tier), tool: { skill: 'woodcutting', tier },
}));

export const PICKAXES = defineTiered(METALS, '', '_pickaxe', (metal, tier) => ({
  name: `${titleCase(metal)} Pickaxe`, description: `A ${metal} pickaxe for breaking rock.`, category: 'misc', group: 'tool', tier, value: scaled(18, tier), tool: { skill: 'mining', tier },
}));

export const TOOLS = { ...HATCHETS, ...PICKAXES };
