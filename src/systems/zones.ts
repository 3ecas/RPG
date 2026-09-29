import type { ZoneId } from '@/types/ids';
import type { GameState } from '@/types/state';
import { fail, ok, type Result } from '@/types/result';
import * as activity from './activity';
import type { Ctx, SystemListeners } from './ctx';
import { log } from './log';
import * as requirements from './requirements';

export function isUnlocked(state: GameState, ctx: Ctx, zoneId: ZoneId): Result {
  return requirements.check(state, ctx, ctx.content.zone(zoneId).unlock);
}

export function travel(state: GameState, ctx: Ctx, zoneId: ZoneId): Result {
  if (state.player.zoneId === zoneId) return fail('You are already there.');
  const unlocked = isUnlocked(state, ctx, zoneId);
  if (!unlocked.ok) return unlocked;
  activity.stop(state, ctx, 'You left.');
  state.player.zoneId = zoneId;
  ctx.events.emit('zone:travelled', { zoneId });
  log(state, ctx, 'info', `You travel to ${ctx.content.zone(zoneId).name}.`);
  return ok();
}

/** Announces zones that became reachable since the last check. */
export function checkUnlocks(state: GameState, ctx: Ctx): void {
  for (const zoneId of ctx.content.zoneIds) {
    if (state.world.unlockedZones.includes(zoneId) || !isUnlocked(state, ctx, zoneId).ok) continue;
    state.world.unlockedZones.push(zoneId);
    ctx.events.emit('zone:unlocked', { zoneId });
    if (ctx.content.zone(zoneId).unlock.length > 0) log(state, ctx, 'info', `New area reachable: ${ctx.content.zone(zoneId).name}.`);
  }
}

export const listeners: SystemListeners = {
  'progress:unlocked': (state, ctx) => checkUnlocks(state, ctx),
};
