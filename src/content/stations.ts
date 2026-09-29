import type { StationDef } from '@/types/content';
import { tableDefiner } from './define';

const defineStations = tableDefiner<StationDef>();

/** Crafting stations. A recipe belongs to exactly one; the crafting panel is one instance per station. */
export const STATIONS = defineStations({
  furnace: { name: 'Furnace', verb: 'Smelting', description: 'Ore goes in, bars come out.' },
  anvil: { name: 'Anvil', verb: 'Forging', description: 'Hammer bars into weapons and armor.' },
  sawbench: { name: 'Sawbench', verb: 'Carving', description: 'Logs into shields.' },
  tannery: { name: 'Tannery', verb: 'Tanning', description: 'Hides into light armor.' },
  campfire: { name: 'Campfire', verb: 'Cooking', description: 'Cook what you caught or grew.' },
});
