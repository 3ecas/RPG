/** Starting and stopping the player's single current activity. The per-tick logic lives in tick.ts. */
import type { Activity, GameState } from '@/types/state';
import type { Ctx } from './ctx';
import * as crafting from './crafting';
import * as gathering from './gathering';

export function begin(state: GameState, ctx: Ctx, next: Activity): void {
  if (state.activity) stop(state, ctx, 'Switched activity.');
  state.activity = next;
  ctx.events.emit('activity:started', { activity: next });
}

export function stop(state: GameState, ctx: Ctx, reason: string): void {
  if (!state.activity) return;
  state.activity = null;
  state.combat = null;
  ctx.events.emit('activity:stopped', { reason });
}

export interface ActivityView {
  label: string;
  detail: string;
  /** 0..1 progress of the current cycle. */
  progress: number;
}

/** A description of the current activity for the sidebar. */
export function describe(state: GameState, ctx: Ctx): ActivityView | null {
  const a = state.activity;
  if (!a) return null;
  switch (a.kind) {
    case 'gather': {
      const node = ctx.content.node(a.nodeId);
      const skill = ctx.content.skill(node.skill);
      return { label: `${skill.verb} ${node.name}`, detail: `${ctx.content.item(node.itemId).name} · ${node.xp} ${skill.name} xp`, progress: a.elapsedMs / gathering.durationOf(state, ctx, node) };
    }
    case 'craft': {
      const recipe = ctx.content.recipe(a.recipeId);
      const station = ctx.content.station(recipe.station);
      return { label: `${station.verb} ${ctx.content.recipeName(recipe)}`, detail: `${a.remaining} left`, progress: a.elapsedMs / crafting.durationOf(state, ctx, recipe) };
    }
    case 'combat': {
      const monster = ctx.content.monster(a.monsterId);
      const c = state.combat;
      return { label: `Fighting ${monster.name}`, detail: c ? `${c.monsterHp}/${monster.hp} hp · ${c.kills} kills` : '', progress: c ? c.monsterHp / monster.hp : 0 };
    }
  }
}
