/**
 * The facade the UI talks to. Owns the state and the context, wires system
 * listeners, and exposes every player command. Contains no rules itself.
 */
import { BALANCE } from '@/content/balance';
import { EventBus } from '@/core/events';
import type { Registry } from '@/core/registry';
import { randomSeed, Rng } from '@/core/rng';
import { deserialize, serialize } from '@/core/save';
import type { Keyed, NpcDef, QuestDef, Requirement } from '@/types/content';
import type { GameEventName } from '@/types/events';
import type { EquipSlot, ItemId, MonsterId, NodeId, NpcId, QuestId, RecipeId, SkillId, ZoneId } from '@/types/ids';
import type { CombatStyle, GameState } from '@/types/state';
import type { Result } from '@/types/result';
import * as activity from '@/systems/activity';
import * as combat from '@/systems/combat';
import * as consumables from '@/systems/consumables';
import * as crafting from '@/systems/crafting';
import type { Ctx, SystemListeners } from '@/systems/ctx';
import * as equipment from '@/systems/equipment';
import * as gathering from '@/systems/gathering';
import * as inventory from '@/systems/inventory';
import { createInitialState } from '@/systems/new-game';
import * as npcs from '@/systems/npcs';
import * as quests from '@/systems/quests';
import * as requirements from '@/systems/requirements';
import * as skills from '@/systems/skills';
import * as stats from '@/systems/stats';
import { tick as simulate } from '@/systems/tick';
import * as zones from '@/systems/zones';

export interface OfflineSummary {
  elapsedMs: number;
  items: { itemId: ItemId; qty: number }[];
  xp: { skill: string; xp: number }[];
  levelUps: { skill: string; level: number }[];
  kills: number;
  deaths: number;
  stoppedReason: string | null;
}

export class Game {
  state: GameState;
  readonly ctx: Ctx;

  /** Content lookup for the UI. */
  get content(): Registry {
    return this.ctx.content;
  }

  private constructor(content: Registry, state: GameState) {
    this.state = state;
    this.ctx = { content, rng: new Rng(state.meta.rngState), events: new EventBus() };
    this.wire(zones.listeners);
    this.wire(quests.listeners);
    zones.checkUnlocks(this.state, this.ctx);
  }

  static newGame(content: Registry, seed: number = randomSeed(), now: number = Date.now()): Game {
    return new Game(content, createInitialState(content, seed, now));
  }

  /** Throws if the save cannot be read at all. */
  static fromSave(content: Registry, json: string, now: number = Date.now()): Game {
    const fresh = createInitialState(content, randomSeed(), now);
    return new Game(content, deserialize(json, content, fresh));
  }

  private wire(listeners: SystemListeners): void {
    for (const [event, handler] of Object.entries(listeners) as [GameEventName, SystemListeners[GameEventName]][]) {
      if (!handler) continue;
      this.ctx.events.on(event, (payload) => (handler as (s: GameState, c: Ctx, p: unknown) => void)(this.state, this.ctx, payload));
    }
  }

  // ---- lifecycle -----------------------------------------------------------

  tick(dtMs: number, now: number = Date.now()): void {
    simulate(this.state, this.ctx, dtMs);
    this.state.meta.lastTickAt = now;
    this.changed();
  }

  /** Simulates the time since the last tick (capped) and reports what happened. Null if nothing worth telling. */
  offlineCatchUp(now: number = Date.now()): OfflineSummary | null {
    const elapsed = Math.min(BALANCE.OFFLINE_CAP_MS, Math.max(0, now - this.state.meta.lastTickAt));
    if (elapsed < BALANCE.OFFLINE_STEP_MS) {
      this.state.meta.lastTickAt = now;
      return null;
    }
    const summary: OfflineSummary = { elapsedMs: elapsed, items: [], xp: [], levelUps: [], kills: 0, deaths: 0, stoppedReason: null };
    const items = new Map<ItemId, number>();
    const xp = new Map<string, number>();
    const off = [
      this.ctx.events.on('item:gained', (e) => { if (e.source !== 'unequip') items.set(e.itemId, (items.get(e.itemId) ?? 0) + e.qty); }),
      this.ctx.events.on('skill:xp', (e) => xp.set(e.skill, (xp.get(e.skill) ?? 0) + e.xp)),
      this.ctx.events.on('skill:levelup', (e) => summary.levelUps.push({ skill: this.ctx.content.skill(e.skill).name, level: e.level })),
      this.ctx.events.on('monster:killed', () => { summary.kills += 1; }),
      this.ctx.events.on('player:died', () => { summary.deaths += 1; }),
      this.ctx.events.on('activity:stopped', (e) => { summary.stoppedReason = e.reason; }),
    ];
    let remaining = elapsed;
    while (remaining > 0) {
      const step = Math.min(remaining, BALANCE.OFFLINE_STEP_MS);
      simulate(this.state, this.ctx, step);
      remaining -= step;
    }
    for (const fn of off) fn();
    this.state.meta.lastTickAt = now;
    summary.items = [...items].map(([itemId, qty]) => ({ itemId, qty }));
    summary.xp = [...xp].map(([skill, amount]) => ({ skill: this.ctx.content.skill(skill as never).name, xp: Math.round(amount) }));
    this.changed();
    return summary;
  }

