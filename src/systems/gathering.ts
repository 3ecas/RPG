/** Mining, woodcutting, fishing: one system, the node's data decides the skill. */
import type { NodeId } from '@/types/ids';
import type { Activity, GameState } from '@/types/state';
import { fail, ok, type Result } from '@/types/result';
import * as activity from './activity';
import type { Ctx } from './ctx';
import * as inventory from './inventory';
import * as skills from './skills';

type GatherActivity = Extract<Activity, { kind: 'gather' }>;

export function canGather(state: GameState, ctx: Ctx, nodeId: NodeId): Result {
  const node = ctx.content.node(nodeId);
  const zone = ctx.content.zone(state.player.zoneId);
  if (!zone.nodes.includes(nodeId)) return fail(`There is no ${node.name} in ${zone.name}.`);
  if (skills.level(state, node.skill) < node.level) return fail(`Requires ${ctx.content.skill(node.skill).name} level ${node.level}.`);
  if (!inventory.canAdd(state, node.itemId)) return fail('Inventory is full.');
  return ok();
}

export function start(state: GameState, ctx: Ctx, nodeId: NodeId): Result {
  const check = canGather(state, ctx, nodeId);
  if (!check.ok) return check;
  activity.begin(state, ctx, { kind: 'gather', nodeId, elapsedMs: 0 });
  return ok();
}

export function tick(state: GameState, ctx: Ctx, a: GatherActivity, dtMs: number): void {
  const node = ctx.content.node(a.nodeId);
  a.elapsedMs += dtMs;
  while (a.elapsedMs >= node.durationMs) {
    a.elapsedMs -= node.durationMs;
    if (!inventory.add(state, ctx, node.itemId, 1, 'gather')) {
      activity.stop(state, ctx, 'Inventory is full.');
      return;
    }
    skills.addXp(state, ctx, node.skill, node.xp);
    ctx.events.emit('node:gathered', { nodeId: node.id, itemId: node.itemId });
  }
}
