import type { GatherNodeDef } from '@/types/content';
import { tableDefiner, tieredDefiner } from './define';
import { CROPS, FISH, HERBS, scaled, titleCase, WOODS } from './tiers';

const defineNodes = tableDefiner<GatherNodeDef>();
const defineTiered = tieredDefiner<GatherNodeDef>();

const duration = (tier: number) => 3000 + 500 * (tier - 1);
const xp = (tier: 1 | 2 | 3 | 4 | 5 | 6) => scaled(10, tier, 1.6);
/** Rocks, fields and patches empty on every success; a tree falls after a few logs; fishing spots never run out. */
const rockDeplete = (tier: number) => ({ chance: 1, respawnMs: 4000 + 2000 * (tier - 1) });
const treeDeplete = (tier: number) => ({ chance: 1 / 8, respawnMs: 8000 + 2000 * (tier - 1) });
const cropDeplete = (tier: number) => ({ chance: 1, respawnMs: 10_000 + 2000 * (tier - 1) });

export const ROCKS = defineNodes({
  rubble: { name: 'Loose Stones', description: 'Stones lying about the outcrop. A pickaxe breaks them loose; two of them ring a campfire.', skill: 'mining', tier: 1, itemId: 'stone', durationMs: 1500, xp: 4, deplete: { chance: 1, respawnMs: 3000 } },
  copper_rock: { name: 'Copper Rock', description: 'Veins of orange in grey stone.', skill: 'mining', tier: 1, itemId: 'copper_ore', durationMs: duration(1), xp: xp(1), deplete: rockDeplete(1) },
  tin_rock: { name: 'Tin Rock', description: 'Pale streaks, easy to chip.', skill: 'mining', tier: 1, itemId: 'tin_ore', durationMs: duration(1), xp: xp(1), deplete: rockDeplete(1) },
  iron_rock: { name: 'Iron Rock', description: 'Rust-red and stubborn.', skill: 'mining', tier: 2, itemId: 'iron_ore', durationMs: duration(2), xp: xp(2), deplete: rockDeplete(2) },
  coal_seam: { name: 'Coal Seam', description: 'Black dust everywhere.', skill: 'mining', tier: 3, itemId: 'coal', durationMs: duration(3), xp: xp(3), deplete: rockDeplete(3) },
  mithril_rock: { name: 'Mithril Rock', description: 'Blue glints deep in the stone.', skill: 'mining', tier: 4, itemId: 'mithril_ore', durationMs: duration(4), xp: xp(4), deplete: rockDeplete(4) },
  adamant_rock: { name: 'Adamant Rock', description: 'Green and merciless on picks.', skill: 'mining', tier: 5, itemId: 'adamant_ore', durationMs: duration(5), xp: xp(5), deplete: rockDeplete(5) },
  rune_rock: { name: 'Rune Rock', description: 'The stone hums.', skill: 'mining', tier: 6, itemId: 'rune_ore', durationMs: duration(6), xp: xp(6), deplete: rockDeplete(6) },
});

export const TREES = defineTiered(WOODS, '', '_tree', (wood, tier) => ({
  name: `${titleCase(wood)} Tree`, description: `Tier ${tier} timber.`, skill: 'lumberjack', tier, itemId: `${wood}_log`, durationMs: duration(tier), xp: xp(tier), deplete: treeDeplete(tier),
}));

export const FISHING_SPOTS = defineTiered(FISH, '', '_spot', (fish, tier) => ({
  name: `${titleCase(fish)} Waters`, description: `Where the ${fish} bite.`, skill: 'fishing', tier, itemId: `raw_${fish}`, durationMs: duration(tier), xp: xp(tier),
}));

export const FIELDS = defineTiered(CROPS, '', '_field', (crop, tier) => ({
  name: `${titleCase(crop)} Field`, description: `Rows of ${crop}, ready to pick.`, skill: 'harvesting', tier, itemId: crop, durationMs: duration(tier), xp: xp(tier), deplete: cropDeplete(tier),
}));

export const HERB_PATCHES = defineTiered(HERBS, '', '_patch', (herb, tier) => ({
  name: `${titleCase(herb)} Patch`, description: `Wild ${herb}.`, skill: 'harvesting', tier, itemId: herb, durationMs: duration(tier), xp: xp(tier), deplete: cropDeplete(tier),
}));

export const NODES = { ...ROCKS, ...TREES, ...FISHING_SPOTS, ...FIELDS, ...HERB_PATCHES };
