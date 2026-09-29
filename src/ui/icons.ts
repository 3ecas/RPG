/** Icons for map markers. Presentation only: content stays free of visuals. */
import type { MonsterId, SkillId, StationId } from '@/types/ids';

export const NODE_ICONS: Partial<Record<SkillId, string>> = {
  mining: '⛏️',
  woodcutting: '🌲',
  fishing: '🎣',
  farming: '🌾',
  harvesting: '🌿',
};

export const STATION_ICONS: Record<StationId, string> = {
  furnace: '🔥',
  anvil: '⚒️',
  sawbench: '🪚',
  tannery: '🧵',
  campfire: '🏕️',
};

export const MONSTER_ICONS: Partial<Record<MonsterId, string>> = {
  rat: '🐀', cow: '🐄', goblin: '👺', wolf: '🐺', bandit: '🗡️', cave_spider: '🕷️',
  skeleton: '💀', bear: '🐻', bog_lurker: '🟢', troll: '👹', harpy: '🦅',
  wyvern: '🐉', cultist: '🔮', drake: '🐲', lich: '☠️',
};

export const SKILL_ICONS: Record<SkillId, string> = {
  mining: '⛏️', woodcutting: '🌲', fishing: '🎣', farming: '🌾', harvesting: '🌿',
  blacksmithing: '⚒️', woodworking: '🪚', leatherworking: '🧵', cooking: '🍳',
  swords: '⚔️', axes: '🪓', daggers: '🔪', shields: '🛡️', armor: '🥋', vitality: '❤️',
};

export const SLOT_ICONS = {
  head: '🪖', body: '👕', legs: '👖', hands: '🧤', feet: '🥾', main_hand: '⚔️', off_hand: '🛡️', trinket_1: '💍', trinket_2: '📿',
} as const;

export const PLACE_ICONS = {
  shop: '🏪',
  market: '⚖️',
  trader: '🧳',
  npc: '💬',
  signpost: '🪧',
  monster: '👹',
} as const;