  save(): string {
    this.state.meta.rngState = this.ctx.rng.state;
    return serialize(this.state);
  }

  private changed(): void {
    this.ctx.events.emit('state:changed', {});
  }

  private command(result: Result): Result {
    this.changed();
    return result;
  }

  // ---- player commands -----------------------------------------------------

  startGathering(nodeId: NodeId): Result { return this.command(gathering.start(this.state, this.ctx, nodeId)); }
  startCrafting(recipeId: RecipeId, count: number): Result { return this.command(crafting.start(this.state, this.ctx, recipeId, count)); }
  startCombat(monsterId: MonsterId): Result { return this.command(combat.start(this.state, this.ctx, monsterId)); }
  stopActivity(): Result {
    activity.stop(this.state, this.ctx, 'Stopped.');
    return this.command({ ok: true, value: undefined });
  }
  setCombatStyle(style: CombatStyle): Result { return this.command(combat.setStyle(this.state, style)); }
  equip(itemId: ItemId): Result { return this.command(equipment.equip(this.state, this.ctx, itemId)); }
  unequip(slot: EquipSlot): Result { return this.command(equipment.unequip(this.state, this.ctx, slot)); }
  consume(itemId: ItemId): Result { return this.command(consumables.consume(this.state, this.ctx, itemId)); }
  travel(zoneId: ZoneId): Result { return this.command(zones.travel(this.state, this.ctx, zoneId)); }
  talk(npcId: NpcId): Result { return this.command(npcs.talk(this.state, this.ctx, npcId)); }
  acceptQuest(questId: QuestId): Result { return this.command(quests.accept(this.state, this.ctx, questId)); }
  turnInQuest(questId: QuestId): Result { return this.command(quests.turnIn(this.state, this.ctx, questId)); }

  // ---- read-only queries for the UI ---------------------------------------
  // The UI never re-implements a rule: whether a button is enabled comes from here.

  stats(): stats.DerivedStats { return stats.derive(this.state, this.ctx); }
  skillView(skill: SkillId): skills.SkillView { return skills.view(this.state, this.ctx, skill); }
  totalLevel(): number { return skills.totalLevel(this.state, this.ctx); }
  activityView(): activity.ActivityView | null { return activity.describe(this.state, this.ctx); }
  itemCount(itemId: ItemId): number { return inventory.count(this.state, itemId); }
  freeSlots(): number { return inventory.freeSlots(this.state); }
  canGather(nodeId: NodeId): Result { return gathering.canGather(this.state, this.ctx, nodeId); }
  canCraft(recipeId: RecipeId): Result { return crafting.canCraft(this.state, this.ctx, recipeId); }
  maxCraftable(recipeId: RecipeId): number { return crafting.maxCraftable(this.state, this.ctx, recipeId); }
  canFight(monsterId: MonsterId): Result { return combat.canFight(this.state, this.ctx, monsterId); }
  canEquip(itemId: ItemId): Result { return equipment.canEquip(this.state, this.ctx, itemId); }
  isZoneUnlocked(zoneId: ZoneId): Result { return zones.isUnlocked(this.state, this.ctx, zoneId); }
  meetsRequirement(req: Requirement): boolean { return requirements.meets(this.state, req); }
  describeRequirement(req: Requirement): string { return requirements.describe(this.ctx, req); }
  npcsHere(): Keyed<NpcDef, NpcId>[] { return npcs.here(this.state, this.ctx); }
  questStatus(questId: QuestId): quests.QuestStatus { return quests.status(this.state, this.ctx, questId); }
  questObjectives(questId: QuestId): quests.ObjectiveView[] { return quests.objectives(this.state, this.ctx, questId); }
  questsByGiver(npcId: NpcId): { quest: Keyed<QuestDef, QuestId>; status: quests.QuestStatus }[] { return quests.byGiver(this.state, this.ctx, npcId); }
  canTurnIn(questId: QuestId): Result { return quests.canTurnIn(this.state, this.ctx, questId); }
}
