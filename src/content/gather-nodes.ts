import type { GatherNodeDef } from '@/types/content';
import { tableDefiner } from './define';

const defineNodes = tableDefiner<GatherNodeDef>();

export const NODES = defineNodes({
  copper_rock: { name: 'Copper Rock', description: 'Veins of orange in grey stone.', skill: 'mining', level: 1, itemId: 'copper_ore', durationMs: 3000, xp: 17.5 },
  tin_rock: { name: 'Tin Rock', description: 'Pale streaks, easy to chip.', skill: 'mining', level: 1, itemId: 'tin_ore', durationMs: 3000, xp: 17.5 },
  iron_rock: { name: 'Iron Rock', description: 'Rust-red and stubborn.', skill: 'mining', level: 15, itemId: 'iron_ore', durationMs: 4000, xp: 35 },
  coal_rock: { name: 'Coal Seam', description: 'Black dust everywhere.', skill: 'mining', level: 30, itemId: 'coal', durationMs: 5000, xp: 50 },
  oak_tree: { name: 'Oak Tree', description: 'Broad and old.', skill: 'woodcutting', level: 1, itemId: 'oak_log', durationMs: 3000, xp: 25 },
  willow_tree: { name: 'Willow Tree', description: 'Leans over the water.', skill: 'woodcutting', level: 15, itemId: 'willow_log', durationMs: 3500, xp: 45 },
  shrimp_spot: { name: 'Shrimp Shallows', description: 'Ankle-deep and teeming.', skill: 'fishing', level: 1, itemId: 'raw_shrimp', durationMs: 3000, xp: 10 },
  trout_spot: { name: 'Trout Pool', description: 'Fast, cold water.', skill: 'fishing', level: 15, itemId: 'raw_trout', durationMs: 4000, xp: 50 },
});
