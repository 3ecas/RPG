import type { ZoneDef } from '@/types/content';
import { tableDefiner } from './define';

const defineZones = tableDefiner<ZoneDef>();

export const ZONES = defineZones({
  greenhollow: {
    name: 'Greenhollow Village',
    description: 'A quiet village with a furnace, a pond, an oak grove and a rat problem.',
    unlock: [],
    nodes: ['oak_tree', 'shrimp_spot'],
    monsters: ['rat', 'cow'],
    npcs: ['elder_maren', 'captain_bram', 'smith_orla', 'angler_tobb'],
  },
  copper_hills: {
    name: 'Copper Hills',
    description: 'Rolling hills east of the village. Copper and tin near the surface, goblins everywhere else.',
    unlock: [],
    nodes: ['copper_rock', 'tin_rock'],
    monsters: ['goblin'],
    npcs: [],
  },
  whispering_woods: {
    name: 'Whispering Woods',
    description: 'Willows, a fast river, wolves, and people who would rather rob you than work.',
    unlock: [{ type: 'quest', questId: 'goblin_menace' }],
    nodes: ['willow_tree', 'trout_spot'],
    monsters: ['wolf', 'bandit'],
    npcs: [],
  },
  old_iron_mines: {
    name: 'Old Iron Mines',
    description: 'Abandoned shafts full of iron, coal and the miners who never left.',
    unlock: [{ type: 'level', skill: 'mining', level: 15 }],
    nodes: ['iron_rock', 'coal_rock'],
    monsters: ['skeleton'],
    npcs: [],
  },
});
