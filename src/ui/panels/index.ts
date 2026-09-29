import type { Panel } from '../panel';
import { skillsPanel } from './skills-panel';
import { treePanel } from './tree-panel';
import { inventoryPanel } from './inventory-panel';
import { equipmentPanel } from './equipment-panel';
import { journalPanel } from './journal-panel';
import { gatheringPanel } from './gathering-panel';
import { craftingPanel } from './crafting-panel';
import { combatPanel } from './combat-panel';
import { zonesPanel } from './zones-panel';
import { peoplePanel } from './people-panel';
import { shopsPanel } from './shops-panel';
import { marketPanel } from './market-panel';
import { tradersPanel } from './traders-panel';
import { logPanel } from './log-panel';
import { settingsPanel } from './settings-panel';

/** Every panel. Which tab shows it is decided in ui/tabs.ts. Adding a panel = one file + a line here + a line there. */
export const PANELS: Panel[] = [
  skillsPanel,
  treePanel,
  inventoryPanel,
  equipmentPanel,
  journalPanel,
  gatheringPanel,
  craftingPanel('furnace', 'Furnace'),
  craftingPanel('anvil', 'Anvil'),
  craftingPanel('sawbench', 'Sawbench'),
  craftingPanel('tannery', 'Tannery'),
  craftingPanel('campfire', 'Campfire'),
  combatPanel,
  zonesPanel,
  peoplePanel,
  shopsPanel,
  marketPanel,
  tradersPanel,
  logPanel,
  settingsPanel,
];
