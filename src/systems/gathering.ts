/** Mining, woodcutting, fishing: one system, the node's data decides the skill. */
import type { GatherNodeDef } from '@/types/content';
import type { NodeId } from '@/types/ids';
import type { Activity, GameState } from '@/types/state';
import { fail, ok, type Result } from '@/types/result';
import * as activity from './activity';
import type { Ctx } from './ctx';
import * as inventory from './inventory';
import * as progression from './progression';
import * as skills from './skills';

type GatherActivity = Extract<Activity, { kind: 'gather' }>;

export function canGather(state: GameState, ctx: Ctx, nodeId: NodeId): Result {
  const node = ctx.content.node(nodeId);
  const zone = ctx.content.zone(state.player.zoneId);
  if (!zone.nodes.includes(nodeId)) return fail(`There is no ${node.name} in ${zone.name}.`);
  if (!progression.hasSkill(state, ctx, node.skill)) return fail(progression.lockedSkillReason(ctx, node.skill));
  if (skills.tier(state, node.skill) < node.tier) return fail(`Requires ${ctx.content.skill(node.skill).name} tier ${node.tier}.`);
  if (!inventory.canAdd(state, ctx, node.itemId)) return fail('Inventory is full.');
  return ok();
}

/** Cycle time after speed perks. */
export function durationOf(state: GameState, ctx: Ctx, node: GatherNodeDef): number {
  return Math.max(500, Math.round(node.durationMs * (1 - progression.perk(state, ctx, 'gather_speed'))));
}

export function start(state: GameState, ctx: Ctx, nodeId: NodeId): Result {
  const check = canGather(state, ctx, nodeId);
  if (!check.ok) return check;
  activity.begin(state, ctx, { kind: 'gather', nodeId, elapsedMs: 0 });
  return ok();
}

export function tick(state: GameState, ctx: Ctx, a: GatherActivity, dtMs: number): void {
  const node = ctx.content.node(a.nodeId);
  const duration = durationOf(state, ctx, node);
  a.elapsedMs += dtMs;
  while (a.elapsedMs >= duration) {
    a.elapsedMs -= duration;
    if (!inventory.add(state, ctx, node.itemId, 1, 'gather')) {
      activity.stop(state, ctx, 'Inventory is full.');
      return;
    }
    skills.addXp(state, ctx, node.skill, node.xp);
    ctx.events.emit('node:gathered', { nodeId: node.id, itemId: node.itemId });
  }
}
