/** Buttons of the bottom hotbar. Everything else opens from the map. */
export interface MenuDef {
  panel: string;
  title: string;
  icon: string;
  /** 'left' stays in the bottom-left corner; 'right' sits at the far end. */
  side: 'left' | 'right';
}

export const MENUS: readonly MenuDef[] = [
  { panel: 'inventory', title: 'Bag', icon: '🎒', side: 'left' },
  { panel: 'zones', title: 'World map', icon: '🗺️', side: 'left' },
  { panel: 'missions', title: 'Missions', icon: '📜', side: 'left' },
  { panel: 'log', title: 'Log', icon: '📋', side: 'left' },
  { panel: 'skills', title: 'Skills', icon: '📈', side: 'left' },
  { panel: 'tree', title: 'Progression', icon: '🌳', side: 'left' },
  { panel: 'settings', title: 'Settings', icon: '⚙️', side: 'right' },
];
