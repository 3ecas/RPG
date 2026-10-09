import type { ItemDef } from '@/types/content';
import { tableDefiner, tieredDefiner } from '../define';
import { LEATHERS, METALS, scaled, titleCase, WOODS } from '../tiers';

const defineItems = tableDefiner<ItemDef>();
const defineTiered = tieredDefiner<ItemDef>();

/** Metal armor (smithing) adds armor; heavier tiers need Vitality at the tier's level. */
export const HELMETS = defineTiered(METALS, '', '_helmet', (metal, tier) => ({
  name: `${titleCase(metal)} Helmet`, description: 'Protects the part you think with.', category: 'armor', group: 'armor', tier, value: scaled(20, tier),
  equip: { kind: 'head', stats: { armor: 2 * tier + 1 }, requirements: [{ skill: 'vitality', tier }] },
}));

export const PLATEBODIES = defineTiered(METALS, '', '_platebody', (metal, tier) => ({
  name: `${titleCase(metal)} Platebody`, description: 'Covers everything that matters.', category: 'armor', group: 'armor', tier, value: scaled(50, tier),
  equip: { kind: 'body', stats: { armor: 5 * tier + 2, hp: tier }, requirements: [{ skill: 'vitality', tier }] },
}));

export const PLATELEGS = defineTiered(METALS, '', '_platelegs', (metal, tier) => ({
  name: `${titleCase(metal)} Platelegs`, description: 'Heavy on the hips.', category: 'armor', group: 'armor', tier, value: scaled(35, tier),
  equip: { kind: 'legs', stats: { armor: 4 * tier + 1 }, requirements: [{ skill: 'vitality', tier }] },
}));

/** Shields (crafting) count as armor, in the off hand. */
export const SHIELDS = defineTiered(WOODS, '', '_shield', (wood, tier) => ({
  name: `${titleCase(wood)} Shield`, description: `${titleCase(wood)} planks, iron rim, a strap.`, category: 'armor', group: 'shield', tier, value: scaled(12, tier),
  equip: { kind: 'shield', stats: { armor: 3 * tier + 1 }, requirements: [{ skill: 'vitality', tier }] },
}));

/** Leather armor (crafting): lighter, a little less armor, and a little attack from the fit. */
export const LEATHER_BODIES = defineTiered(LEATHERS, '', '_body', (leather, tier) => ({
  name: `${titleCase(leather)} Body`, description: 'Light and quiet.', category: 'armor', group: 'armor', tier, value: scaled(25, tier),
  equip: { kind: 'body', stats: { armor: 3 * tier, attack: tier }, requirements: [{ skill: 'vitality', tier }] },
}));

export const LEATHER_BOOTS = defineTiered(LEATHERS, '', '_boots', (leather, tier) => ({
  name: `${titleCase(leather)} Boots`, description: 'Keeps the mud out.', category: 'armor', group: 'armor', tier, value: scaled(10, tier),
  equip: { kind: 'feet', stats: { armor: tier }, requirements: [{ skill: 'vitality', tier }] },
}));

export const LEATHER_GLOVES = defineTiered(LEATHERS, '', '_gloves', (leather, tier) => ({
  name: `${titleCase(leather)} Gloves`, description: 'Grip and a little protection.', category: 'armor', group: 'armor', tier, value: scaled(15, tier),
  equip: { kind: 'hands', stats: { armor: tier, attack: 1 }, requirements: [{ skill: 'vitality', tier }] },
}));

/** Tomes for the off hand: spell power and mana, by tier; Magic at the tier's level to read them. */
const TOMES_BY_TIER = ['sparks', 'embers', 'tides', 'storms', 'stars', 'dragons'] as const;
export const TOMES = defineTiered(TOMES_BY_TIER, 'tome_of_', '', (theme, tier) => ({
  name: `Tome of ${titleCase(theme)}`, description: 'Enchanted. The pages are warm and the words move.', category: 'misc', group: 'book', tier, value: scaled(60, tier),
  equip: { kind: 'book', stats: { spellPower: 2 * tier, mana: 3 * tier }, requirements: [{ skill: 'magic', tier }] },
}));

export const ACCESSORIES = defineItems({
  copper_ring: {
    name: 'Copper Ring', description: 'Turns your finger green and your swings truer.', category: 'armor', group: 'trinket', tier: 1, value: 120,
    equip: { kind: 'trinket', stats: { attack: 2 } },
  },
  amulet_of_vigor: {
    name: 'Amulet of Vigor', description: 'Warm to the touch. Pell will not say where it came from.', category: 'armor', group: 'trinket', tier: 2, value: 450,
    equip: { kind: 'trinket', stats: { hp: 5, armor: 3 }, requirements: [{ skill: 'vitality', tier: 2 }] },
  },
});

export const ARMOR = { ...HELMETS, ...PLATEBODIES, ...PLATELEGS, ...SHIELDS, ...LEATHER_BODIES, ...LEATHER_BOOTS, ...LEATHER_GLOVES, ...TOMES, ...ACCESSORIES };
