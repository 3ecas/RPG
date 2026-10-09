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
import type { MISSIONS } from '@/content/missions';

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
export type MissionId = keyof typeof MISSIONS;
export type { QuestId } from '@/content/quests';
export type { ProgressNodeId } from '@/content/progression';


/** Where gear is worn. Two hands and two trinket slots; the rest is armor. */
export type EquipSlot = 'head' | 'body' | 'legs' | 'hands' | 'feet' | 'main_hand' | 'off_hand' | 'trinket_1' | 'trinket_2';
export const EQUIP_SLOTS: readonly EquipSlot[] = ['head', 'body', 'legs', 'hands', 'feet', 'main_hand', 'off_hand', 'trinket_1', 'trinket_2'];
export const ARMOR_SLOTS: readonly EquipSlot[] = ['head', 'body', 'legs', 'hands', 'feet'];

/** The gathering skills that need a tool; each has a slot on the tool belt. */
export type ToolSkill = 'lumberjack' | 'mining' | 'fishing';
export const TOOL_SKILLS: readonly ToolSkill[] = ['lumberjack', 'mining', 'fishing'];

/** What kind of gear an item is; decides which slots accept it. Tomes are books for the off hand. */
export type GearKind = 'head' | 'body' | 'legs' | 'hands' | 'feet' | 'weapon' | 'shield' | 'book' | 'trinket';
