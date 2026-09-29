/**
 * The progression tree: points earned from tier-ups and quests are spent on
 * nodes that unlock skills, stations, zones, features and perks. Every other
 * system asks here before letting the player use something.
 */
import { BALANCE } from '@/content/balance';
import type { Feature, PerkId, ProgressNodeDef, SkillGroup } from '@/types/content';
import type { ProgressNodeId, ZoneId } from '@/types/ids';
import type { GameState } from '@/types/state';
import { fail, ok, type Result } from '@/types/result';
import type { Ctx, SystemListeners } from './ctx';
import { log } from './log';
import * as requirements from './requirements';
import { tierForXp } from './formulas';

export interface Unlocks {
  zones: Set<ZoneId>;
  features: Set<Feature>;
  perks: Record<PerkId, number>;
}

const NO_PERKS: Record<PerkId, number> = {
  gather_speed: 0, craft_speed: 0, gather_xp: 0, craft_xp: 0, combat_xp: 0,
  max_hp: 0, regen: 0, gold_find: 0, sell_bonus: 0, inventory_slots: 0,
};

/** Everything the unlocked nodes grant, added up. */
export function unlocks(state: GameState, ctx: Ctx): Unlocks {
  const out: Unlocks = { zones: new Set(), features: new Set(), perks: { ...NO_PERKS } };
  for (const nodeId of state.progression.unlocked) {
    for (const u of ctx.content.progressNode(nodeId).unlocks) {
      switch (u.type) {
        case 'zone': out.zones.add(u.zoneId); break;
        case 'feature': out.features.add(u.feature); break;
        case 'perk': out.perks[u.perk] += u.value; break;
      }
    }
  }
  return out;
}

export function isUnlocked(state: GameState, nodeId: ProgressNodeId): boolean {
  return state.progression.unlocked.includes(nodeId);
}

export function hasFeature(state: GameState, ctx: Ctx, feature: Feature): boolean {
  return unlocks(state, ctx).features.has(feature);
}

export function perk(state: GameState, ctx: Ctx, id: PerkId): number {
  return unlocks(state, ctx).perks[id];
}

/** Xp multiplier for a skill from the perks of its group. */
export function xpMultiplier(state: GameState, ctx: Ctx, group: SkillGroup): number {
  const perks = unlocks(state, ctx).perks;
  const bonus = group === 'gathering' ? perks.gather_xp : group === 'production' ? perks.craft_xp : perks.combat_xp;
  return 1 + bonus;
}

export function spent(state: GameState, ctx: Ctx): number {
  return state.progression.unlocked.reduce((sum, id) => sum + ctx.content.progressNode(id).cost, 0);
}

export function available(state: GameState, ctx: Ctx): number {
  return state.progression.granted - spent(state, ctx);
}

/** Points a character should have been granted by now, from the facts in the state. */
export function expectedGranted(state: GameState, ctx: Ctx): number {
  let total = BALANCE.STARTING_POINTS;
  for (const id of ctx.content.skillIds) total += BALANCE.POINTS_PER_TIER_UP * (tierForXp(state.player.skills[id].xp) - 1);
  for (const questId of state.quests.completed) {
    for (const r of ctx.content.quest(questId).rewards) if (r.type === 'points') total += r.amount;
  }
  for (const missionId of state.missions.claimed) {
    for (const r of ctx.content.mission(missionId).rewards) if (r.type === 'points') total += r.amount;
  }
  return total;
}

/** Grants any points owed (new tier-ups, quests, or an older save) and unlocks the free root nodes. */
export function reconcile(state: GameState, ctx: Ctx): void {
  for (const id of ctx.content.progressNodeIds) {
    const node = ctx.content.progressNode(id);
    if (node.cost === 0 && node.requires.length === 0 && !isUnlocked(state, id)) state.progression.unlocked.push(id);
  }
  const expected = expectedGranted(state, ctx);
  if (expected > state.progression.granted) {
    const gained = expected - state.progression.granted;
    state.progression.granted = expected;
    ctx.events.emit('progress:points', { granted: expected });
    log(state, ctx, 'level', `+${gained} progression point${gained === 1 ? '' : 's'}. ${available(state, ctx)} to spend.`);
  }
}

export type NodeStatus = 'unlocked' | 'available' | 'locked';

export function canUnlock(state: GameState, ctx: Ctx, nodeId: ProgressNodeId): Result {
  const node = ctx.content.progressNode(nodeId);
  if (isUnlocked(state, nodeId)) return fail('Already unlocked.');
  for (const parent of node.requires) {
    if (!isUnlocked(state, parent)) return fail(`Requires "${ctx.content.progressNode(parent).name}" first.`);
  }
  const reqs = requirements.check(state, ctx, node.requirements);
  if (!reqs.ok) return reqs;
  const points = available(state, ctx);
  if (points < node.cost) return fail(`Needs ${node.cost} point${node.cost === 1 ? '' : 's'}, you have ${points}.`);
  return ok();
}

export function status(state: GameState, ctx: Ctx, nodeId: ProgressNodeId): NodeStatus {
  if (isUnlocked(state, nodeId)) return 'unlocked';
  return canUnlock(state, ctx, nodeId).ok ? 'available' : 'locked';
}

export function unlock(state: GameState, ctx: Ctx, nodeId: ProgressNodeId): Result {
  const check = canUnlock(state, ctx, nodeId);
  if (!check.ok) return check;
  const node = ctx.content.progressNode(nodeId);
  state.progression.unlocked.push(nodeId);
  log(state, ctx, 'level', `Unlocked: ${node.name}. ${describeUnlocks(ctx, node)}`);
  ctx.events.emit('progress:unlocked', { nodeId });
  return ok();
}

export function describeUnlocks(ctx: Ctx, node: ProgressNodeDef): string {
  return node.unlocks.map((u) => {
    switch (u.type) {
      case 'zone': return `Zone: ${ctx.content.zone(u.zoneId).name}`;
      case 'feature': return u.feature === 'market' ? 'Market access' : u.feature === 'traders' ? 'Barter with traders' : u.feature === 'auto_eat' ? 'Auto-eat' : 'Dual wield';
      case 'perk': return describePerk(u.perk, u.value);
    }
  }).join(' · ');
}

export function describePerk(perk: PerkId, value: number): string {
  const pct = `${Math.round(value * 100)}%`;
  switch (perk) {
    case 'gather_speed': return `${pct} faster gathering`;
    case 'craft_speed': return `${pct} faster crafting`;
    case 'gather_xp': return `+${pct} gathering xp`;
    case 'craft_xp': return `+${pct} crafting xp`;
    case 'combat_xp': return `+${pct} combat xp`;
    case 'max_hp': return `+${value} max hp`;
    case 'regen': return `${pct} faster regeneration`;
    case 'gold_find': return `+${pct} gold from monsters`;
    case 'sell_bonus': return `+${pct} shop sell prices`;
    case 'inventory_slots': return `+${value} inventory slots`;
  }
}

/** Depth in the tree: roots are 0. Used to lay the tree out. */
export function depth(ctx: Ctx, nodeId: ProgressNodeId, seen: Set<string> = new Set()): number {
  const node = ctx.content.progressNode(nodeId);
  if (node.requires.length === 0 || seen.has(nodeId)) return 0;
  seen.add(nodeId);
  return 1 + Math.max(...node.requires.map((p) => depth(ctx, p, seen)));
}

export const listeners: SystemListeners = {
  'skill:tierup': (state, ctx) => reconcile(state, ctx),
  'quest:completed': (state, ctx) => reconcile(state, ctx),
  'mission:claimed': (state, ctx) => reconcile(state, ctx),
};
