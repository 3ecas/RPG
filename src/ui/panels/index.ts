import type { Panel } from '../panel';
import { skillsPanel } from './skills-panel';
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

/** Nav order. Adding a panel = one file + one line here. */
export const PANELS: Panel[] = [
  skillsPanel,
  inventoryPanel,
  equipmentPanel,
  journalPanel,
  gatheringPanel,
  craftingPanel('furnace', 'Furnace'),
  craftingPanel('anvil', 'Anvil'),
  craftingPanel('campfire', 'Campfire'),
  craftingPanel('workbench', 'Workbench'),
  combatPanel,
  zonesPanel,
  peoplePanel,
  shopsPanel,
  marketPanel,
  tradersPanel,
  logPanel,
  settingsPanel,
];
