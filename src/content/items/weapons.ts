import type { ItemDef } from '@/types/content';
import { tableDefiner, tieredDefiner } from '../define';
import { METALS, scaled, titleCase } from '../tiers';

const defineItems = tableDefiner<ItemDef>();
const defineTiered = tieredDefiner<ItemDef>();

/** Three weapon families, one per combat skill. Numbers grow with the tier. */
export const SWORDS = defineTiered(METALS, '', '_sword', (metal, tier) => ({
  name: `${titleCase(metal)} Sword`, description: 'A balanced blade.', category: 'weapon', group: 'weapon', tier, value: scaled(35, tier),
  equip: { kind: 'weapon', weaponType: 'sword', stats: { attack: 4 * tier + 1, strength: 3 * tier + 1 }, attackIntervalMs: 2400, requirements: [{ skill: 'swords', tier }] },
}));

export const AXES = defineTiered(METALS, '', '_axe', (metal, tier) => ({
  name: `${titleCase(metal)} Axe`, description: 'Slow, heavy, and final.', category: 'weapon', group: 'weapon', tier, value: scaled(45, tier),
  equip: { kind: 'weapon', weaponType: 'axe', stats: { attack: 3 * tier, strength: 5 * tier + 1 }, attackIntervalMs: 3000, requirements: [{ skill: 'axes', tier }] },
}));

export const DAGGERS = defineTiered(METALS, '', '_dagger', (metal, tier) => ({
  name: `${titleCase(metal)} Dagger`, description: 'Quick and cheap.', category: 'weapon', group: 'weapon', tier, value: scaled(20, tier),
  equip: { kind: 'weapon', weaponType: 'dagger', stats: { attack: 5 * tier, strength: 2 * tier }, attackIntervalMs: 2000, requirements: [{ skill: 'daggers', tier }] },
}));

export const UNIQUE_WEAPONS = defineItems({
  rusty_dagger: {
    name: 'Rusty Dagger', description: 'It was in the drawer. Better than fists.', category: 'weapon', group: 'weapon', tier: 1, value: 1,
    equip: { kind: 'weapon', weaponType: 'dagger', stats: { attack: 1, strength: 1 }, attackIntervalMs: 2400 },
  },
});

export const WEAPONS = { ...SWORDS, ...AXES, ...DAGGERS, ...UNIQUE_WEAPONS };
