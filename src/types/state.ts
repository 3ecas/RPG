/** The whole game is this one plain, serializable object. Store facts; derive the rest. */
import type { ItemStack, StatBlock } from './content';
import type { EquipSlot, ItemId, MonsterId, NodeId, NpcId, ProgressNodeId, QuestId, RecipeId, ShopId, SkillId, TraderId, ZoneId } from './ids';

export interface ActiveBuff {
  stat: keyof StatBlock;
  amount: number;
  /** Game-clock time (state.time.nowMs) at which the buff ends. */
  expiresAtMs: number;
  source: ItemId;
}

/** What the player is doing right now. At most one at a time; this is the idle core. */
export type Activity =
  | { kind: 'gather'; nodeId: NodeId; elapsedMs: number }
  | { kind: 'craft'; recipeId: RecipeId; elapsedMs: number; remaining: number }
  | { kind: 'combat'; zoneId: ZoneId; monsterId: MonsterId };

export interface CombatState {
  monsterId: MonsterId;
  monsterHp: number;
  playerTimerMs: number;
  monsterTimerMs: number;
  /** Kills in this fight session, for the panel. */
  kills: number;
}

export interface QuestProgress {
  /** One counter per objective, in objective order. `collect` objectives read the inventory instead. */
  counts: number[];
}

export interface ShopState {
  /** Current stock of finite items. Infinite items are absent. */
  stock: Partial<Record<ItemId, number>>;
  lastRestockMs: number;
}

export interface MarketState {
  lastUpdateMs: number;
  /** Current price per item; absent means the item's base value. */
  prices: Partial<Record<ItemId, number>>;
}

export interface TraderState {
  /** Indices into the trader's offer list that are currently shown. */
  offers: number[];
  /** Remaining uses per shown offer, same order. */
  usesLeft: number[];
  nextRefreshMs: number;
}

export type LogKind = 'info' | 'loot' | 'combat' | 'quest' | 'level' | 'warn' | 'trade';

export interface LogEntry {
  /** Game-clock time. */
  t: number;
  kind: LogKind;
  text: string;
}

export interface GameState {
  version: number;
  meta: {
    createdAt: number;
    /** Wall-clock time of the last tick; offline catch-up starts from here. */
    lastTickAt: number;
    seed: number;
    rngState: number;
  };
  time: {
    /** Game clock in ms. Advanced only by ticks, so offline simulation behaves like live play. */
    nowMs: number;
  };
  player: {
    name: string;
    hp: number;
    mana: number;
    gold: number;
    zoneId: ZoneId;
    skills: Record<SkillId, { xp: number }>;
    equipment: Record<EquipSlot, ItemId | null>;
    buffs: ActiveBuff[];
    /** Accumulator for passive hp regeneration. */
    regenMs: number;
  };
  inventory: ItemStack[];
  activity: Activity | null;
  combat: CombatState | null;
  quests: {
    active: Partial<Record<QuestId, QuestProgress>>;
    completed: QuestId[];
  };
  progression: {
    /** Points ever granted. Available points = granted − cost of unlocked nodes. Reconciled from tier-ups and quests. */
    granted: number;
    unlocked: ProgressNodeId[];
  };
  world: {
    /** Zones the player has been told about; unlock rules are evaluated live. */
    unlockedZones: ZoneId[];
    flags: Record<string, boolean>;
    talkedTo: NpcId[];
    /** Created on first visit; a missing shop is at full stock. */
    shops: Partial<Record<ShopId, ShopState>>;
    market: MarketState;
    /** Created on first visit. */
    traders: Partial<Record<TraderId, TraderState>>;
  };
  log: LogEntry[];
}
