/** One simulation step. Works for any dt, which is what makes offline catch-up a plain big tick. */
import type { GameState } from '@/types/state';
import * as combat from './combat';
import * as consumables from './consumables';
import * as crafting from './crafting';
import type { Ctx } from './ctx';
import * as gathering from './gathering';

export function tick(state: GameState, ctx: Ctx, dtMs: number): void {
  state.time.nowMs += dtMs;
  consumables.tickBuffs(state, ctx);
  consumables.tickRegen(state, ctx, dtMs);

  const a = state.activity;
  if (!a) return;
  switch (a.kind) {
    case 'gather': return gathering.tick(state, ctx, a, dtMs);
    case 'craft': return crafting.tick(state, ctx, a, dtMs);
    case 'combat': return combat.tick(state, ctx, a, dtMs);
  }
}
