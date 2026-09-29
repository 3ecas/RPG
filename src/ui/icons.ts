/**
 * The icon set: small line icons drawn as SVG paths on a 24×24 grid, no emoji
 * and no icon font. `iconSprite()` is inserted once into the page; `icon()`
 * renders one inline in HTML and `iconUse()` renders one inside an SVG scene
 * (the map, the tree graph). Presentation only: content stays free of visuals.
 */
import type { EquipSlot, MonsterId, SkillId, StationId } from '@/types/ids';
import { html, raw, type Raw } from './html';

/** A gear outline with eight teeth, generated so nothing is drawn by hand twice. */
function gearPath(): string {
  const points: string[] = [];
  const steps = 32;
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2 - Math.PI / 2;
    const r = i % 4 < 2 ? 10 : 7.4;
    points.push(`${(12 + r * Math.cos(angle)).toFixed(2)} ${(12 + r * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${points.join('L')}Z`;
}

/** Inner markup of every icon. Strokes inherit `currentColor`; a few shapes fill on purpose. */
const ICONS = {
  // gathering, crafting
  pickaxe: '<path d="M3 9C7 4 17 4 21 9c-4-2-14-2-18 0z"/><path d="M12 7.5V21"/>',
  tree: '<path d="M12 2 5 12h4l-4 7h14l-4-7h4z"/><path d="M12 19v3"/>',
  fish: '<path d="M2 12q4-6 11-6l3 3 6-4-2 7 2 7-6-4-3 3q-7 0-11-6z"/><circle cx="7" cy="11" r="1" fill="currentColor" stroke="none"/>',
  wheat: '<path d="M12 22V4"/><path d="M12 8C9 8 8 5 8 3c3 0 4 2 4 5zM12 8c3 0 4-3 4-5-3 0-4 2-4 5zM12 13c-3 0-4-3-4-5 3 0 4 2 4 5zM12 13c3 0 4-3 4-5-3 0-4 2-4 5zM12 18c-3 0-4-3-4-5 3 0 4 2 4 5zM12 18c3 0 4-3 4-5-3 0-4 2-4 5z"/>',
  leaf: '<path d="M4 20C4 10 10 4 20 4c0 10-6 16-16 16z"/><path d="M4 20 14 10"/>',
  hammer: '<path d="M10 8l5-5 6 6-5 5z"/><path d="M13 11 3 21"/>',
  anvil: '<path d="M21 8v3h-6v2c0 3 2 4 4 4H7c2 0 4-1 4-4v-2H8c-3 0-6-1-6-3z"/><path d="M7 17v3h10v-3"/>',
  saw: '<path d="M7 7h15l-3 8H7z"/><path d="M7 15l1.5 2.5 1.5-2.5 1.5 2.5 1.5-2.5 1.5 2.5 1.5-2.5 1.5 2.5 1.5-2.5"/><path d="M7 9H4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h3"/>',
  needle: '<path d="M5 19 16.5 7.5"/><circle cx="18" cy="6" r="2"/><path d="M19.5 7.5c3 4-2 7-4 11-1 2 1 3 3 2"/>',
  pot: '<path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M6 10c0-3 3-4 6-4s6 1 6 4"/><path d="M12 6V4"/><path d="M2 13h2M20 13h2"/>',
  flame: '<path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 1-5 3-6 0 2 1 3 2 3 0-3 1-6 1-8z"/>',
  campfire: '<path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-2 1-3 2-4 0 1.5 1 2 1.5 2 0-2 .5-4 .5-6z"/><path d="M4 21l16-5M20 21 4 16"/>',
  // arms and armour
  sword: '<path d="M21 3l-3 .5-9.5 9.5 3 3L20.5 6z"/><path d="M7.5 12l5 5"/><path d="M10 14.5 5.5 19"/><circle cx="4.5" cy="20" r="1.2" fill="currentColor" stroke="none"/>',
  axe: '<path d="M3 21 14 8.5"/><path d="M10 6c3-4 9-3 11-1 0 4 0 8-3 10z"/>',
  dagger: '<path d="M12 2l2.5 4v7h-5V6z"/><path d="M7 13h10"/><path d="M12 13v6"/><circle cx="12" cy="20.5" r="1.5" fill="currentColor" stroke="none"/>',
  crossed: '<path d="M4 4l14 14M20 4 6 18"/><path d="M13 17l4-4M7 13l4 4"/>',
  shield: '<path d="M12 2 4 5v6c0 5 3 8 8 11 5-3 8-6 8-11V5z"/>',
  chestplate: '<path d="M6 3l3 1c1 2 5 2 6 0l3-1v6l-2 2v8H8v-8L6 9z"/>',
  helmet: '<path d="M4 14v-3a8 8 0 0 1 16 0v3z"/><path d="M8 14v5h8v-5"/><path d="M12 14v5"/>',
  shirt: '<path d="M8 3 3 6l2 4 2-1v11h10V9l2 1 2-4-5-3c-1 2-7 2-8 0z"/>',
  pants: '<path d="M6 3h12l1 18h-5l-2-9-2 9H5z"/>',
  glove: '<path d="M8 21v-6L5 11l2-1 2 3V5h2v6h1V4h2v7h1V6h2v8c0 3-1 5-3 7z"/>',
  boot: '<path d="M5 3h8v9l6 3v4H5z"/><path d="M5 16h14"/>',
  ring: '<circle cx="12" cy="14" r="6"/><path d="M9 6l3-3 3 3-3 3z"/>',
  amulet: '<path d="M4 3c0 7 4 11 8 11s8-4 8-11"/><path d="M12 14v2"/><path d="M12 16l3 3-3 3-3-3z"/>',
  heart: '<path d="M12 21C6 16 2 12 2 8a5 5 0 0 1 10-2 5 5 0 0 1 10 2c0 4-4 8-10 13z"/>',
  // creatures
  paw: '<circle cx="6" cy="11" r="1.8"/><circle cx="10" cy="7" r="1.8"/><circle cx="14" cy="7" r="1.8"/><circle cx="18" cy="11" r="1.8"/><path d="M12 21c-3 0-6-2-6-5s3-6 6-6 6 3 6 6-3 5-6 5z"/>',
  cow: '<path d="M8 8C7 4 4 3 3 3M16 8c1-4 4-5 5-5"/><path d="M8 8h8v7a4 4 0 0 1-8 0z"/><path d="M10 11h.01M14 11h.01"/><path d="M10 17h1M13 17h1"/>',
  monster: '<path d="M5 3l4 4h6l4-4v8a7 7 0 0 1-14 0z"/><path d="M9 11v2M15 11v2"/><path d="M9 16h6"/>',
  spider: '<circle cx="12" cy="14" r="3.5"/><circle cx="12" cy="8" r="2"/><path d="M8.5 13 3 9M8.5 15 3 18M15.5 13l5.5-4M15.5 15l5.5 3M10 17l-3 5M14 17l3 5M10.5 11 6 6M13.5 11 18 6"/>',
  skull: '<path d="M12 3a8 8 0 0 0-8 8c0 3 2 5 3 6v4h10v-4c1-1 3-3 3-6a8 8 0 0 0-8-8z"/><circle cx="9" cy="11" r="1.5"/><circle cx="15" cy="11" r="1.5"/><path d="M10 21v-3M14 21v-3"/>',
  slime: '<path d="M3 19c0-7 4-12 9-12s9 5 9 12z"/><path d="M9 14v1M15 14v1"/>',
  wings: '<path d="M3 8c3-3 6-3 9 1 3-4 6-4 9-1-3 1-5 4-6 8H9c-1-4-3-7-6-8z"/>',
  dragon: '<path d="M2 13V8l5-4 3 2 2-4 1 4 5 1 4 3-6 2 5 4-7-1-4 2-5-1z"/><path d="M8 9h.01" stroke-width="3"/>',
  hood: '<path d="M12 3c-5 0-8 5-8 10v8h16v-8c0-5-3-10-8-10z"/><path d="M12 7c-3 0-4 3-4 6 0 3 2 5 4 5s4-2 4-5c0-3-1-6-4-6z"/><path d="M10 12h1M13 12h1"/>',
  mask: '<path d="M3 8c3-2 6-2 9 0 3-2 6-2 9 0v4c0 3-2 5-4 5s-3-2-5-3c-2 1-3 3-5 3s-4-2-4-5z"/><path d="M8 12h1M15 12h1"/>',
  // places
  store: '<path d="M3 9l2-5h14l2 5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M5 12v9h14v-9"/><path d="M10 21v-6h4v6"/>',
  scales: '<path d="M12 4v17M7 21h10M4 7h16"/><path d="M4 7l-3 7M4 7l3 7M1 14a3 3 0 0 0 6 0M20 7l-3 7M20 7l3 7M17 14a3 3 0 0 0 6 0"/>',
  cart: '<path d="M2 4h3l2 11h12l2-8H6"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  chat: '<path d="M3 4h18v12h-9l-5 4v-4H3z"/>',
  signpost: '<path d="M12 21V3"/><path d="M6 5h11l2 2-2 2H6z"/><path d="M18 11H7l-2 2 2 2h11z"/>',
  // menus
  backpack: '<path d="M5 10a7 7 0 0 1 14 0v11H5z"/><path d="M9 6V5a3 3 0 0 1 6 0v1"/><path d="M5 13h14"/><path d="M9 21v-5h6v5"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  scroll: '<path d="M8 5h12v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 4 0v12"/><path d="M11 9h6M11 13h6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01" stroke-width="3"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  hierarchy: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5v4M12 11.5l-5.5 5.5M12 11.5l5.5 5.5"/>',
  gear: `<path d="${gearPath()}"/><circle cx="12" cy="12" r="3"/>`,
  // marks and stats
  lock: '<path d="M5 11h14v10H5z"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  circle: '<circle cx="12" cy="12" r="7"/>',
  dot: '<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>',
  crosshair: '<circle cx="12" cy="12" r="8"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  dumbbell: '<path d="M2 12h3M19 12h3M8 12h8"/><path d="M5 8h3v8H5zM16 8h3v8h-3z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  coins: '<circle cx="9" cy="9" r="6"/><path d="M15 9A6 6 0 1 1 9 15"/>',
  utensils: '<path d="M5 3v5a3 3 0 0 0 6 0V3"/><path d="M8 11v10"/><path d="M18 3c-4 4-4 9 0 12"/><path d="M18 3v18"/>',
} as const;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/** The hidden sprite every `<use>` points at. Rendered once by the shell. */
export function iconSprite(): Raw {
  const symbols = ICON_NAMES.map((name) => `<symbol id="i-${name}" viewBox="0 0 24 24">${ICONS[name]}</symbol>`).join('');
  return html`<svg class="icon-sprite" aria-hidden="true" focusable="false">${raw(symbols)}</svg>`;
}

/** An inline icon for HTML. Sized by font size; colour follows the text unless a class says otherwise. */
export function icon(name: IconName, cls = ''): Raw {
  return html`<svg class="icon icon-${name} ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
}

/** An icon inside an SVG scene, centred on the current origin. */
export function iconUse(name: IconName, size: number, cls = ''): Raw {
  const half = size / 2;
  return html`<use href="#i-${name}" x="${-half}" y="${-half}" width="${size}" height="${size}" class="${cls}"/>`;
}

export const SKILL_ICONS: Record<SkillId, IconName> = {
  mining: 'pickaxe', woodcutting: 'tree', fishing: 'fish', farming: 'wheat', harvesting: 'leaf',
  blacksmithing: 'hammer', woodworking: 'saw', leatherworking: 'needle', cooking: 'pot',
  swords: 'sword', axes: 'axe', daggers: 'dagger', shields: 'shield', armor: 'chestplate', vitality: 'heart',
};

export const NODE_ICONS: Partial<Record<SkillId, IconName>> = {
  mining: 'pickaxe', woodcutting: 'tree', fishing: 'fish', farming: 'wheat', harvesting: 'leaf',
};

export const STATION_ICONS: Record<StationId, IconName> = {
  furnace: 'flame', anvil: 'anvil', sawbench: 'saw', tannery: 'needle', campfire: 'campfire',
};

export const MONSTER_ICONS: Partial<Record<MonsterId, IconName>> = {
  rat: 'paw', cow: 'cow', goblin: 'monster', wolf: 'paw', bandit: 'mask', cave_spider: 'spider',
  skeleton: 'skull', bear: 'paw', bog_lurker: 'slime', troll: 'monster', harpy: 'wings',
  wyvern: 'dragon', cultist: 'hood', drake: 'dragon', lich: 'skull',
};

export const SLOT_ICONS: Record<EquipSlot, IconName> = {
  head: 'helmet', body: 'shirt', legs: 'pants', hands: 'glove', feet: 'boot',
  main_hand: 'sword', off_hand: 'shield', trinket_1: 'ring', trinket_2: 'amulet',
};

export const PLACE_ICONS = {
  shop: 'store',
  market: 'scales',
  trader: 'cart',
  npc: 'chat',
  signpost: 'signpost',
  monster: 'monster',
} as const satisfies Record<string, IconName>;
