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
import { SHOPS } from './shops';
import { TRADERS } from './traders';
import { MARKET_ITEMS } from './market';

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
  shops: SHOPS,
  traders: TRADERS,
  market: MARKET_ITEMS,
} satisfies ContentTables;
