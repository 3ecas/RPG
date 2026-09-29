/** Top-level tabs and the panels under each. A tab with one panel has no sub-tabs. */
export interface TabDef {
  id: string;
  title: string;
  panels: readonly string[];
}

export const TABS: readonly TabDef[] = [
  { id: 'skills', title: 'Skills', panels: ['skills'] },
  { id: 'tree', title: 'Progression', panels: ['tree'] },
  { id: 'gather', title: 'Gather', panels: ['gathering'] },
  { id: 'craft', title: 'Craft', panels: ['furnace', 'anvil', 'sawbench', 'tannery', 'campfire'] },
  { id: 'combat', title: 'Combat', panels: ['combat'] },
  { id: 'inventory', title: 'Inventory', panels: ['inventory', 'equipment'] },
  { id: 'world', title: 'World', panels: ['zones', 'people', 'shops', 'market', 'traders'] },
  { id: 'journal', title: 'Journal', panels: ['journal'] },
  { id: 'log', title: 'Log', panels: ['log'] },
  { id: 'settings', title: 'Settings', panels: ['settings'] },
];

export function tabOf(panelId: string): TabDef {
  return TABS.find((t) => t.panels.includes(panelId)) ?? TABS[0]!;
}
