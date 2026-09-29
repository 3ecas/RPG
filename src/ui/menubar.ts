/** Buttons of the bottom hotbar. Everything else opens from the map. */
import type { IconName } from './icons';

export interface MenuDef {
  panel: string;
  title: string;
  icon: IconName;
  /** 'left' stays in the bottom-left corner; 'right' sits at the far end. */
  side: 'left' | 'right';
}

export const MENUS: readonly MenuDef[] = [
  { panel: 'inventory', title: 'Bag', icon: 'backpack', side: 'left' },
  { panel: 'zones', title: 'World map', icon: 'map', side: 'left' },
  { panel: 'missions', title: 'Missions', icon: 'scroll', side: 'left' },
  { panel: 'log', title: 'Log', icon: 'list', side: 'left' },
  { panel: 'skills', title: 'Skills', icon: 'trend', side: 'left' },
  { panel: 'tree', title: 'Progression', icon: 'hierarchy', side: 'left' },
  { panel: 'settings', title: 'Settings', icon: 'gear', side: 'right' },
];
