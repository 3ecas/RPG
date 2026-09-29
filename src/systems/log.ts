/** The player-facing message log. Systems call this instead of console.log. */
import { BALANCE } from '@/content/balance';
import type { GameState, LogKind } from '@/types/state';
import type { Ctx } from './ctx';

export function log(state: GameState, ctx: Ctx, kind: LogKind, text: string): void {
  state.log.push({ t: state.time.nowMs, kind, text });
  if (state.log.length > BALANCE.LOG_CAP + 50) state.log.splice(0, state.log.length - BALANCE.LOG_CAP);
  ctx.events.emit('log', { kind, text });
}
