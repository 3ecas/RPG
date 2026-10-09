/** Shapes of the content tables. Content files are literals of these types; they contain no logic. */
import type { GearKind, ItemId, MonsterId, NodeId, NpcId, ProgressNodeId, QuestId, RecipeId, ShopId, SkillId, StationId, TraderId, ZoneId } from './ids';

/** A content definition whose `id` is narrowed to the table's id union. */
export type Keyed<TDef, Id extends string> = TDef & { readonly id: Id };

/** Every skill, item, node, recipe and monster sits on one of six tiers. */
export type Tier = 1 | 2 | 3 | 4 | 5 | 6;

export type WeaponType = 'sword' | 'axe' | 'dagger' | 'bow' | 'staff';

export type SkillGroup = 'gathering' | 'production' | 'combat' | 'magic';

/** Levels run from 1 to this. */
export const MAX_LEVEL = 100;

/** The level at which each tier's content opens, by tier (index 0 is tier 1). */
export const TIER_LEVELS: readonly number[] = [1, 15, 30, 50, 70, 85];

/** What a level of a skill gives: the content it opens, or the small bonus every level gives. */
export interface SkillUnlock {
  readonly level: number;
  readonly text: string;
}

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

/**
 * What a piece of gear adds to a character: hit points, mana, armor (shields
 * count), attack damage (weapons; scaled by the weapon's skill), spell power
 * (staffs, tomes; added to the Magic level).
 */
export interface StatBlock {
  hp: number;
  mana: number;
  armor: number;
  attack: number;
  spellPower: number;
}

export type ItemCategory = 'material' | 'weapon' | 'armor' | 'food' | 'potion' | 'misc';

/** Finer grouping for catalogue lists (shops, market, crafting). */
export type ItemGroup = 'ore' | 'bar' | 'log' | 'fish' | 'crop' | 'herb' | 'hide' | 'food' | 'weapon' | 'armor' | 'shield' | 'trinket' | 'book' | 'tool' | 'misc';

export interface SkillRequirement {
  readonly skill: SkillId;
  readonly tier: Tier;
}

export interface EquipInfo {
  /** Weapons (swords, axes, daggers, bows, staffs) go in the main hand, shields and tomes in the off hand, trinkets in either trinket slot. */
  readonly kind: GearKind;
  readonly stats: Readonly<Partial<StatBlock>>;
  /** Weapons only: time between attacks. */
  readonly attackIntervalMs?: number;
  /** Weapons only: which skill scales it and is trained by it. */
  readonly weaponType?: WeaponType;
  /** Skill tiers (level bands) needed to wear it. */
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
  readonly group: ItemGroup;
  readonly tier: Tier;
  /** Base gold value. Shops and the market derive prices from it. */
  readonly value: number;
  /** Whether any number share one bag slot. False for almost everything: a log is a slot. */
  readonly stackable?: boolean;
  /** A gathering tool: having one in the bag lets you gather with that skill, and the tier sets the pace. */
  readonly tool?: { readonly skill: SkillId; readonly tier: Tier };
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
  readonly tier: Tier;
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
  /** The tier sets the level it opens at and how much longer than a tier 1 node each item takes (world/skills.ts, gatherTicks). */
  readonly tier: Tier;
  readonly itemId: ItemId;
  readonly xp: number;
  /** Shared and depletable: after each success, this chance the node empties for everyone until it respawns. Absent means it never runs out. */
  readonly deplete?: { readonly chance: number; readonly respawnMs: number };
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
  readonly tier: Tier;
  readonly hp: number;
  /** Damage per hit and what it shrugs off, on the same scale as the character's attack and armor. */
  readonly attack: number;
  readonly armor: number;
  readonly attackIntervalMs: number;
  readonly gold: readonly [min: number, max: number];
  readonly loot: readonly LootEntry[];
}

export type Requirement =
  | { readonly type: 'tier'; readonly skill: SkillId; readonly tier: Tier }
  /** At least one skill at this tier, so any playstyle can progress. */
  | { readonly type: 'any_tier'; readonly tier: Tier }
  | { readonly type: 'quest'; readonly questId: QuestId }
  | { readonly type: 'item'; readonly itemId: ItemId; readonly qty: number }
  /** A node of the progression tree has been unlocked. */
  | { readonly type: 'unlock'; readonly nodeId: ProgressNodeId };

// ---- progression tree ----------------------------------------------------

export type ProgressBranch = 'gathering' | 'crafting' | 'combat' | 'world';

