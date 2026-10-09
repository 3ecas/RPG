import type { ItemDef } from '@/types/content';
import { tieredDefiner } from '../define';
import { scaled, titleCase, TOOL_MATERIALS } from '../tiers';

const defineTiered = tieredDefiner<ItemDef>();

/** Gathering tools, one per tier: stone first (Rowan and Greta in the village give them away), then the metals. One in the bag or in hand lets you gather with the skill; the tier sets the pace. Wielded, they are poor weapons. */
export const HATCHETS = defineTiered(TOOL_MATERIALS, '', '_hatchet', (material, tier) => ({
  name: `${titleCase(material)} Hatchet`, description: `A ${material} hatchet for felling trees.`, category: 'misc', group: 'tool', tier, value: scaled(16, tier), tool: { skill: 'lumberjack', tier },
  equip: { kind: 'weapon', weaponType: 'axe', stats: { attack: 2 * tier }, attackIntervalMs: 3000 },
}));

export const PICKAXES = defineTiered(TOOL_MATERIALS, '', '_pickaxe', (material, tier) => ({
  name: `${titleCase(material)} Pickaxe`, description: `A ${material} pickaxe for breaking rock.`, category: 'misc', group: 'tool', tier, value: scaled(18, tier), tool: { skill: 'mining', tier },
  equip: { kind: 'weapon', weaponType: 'axe', stats: { attack: 2 * tier }, attackIntervalMs: 3000 },
}));

export const TOOLS = { ...HATCHETS, ...PICKAXES };
