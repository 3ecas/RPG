/**
 * Content ids are derived from the content tables, so a misspelled id is a
 * compile error and editors autocomplete them. These are type-only imports:
 * nothing from content is loaded at runtime through this file.
 */
import type { SKILLS } from '@/content/skills';
import type { STATIONS } from '@/content/stations';
import type { ITEMS } from '@/content/items';
import type { RECIPES } from '@/content/recipes';
import type { NODES } from '@/content/gather-nodes';
import type { MONSTERS } from '@/content/monsters';
import type { NPCS } from '@/content/npcs';
import type { ZONES } from '@/content/zones';
import type { SHOPS } from '@/content/shops';
import type { TRADERS } from '@/content/traders';

export type SkillId = keyof typeof SKILLS;
export type StationId = keyof typeof STATIONS;
export type ItemId = keyof typeof ITEMS;
export type RecipeId = keyof typeof RECIPES;
export type NodeId = keyof typeof NODES;
export type MonsterId = keyof typeof MONSTERS;
export type NpcId = keyof typeof NPCS;
export type ZoneId = keyof typeof ZONES;
export type ShopId = keyof typeof SHOPS;
export type TraderId = keyof typeof TRADERS;
export type { QuestId } from '@/content/quests';


export type EquipSlot = 'weapon' | 'shield' | 'head' | 'body' | 'legs' | 'hands' | 'feet' | 'ring' | 'amulet';
export const EQUIP_SLOTS: readonly EquipSlot[] = ['weapon', 'shield', 'head', 'body', 'legs', 'hands', 'feet', 'ring', 'amulet'];