export type Feature = 'market' | 'traders' | 'auto_eat' | 'dual_wield';

/** Numeric bonuses granted by tree nodes. Fractions are added (0.1 = +10%), counts are added as-is. */
export type PerkId =
  | 'gather_speed' | 'craft_speed'
  | 'gather_xp' | 'craft_xp' | 'combat_xp'
  | 'max_hp' | 'regen' | 'gold_find' | 'sell_bonus' | 'inventory_slots';

/** Skills and stations are never gated: skills grow by use, stations stand in settlements. */
export type Unlock =
  | { readonly type: 'zone'; readonly zoneId: ZoneId }
  | { readonly type: 'feature'; readonly feature: Feature }
  | { readonly type: 'perk'; readonly perk: PerkId; readonly value: number };

export interface ProgressNodeDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly branch: ProgressBranch;
  /** Progression points to unlock. Zero-cost nodes without parents are unlocked at the start. */
  readonly cost: number;
  /** Parent nodes; all must be unlocked first. */
  readonly requires: readonly ProgressNodeId[];
  readonly requirements: readonly Requirement[];
  readonly unlocks: readonly Unlock[];
}

export interface NpcDef {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly greeting: string;
  /** Hands over a tool for a skill when the player talks to them with none of that kind in their bag or hands, saying `line`. */
  readonly handout?: { readonly itemId: ItemId; readonly skill: SkillId; readonly line: string };
}

/**
 * Objectives are shared by quests and missions. Counted kinds advance from
 * events; live kinds are read from the state when viewed.
 */
export type Objective =
  | { readonly type: 'kill'; readonly monsterId: MonsterId; readonly count: number }
  | { readonly type: 'craft'; readonly recipeId: RecipeId; readonly count: number }
  | { readonly type: 'gather'; readonly itemId: ItemId; readonly count: number }
  | { readonly type: 'talk'; readonly npcId: NpcId }
  | { readonly type: 'trade'; readonly kind: 'market' | 'shop' | 'barter'; readonly count: number }
  | { readonly type: 'collect'; readonly itemId: ItemId; readonly count: number }
  | { readonly type: 'reach_tier'; readonly skill: SkillId; readonly tier: Tier }
  | { readonly type: 'any_tier'; readonly tier: Tier }
  | { readonly type: 'unlock'; readonly nodeId: ProgressNodeId }
  | { readonly type: 'visit'; readonly zoneId: ZoneId }
  | { readonly type: 'equip'; readonly kind: GearKind };

export type Reward =
  | { readonly type: 'gold'; readonly amount: number }
  | { readonly type: 'item'; readonly itemId: ItemId; readonly qty: number }
  | { readonly type: 'xp'; readonly skill: SkillId; readonly amount: number }
  | { readonly type: 'points'; readonly amount: number };

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

export interface ShopStockDef {
  readonly itemId: ItemId;
  /** Maximum stock; restocks one unit per `restockMs`. 'infinite' never runs out. */
  readonly qty: number | 'infinite';
  /** Overrides the shop's markup for this item. */
  readonly price?: number;
}

export interface ShopDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly keeperId?: NpcId;
  /** Player pays item.value × markup. */
  readonly markup: number;
  /** Player receives item.value × sellRate. */
  readonly sellRate: number;
  /** Which item categories the shop buys. */
  readonly buys: 'all' | readonly ItemCategory[];
  readonly restockMs: number;
  readonly stock: readonly ShopStockDef[];
}

export interface TraderOfferDef {
  readonly give: readonly Readonly<ItemStack>[];
  readonly get: readonly Readonly<ItemStack>[];
  /** Times the offer can be taken per rotation. */
  readonly uses?: number;
}

export interface TraderDef {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** How often the shown offers rotate (game time). */
  readonly refreshMs: number;
  /** How many of the offers are shown at once. */
  readonly offersShown: number;
  readonly offers: readonly TraderOfferDef[];
}

export interface ChapterDef {
  readonly number: number;
  readonly name: string;
  readonly blurb: string;
}

/** A campaign step. Missions of a chapter open when the previous chapter is fully claimed. */
export interface MissionDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly chapter: number;
  readonly objectives: readonly Objective[];
  readonly rewards: readonly Reward[];
}

