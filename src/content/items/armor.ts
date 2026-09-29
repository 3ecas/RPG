import type { ItemDef } from '@/types/content';
import { tableDefiner, tieredDefiner } from '../define';
import { LEATHERS, METALS, scaled, titleCase, WOODS } from '../tiers';

const defineItems = tableDefiner<ItemDef>();
const defineTiered = tieredDefiner<ItemDef>();

/** Metal armor (blacksmithing) needs the Armor skill at the item's tier. */
export const HELMETS = defineTiered(METALS, '', '_helmet', (metal, tier) => ({
  name: `${titleCase(metal)} Helmet`, description: 'Protects the part you think with.', category: 'armor', tier, value: scaled(20, tier),
  equip: { slot: 'head', stats: { defence: 2 * tier + 1 }, requirements: [{ skill: 'armor', tier }] },
}));

export const PLATEBODIES = defineTiered(METALS, '', '_platebody', (metal, tier) => ({
  name: `${titleCase(metal)} Platebody`, description: 'Covers everything that matters.', category: 'armor', tier, value: scaled(50, tier),
  equip: { slot: 'body', stats: { defence: 5 * tier + 2 }, requirements: [{ skill: 'armor', tier }] },
}));

export const PLATELEGS = defineTiered(METALS, '', '_platelegs', (metal, tier) => ({
  name: `${titleCase(metal)} Platelegs`, description: 'Heavy on the hips.', category: 'armor', tier, value: scaled(35, tier),
  equip: { slot: 'legs', stats: { defence: 4 * tier + 1 }, requirements: [{ skill: 'armor', tier }] },
}));

/** Shields (woodworking) need the Shields skill. */
export const SHIELDS = defineTiered(WOODS, '', '_shield', (wood, tier) => ({
  name: `${titleCase(wood)} Shield`, description: `${titleCase(wood)} planks, iron rim, a strap.`, category: 'armor', tier, value: scaled(12, tier),
  equip: { slot: 'shield', stats: { defence: 3 * tier + 1 }, requirements: [{ skill: 'shields', tier }] },
}));

/** Leather armor (leatherworking) also needs the Armor skill; it trades defence for a little accuracy. */
export const LEATHER_BODIES = defineTiered(LEATHERS, '', '_body', (leather, tier) => ({
  name: `${titleCase(leather)} Body`, description: 'Light and quiet.', category: 'armor', tier, value: scaled(25, tier),
  equip: { slot: 'body', stats: { defence: 3 * tier, attack: tier }, requirements: [{ skill: 'armor', tier }] },
}));

export const LEATHER_BOOTS = defineTiered(LEATHERS, '', '_boots', (leather, tier) => ({
  name: `${titleCase(leather)} Boots`, description: 'Keeps the mud out.', category: 'armor', tier, value: scaled(10, tier),
  equip: { slot: 'feet', stats: { defence: tier }, requirements: [{ skill: 'armor', tier }] },
}));

export const LEATHER_GLOVES = defineTiered(LEATHERS, '', '_gloves', (leather, tier) => ({
  name: `${titleCase(leather)} Gloves`, description: 'Grip and a little protection.', category: 'armor', tier, value: scaled(15, tier),
  equip: { slot: 'hands', stats: { defence: tier, attack: 1 }, requirements: [{ skill: 'armor', tier }] },
}));

export const ACCESSORIES = defineItems({
  copper_ring: {
    name: 'Copper Ring', description: 'Turns your finger green and your swings truer.', category: 'armor', tier: 1, value: 120,
    equip: { slot: 'ring', stats: { attack: 2, strength: 1 } },
  },
  amulet_of_vigor: {
    name: 'Amulet of Vigor', description: 'Warm to the touch. Pell will not say where it came from.', category: 'armor', tier: 2, value: 450,
    equip: { slot: 'amulet', stats: { strength: 3, defence: 3 }, requirements: [{ skill: 'vitality', tier: 2 }] },
  },
});

export const ARMOR = { ...HELMETS, ...PLATEBODIES, ...PLATELEGS, ...SHIELDS, ...LEATHER_BODIES, ...LEATHER_BOOTS, ...LEATHER_GLOVES, ...ACCESSORIES };
