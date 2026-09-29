/** Shapes of the content tables. Content files are literals of these types; they contain no logic. */
import type { EquipSlot, ItemId, MonsterId, NodeId, NpcId, QuestId, RecipeId, SkillId, StationId } from './ids';

/** A content definition whose `id` is narrowed to the table's id union. */
export type Keyed<TDef, Id extends string> = TDef & { readonly id: Id };

export type SkillGroup = 'gathering' | 'production' | 'combat';

export interface SkillDef {
  readonly id: string;
  readonly name: string;
  /** Shown while training it: "Mining Copper Rock", "Chopping Oak Tree". */
  readonly verb: string;
  readonly group: SkillGroup;
  readonly description: string;
}

export interface StationDef {
  readonly id: string;
  readonly name: string;
  /** Shown while working: "Smelting Bronze Bar". */
  readonly verb: string;
  readonly description: string;
}

/** Every combat-relevant number. Base values come from levels; gear and buffs add to them. */
export interface StatBlock {
  attack: number;
  strength: number;
  defence: number;
  magic: number;
  maxHp: number;
  maxMana: number;
}

export type ItemCategory = 'material' | 'weapon' | 'armor' | 'food' | 'potion' | 'misc';

export interface SkillRequirement {
  readonly skill: SkillId;
  readonly level: number;
}

export interface EquipInfo {
  readonly slot: EquipSlot;
  readonly stats: Readonly<Partial<StatBlock>>;
  /** Weapons only: time between attacks. */
  readonly attackIntervalMs?: number;
  readonly requirements?: readonly SkillRequirement[];
}

export type Effect =
  | { readonly type: 'heal'; readonly amount: number }
  | { readonly type: 'restore_mana'; readonly amount: number }
  | { readonly type: 'buff'; readonly stat: keyof StatBlock; readonly amount: number; readonly durationMs: number };

export interface ItemDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: ItemCategory;
  /** Base gold value. Shops and the market derive prices from it. */
  readonly value: number;
  readonly equip?: EquipInfo;
  readonly consume?: { readonly effects: readonly Effect[] };
}

export interface ItemStack {
  itemId: ItemId;
  qty: number;
}

export interface RecipeDef {
  readonly id: string;
  /** Defaults to the name of the first output. */
  readonly name?: string;
  readonly station: StationId;
  readonly skill: SkillId;
  readonly level: number;
  readonly inputs: readonly Readonly<ItemStack>[];
  readonly outputs: readonly Readonly<ItemStack>[];
  readonly durationMs: number;
  readonly xp: number;
}

export interface GatherNodeDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly skill: SkillId;
  readonly level: number;
  readonly itemId: ItemId;
  readonly durationMs: number;
  readonly xp: number;
}

export interface LootEntry {
  readonly itemId: ItemId;
  readonly min: number;
  readonly max: number;
  /** 0..1, rolled independently per entry. */
  readonly chance: number;
}

export interface MonsterDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly level: number;
  readonly hp: number;
  readonly attack: number;
  readonly strength: number;
  readonly defence: number;
  readonly attackIntervalMs: number;
  readonly gold: readonly [min: number, max: number];
  readonly loot: readonly LootEntry[];
}

export type Requirement =
  | { readonly type: 'level'; readonly skill: SkillId; readonly level: number }
  | { readonly type: 'quest'; readonly questId: QuestId }
  | { readonly type: 'item'; readonly itemId: ItemId; readonly qty: number };

export interface NpcDef {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly greeting: string;
}

export type Objective =
  | { readonly type: 'kill'; readonly monsterId: MonsterId; readonly count: number }
  | { readonly type: 'collect'; readonly itemId: ItemId; readonly count: number }
  | { readonly type: 'craft'; readonly recipeId: RecipeId; readonly count: number }
  | { readonly type: 'reach_level'; readonly skill: SkillId; readonly level: number }
  | { readonly type: 'talk'; readonly npcId: NpcId };

export type Reward =
  | { readonly type: 'gold'; readonly amount: number }
  | { readonly type: 'item'; readonly itemId: ItemId; readonly qty: number }
  | { readonly type: 'xp'; readonly skill: SkillId; readonly amount: number };

export interface QuestDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly giverId: NpcId;
  readonly prerequisites: readonly Requirement[];
  readonly objectives: readonly Objective[];
  readonly rewards: readonly Reward[];
  readonly completionText: string;
}

export interface ZoneDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly unlock: readonly Requirement[];
  readonly nodes: readonly NodeId[];
  readonly monsters: readonly MonsterId[];
  readonly npcs: readonly NpcId[];
}

/** Everything the registry is built from. */
export interface ContentTables {
  readonly skills: Readonly<Record<string, SkillDef>>;
  readonly stations: Readonly<Record<string, StationDef>>;
  readonly items: Readonly<Record<string, ItemDef>>;
  readonly recipes: Readonly<Record<string, RecipeDef>>;
  readonly nodes: Readonly<Record<string, GatherNodeDef>>;
  readonly monsters: Readonly<Record<string, MonsterDef>>;
  readonly npcs: Readonly<Record<string, NpcDef>>;
  readonly quests: Readonly<Record<string, QuestDef>>;
  readonly zones: Readonly<Record<string, ZoneDef>>;
}
