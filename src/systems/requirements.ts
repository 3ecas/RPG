/** Shared evaluation of `Requirement` lists: zone unlocks, quest prerequisites. */
import type { Requirement } from '@/types/content';
import type { GameState } from '@/types/state';
import { fail, ok, type Result } from '@/types/result';
import type { Ctx } from './ctx';
import * as inventory from './inventory';
import * as skills from './skills';

export function meets(state: GameState, ctx: Ctx, req: Requirement): boolean {
  switch (req.type) {
    case 'tier': return skills.tier(state, req.skill) >= req.tier;
    case 'any_tier': return ctx.content.skillIds.some((id) => skills.tier(state, id) >= req.tier);
    case 'quest': return state.quests.completed.includes(req.questId);
    case 'item': return inventory.count(state, req.itemId) >= req.qty;
  }
}

export function describe(ctx: Ctx, req: Requirement): string {
  switch (req.type) {
    case 'tier': return `${ctx.content.skill(req.skill).name} tier ${req.tier}`;
    case 'any_tier': return `Any skill at tier ${req.tier}`;
    case 'quest': return `Complete "${ctx.content.quest(req.questId).name}"`;
    case 'item': return `${req.qty}× ${ctx.content.item(req.itemId).name}`;
  }
}

/** Ok when all are met, otherwise the first unmet requirement as the reason. */
export function check(state: GameState, ctx: Ctx, reqs: readonly Requirement[]): Result {
  for (const req of reqs) {
    if (!meets(state, ctx, req)) return fail(`Requires: ${describe(ctx, req)}.`);
  }
  return ok();
}
