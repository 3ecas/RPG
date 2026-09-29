/** All content tables in one place. The registry is built from this. */
import type { ContentTables } from '@/types/content';
import { SKILLS } from './skills';
import { STATIONS } from './stations';
import { ITEMS } from './items';
import { RECIPES } from './recipes';
import { NODES } from './gather-nodes';
import { MONSTERS } from './monsters';
import { NPCS } from './npcs';
import { QUESTS } from './quests';
import { ZONES } from './zones';

export const CONTENT = {
  skills: SKILLS,
  stations: STATIONS,
  items: ITEMS,
  recipes: RECIPES,
  nodes: NODES,
  monsters: MONSTERS,
  npcs: NPCS,
  quests: QUESTS,
  zones: ZONES,
} satisfies ContentTables;
