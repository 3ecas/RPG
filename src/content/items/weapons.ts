import type { ItemDef } from '@/types/content';
import { tableDefiner, tieredDefiner } from '../define';
import { METALS, scaled, titleCase, WOODS } from '../tiers';

const defineItems = tableDefiner<ItemDef>();
const defineTiered = tieredDefiner<ItemDef>();

/** Hand weapons, one family per metal tier; the Hand Weapons skill scales what they deal. */
export const SWORDS = defineTiered(METALS, '', '_sword', (metal, tier) => ({
  name: `${titleCase(metal)} Sword`, description: 'A balanced blade.', category: 'weapon', group: 'weapon', tier, value: scaled(35, tier),
  equip: { kind: 'weapon', weaponType: 'sword', stats: { attack: 4 * tier + 1 }, attackIntervalMs: 2400, requirements: [{ skill: 'hand_weapons', tier }] },
}));

export const AXES = defineTiered(METALS, '', '_axe', (metal, tier) => ({
  name: `${titleCase(metal)} Axe`, description: 'Slow, heavy, and final.', category: 'weapon', group: 'weapon', tier, value: scaled(45, tier),
  equip: { kind: 'weapon', weaponType: 'axe', stats: { attack: 6 * tier + 1 }, attackIntervalMs: 3000, requirements: [{ skill: 'hand_weapons', tier }] },
}));

export const DAGGERS = defineTiered(METALS, '', '_dagger', (metal, tier) => ({
  name: `${titleCase(metal)} Dagger`, description: 'Quick and cheap.', category: 'weapon', group: 'weapon', tier, value: scaled(20, tier),
  equip: { kind: 'weapon', weaponType: 'dagger', stats: { attack: 3 * tier }, attackIntervalMs: 2000, requirements: [{ skill: 'hand_weapons', tier }] },
}));

/** Bows, by wood; the Bows skill scales them. */
export const BOWS = defineTiered(WOODS, '', '_bow', (wood, tier) => ({
  name: `${titleCase(wood)} Bow`, description: `${titleCase(wood)} and a good string.`, category: 'weapon', group: 'weapon', tier, value: scaled(30, tier),
  equip: { kind: 'weapon', weaponType: 'bow', stats: { attack: 4 * tier }, attackIntervalMs: 2600, requirements: [{ skill: 'bows', tier }] },
}));

/** Staffs, by wood: spell power and a little mana; the Magic skill scales them. */
export const STAFFS = defineTiered(WOODS, '', '_staff', (wood, tier) => ({
  name: `${titleCase(wood)} Staff`, description: `${titleCase(wood)}, bound with a bar of the same tier. Hums a little.`, category: 'weapon', group: 'weapon', tier, value: scaled(40, tier),
  equip: { kind: 'weapon', weaponType: 'staff', stats: { attack: tier, spellPower: 4 * tier + 1, mana: 2 * tier }, attackIntervalMs: 3000, requirements: [{ skill: 'magic', tier }] },
}));

export const UNIQUE_WEAPONS = defineItems({
  rusty_dagger: {
    name: 'Rusty Dagger', description: 'It was in the drawer. Better than fists.', category: 'weapon', group: 'weapon', tier: 1, value: 1,
    equip: { kind: 'weapon', weaponType: 'dagger', stats: { attack: 1 }, attackIntervalMs: 2400 },
  },
});

export const WEAPONS = { ...SWORDS, ...AXES, ...DAGGERS, ...BOWS, ...STAFFS, ...UNIQUE_WEAPONS };
