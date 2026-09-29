import type { ItemDef } from '@/types/content';
import { tableDefiner, tieredDefiner } from '../define';
import { CROPS, FISH, HERBS, HIDES, METALS, scaled, titleCase, WOODS } from '../tiers';

const defineItems = tableDefiner<ItemDef>();
const defineTiered = tieredDefiner<ItemDef>();

/** Ores do not follow the metal ladder one-to-one (bronze needs two, steel needs coal), so they are listed by hand. */
export const ORES = defineItems({
  copper_ore: { name: 'Copper Ore', description: 'Dull orange rock. Half of a bronze bar.', category: 'material', group: 'ore', tier: 1, value: 4 },
  tin_ore: { name: 'Tin Ore', description: 'Silvery rock. The other half of a bronze bar.', category: 'material', group: 'ore', tier: 1, value: 4 },
  iron_ore: { name: 'Iron Ore', description: 'Heavy and rust-streaked.', category: 'material', group: 'ore', tier: 2, value: 9 },
  coal: { name: 'Coal', description: 'Burns hot enough for steel and everything after it.', category: 'material', group: 'ore', tier: 3, value: 14 },
  mithril_ore: { name: 'Mithril Ore', description: 'Blue-veined and lighter than it looks.', category: 'material', group: 'ore', tier: 4, value: 42 },
  adamant_ore: { name: 'Adamant Ore', description: 'Green, dense, and unforgiving on picks.', category: 'material', group: 'ore', tier: 5, value: 93 },
  rune_ore: { name: 'Rune Ore', description: 'Hums faintly. Miners swear it watches them.', category: 'material', group: 'ore', tier: 6, value: 205 },
});

export const BARS = defineTiered(METALS, '', '_bar', (metal, tier) => ({
  name: `${titleCase(metal)} Bar`, description: `A bar of ${metal}, ready for the anvil.`, category: 'material', group: 'bar', tier, value: scaled(15, tier),
}));

export const LOGS = defineTiered(WOODS, '', '_log', (wood, tier) => ({
  name: `${titleCase(wood)} Log`, description: `${titleCase(wood)} wood, tier ${tier}.`, category: 'material', group: 'log', tier, value: scaled(5, tier),
}));

export const RAW_FISH = defineTiered(FISH, 'raw_', '', (fish, tier) => ({
  name: `Raw ${titleCase(fish)}`, description: 'Needs cooking.', category: 'material', group: 'fish', tier, value: scaled(3, tier),
}));

export const CROP_ITEMS = defineTiered(CROPS, '', '', (crop, tier) => ({
  name: titleCase(crop), description: 'Fresh from the field. Cook it.', category: 'material', group: 'crop', tier, value: scaled(3, tier),
}));

export const HERB_ITEMS = defineTiered(HERBS, '', '', (herb, tier) => ({
  name: titleCase(herb), description: 'A wild herb. Alchemists and the market want it.', category: 'material', group: 'herb', tier, value: scaled(6, tier),
}));

export const HIDE_ITEMS = defineTiered(HIDES, '', '', (hide, tier) => ({
  name: titleCase(hide), description: 'Can be worked into light armor at a tannery.', category: 'material', group: 'hide', tier, value: scaled(8, tier),
}));

export const MISC = defineItems({
  bone: { name: 'Bone', description: 'Somebody used to need this.', category: 'misc', group: 'misc', tier: 1, value: 2 },
  rat_tail: { name: 'Rat Tail', description: 'Proof of a dead rat.', category: 'misc', group: 'misc', tier: 1, value: 1 },
  goblin_ear: { name: 'Goblin Ear', description: 'The guard captain pays for these.', category: 'misc', group: 'misc', tier: 1, value: 2 },
});

export const MATERIALS = { ...ORES, ...BARS, ...LOGS, ...RAW_FISH, ...CROP_ITEMS, ...HERB_ITEMS, ...HIDE_ITEMS, ...MISC };
