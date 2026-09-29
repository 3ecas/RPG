/** Smelting, forging, cooking, leatherwork: one system, the recipe's data decides station and skill. */
import type { RecipeDef } from '@/types/content';
import type { RecipeId } from '@/types/ids';
import type { Activity, GameState } from '@/types/state';
import { fail, ok, type Result } from '@/types/result';
import * as activity from './activity';
import type { Ctx } from './ctx';
import * as inventory from './inventory';
import * as progression from './progression';
import * as skills from './skills';

type CraftActivity = Extract<Activity, { kind: 'craft' }>;

export function canCraft(state: GameState, ctx: Ctx, recipeId: RecipeId): Result {
  const recipe = ctx.content.recipe(recipeId);
  const here = ctx.content.zone(state.player.zoneId);
  if (!here.stations.includes(recipe.station)) {
    const elsewhere = ctx.content.zoneIds.map((id) => ctx.content.zone(id)).find((z) => z.stations.includes(recipe.station));
    return fail(`There is no ${ctx.content.station(recipe.station).name} in ${here.name}.${elsewhere ? ` Travel to ${elsewhere.name}.` : ''}`);
  }
  if (skills.tier(state, recipe.skill) < recipe.tier) return fail(`Requires ${ctx.content.skill(recipe.skill).name} tier ${recipe.tier}.`);
  const missing = inventory.missing(state, recipe.inputs);
  if (missing.length > 0) return fail(`Missing: ${missing.map((m) => `${m.qty}× ${ctx.content.item(m.itemId).name}`).join(', ')}.`);
  if (!inventory.canAddAll(state, ctx, recipe.outputs)) return fail('Inventory is full.');
  return ok();
}

/** Cycle time after speed perks. */
export function durationOf(state: GameState, ctx: Ctx, recipe: RecipeDef): number {
  return Math.max(500, Math.round(recipe.durationMs * (1 - progression.perk(state, ctx, 'craft_speed'))));
}

/** How many times the recipe could run with the current inventory. */
export function maxCraftable(state: GameState, ctx: Ctx, recipeId: RecipeId): number {
  const recipe = ctx.content.recipe(recipeId);
  return Math.min(...recipe.inputs.map((s) => Math.floor(inventory.count(state, s.itemId) / s.qty)));
}

export function start(state: GameState, ctx: Ctx, recipeId: RecipeId, count: number): Result {
  const check = canCraft(state, ctx, recipeId);
  if (!check.ok) return check;
  const remaining = Math.max(1, Math.min(Math.floor(count), maxCraftable(state, ctx, recipeId)));
  activity.begin(state, ctx, { kind: 'craft', recipeId, elapsedMs: 0, remaining });
  return ok();
}

export function tick(state: GameState, ctx: Ctx, a: CraftActivity, dtMs: number): void {
  const recipe = ctx.content.recipe(a.recipeId);
  const duration = durationOf(state, ctx, recipe);
  a.elapsedMs += dtMs;
  while (a.elapsedMs >= duration) {
    a.elapsedMs -= duration;
    const check = canCraft(state, ctx, a.recipeId);
    if (!check.ok) {
      activity.stop(state, ctx, check.reason);
      return;
    }
    inventory.removeAll(state, ctx, recipe.inputs);
    for (const out of recipe.outputs) inventory.add(state, ctx, out.itemId, out.qty, 'craft');
    skills.addXp(state, ctx, recipe.skill, recipe.xp);
    ctx.events.emit('recipe:crafted', { recipeId: a.recipeId });
    a.remaining -= 1;
    if (a.remaining <= 0) {
      activity.stop(state, ctx, 'Finished.');
      return;
    }
    const next = canCraft(state, ctx, a.recipeId);
    if (!next.ok) {
      activity.stop(state, ctx, next.reason);
      return;
    }
  }
}
