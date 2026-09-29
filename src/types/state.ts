/** The whole game is this one plain, serializable object. Store facts; derive the rest. */
import type { ItemStack, StatBlock } from './content';
import type { EquipSlot, ItemId, MonsterId, NodeId, NpcId, QuestId, RecipeId, SkillId, ZoneId } from './ids';

export type CombatStyle = 'attack' | 'strength' | 'defence';

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

export type LogKind = 'info' | 'loot' | 'combat' | 'quest' | 'level' | 'warn';

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
    combatStyle: CombatStyle;
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
  world: {
    /** Zones the player has been told about; unlock rules are evaluated live. */
    unlockedZones: ZoneId[];
    flags: Record<string, boolean>;
    talkedTo: NpcId[];
  };
  log: LogEntry[];
}