export interface ZoneDef {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly unlock: readonly Requirement[];
  readonly nodes: readonly NodeId[];
  readonly monsters: readonly MonsterId[];
  readonly npcs: readonly NpcId[];
  readonly shops: readonly ShopId[];
  readonly traders: readonly TraderId[];
  /** Whether the market (see content/market.ts) can be used from this zone. */
  readonly market: boolean;
  /** Crafting stations physically present here. Crafting needs the station in the current zone. */
  readonly stations: readonly StationId[];
}

// ---- zone maps ----------------------------------------------------------------

/** Ground of one map cell. */
export type Terrain = 'grass' | 'path' | 'tallgrass' | 'flowers' | 'dirt' | 'floor' | 'bridge' | 'water' | 'rock' | 'trees' | 'fence' | 'void';

/** Ground one can stand on. The rest (water, rock, dense trees, fences, the void) is not walked through. */
export const WALKABLE_TERRAIN: readonly Terrain[] = ['grass', 'path', 'tallgrass', 'flowers', 'dirt', 'floor', 'bridge'];

/** Characters a map row may use for terrain. Letters and digits are legend keys instead. */
export const TERRAIN_CHARS: Readonly<Record<string, Terrain>> = {
  '.': 'grass', ',': 'path', '"': 'tallgrass', '*': 'flowers', ':': 'dirt', '=': 'floor', '+': 'bridge',
  '~': 'water', '#': 'rock', '^': 'trees', '-': 'fence', ' ': 'void',
};

/** The look of a zone; the world renderer picks a palette per biome. */
export type Biome = 'meadow' | 'hills' | 'city' | 'forest' | 'cave' | 'marsh' | 'mountain' | 'ash' | 'reach';

/** Something placed on a zone map. Ids must belong to the zone the map is for. */
export type MapObjectDef =
  /** A gather node. It stands on the biome's ground unless `terrain` says otherwise: fishing spots stand in the water, beside the bank one fishes from. */
  | { readonly kind: 'node'; readonly id: NodeId; readonly terrain?: Terrain }
  | { readonly kind: 'station'; readonly id: StationId }
  | { readonly kind: 'shop'; readonly id: ShopId }
  | { readonly kind: 'market' }
  | { readonly kind: 'trader'; readonly id: TraderId }
  | { readonly kind: 'npc'; readonly id: NpcId }
  | { readonly kind: 'monster'; readonly id: MonsterId }
  | { readonly kind: 'exit'; readonly zone: ZoneId }
  | { readonly kind: 'spawn' }
  | { readonly kind: 'signpost' }
  /** A bank chest: use it from the cell beside it. */
  | { readonly kind: 'bank' };

export type MapObjectKind = MapObjectDef['kind'];

/** Kinds drawn as one building over a 2×2 block of cells; their legend key must fill the whole block. */
export const BIG_KINDS: readonly MapObjectKind[] = ['shop', 'market'];

/**
 * A zone's tile map: rows of equal length. Letters and digits are legend keys
 * (one object per occurrence, or one per 2×2 block for BIG_KINDS); every other
 * character is terrain from TERRAIN_CHARS. Exactly one spawn per map.
 */
export interface ZoneMapDef {
  readonly biome: Biome;
  readonly rows: readonly string[];
  readonly legend: Readonly<Record<string, MapObjectDef>>;
}

/** Everything the registry is built from. */
export interface ContentTables {
  readonly skills: Readonly<Record<string, SkillDef>>;
  /** What each level of each skill gives, one entry per level from 1 to MAX_LEVEL. */
  readonly unlocks: Readonly<Record<string, readonly SkillUnlock[]>>;
  readonly stations: Readonly<Record<string, StationDef>>;
  readonly items: Readonly<Record<string, ItemDef>>;
  readonly recipes: Readonly<Record<string, RecipeDef>>;
  readonly nodes: Readonly<Record<string, GatherNodeDef>>;
  readonly monsters: Readonly<Record<string, MonsterDef>>;
  readonly npcs: Readonly<Record<string, NpcDef>>;
  readonly quests: Readonly<Record<string, QuestDef>>;
  readonly zones: Readonly<Record<string, ZoneDef>>;
  readonly shops: Readonly<Record<string, ShopDef>>;
  readonly traders: Readonly<Record<string, TraderDef>>;
  /** Items the market trades. */
  readonly market: readonly string[];
  readonly progression: Readonly<Record<string, ProgressNodeDef>>;
  readonly chapters: readonly ChapterDef[];
  readonly missions: Readonly<Record<string, MissionDef>>;
  /** One tile map per zone, keyed by zone id. */
  readonly maps: Readonly<Record<string, ZoneMapDef>>;
}
