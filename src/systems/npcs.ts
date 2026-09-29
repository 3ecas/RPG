import type { Keyed, NpcDef } from '@/types/content';
import type { NpcId } from '@/types/ids';
import type { GameState } from '@/types/state';
import { fail, ok, type Result } from '@/types/result';
import type { Ctx } from './ctx';

export function here(state: GameState, ctx: Ctx): Keyed<NpcDef, NpcId>[] {
  return ctx.content.zone(state.player.zoneId).npcs.map((id) => ctx.content.npc(id));
}

export function isHere(state: GameState, ctx: Ctx, npcId: NpcId): boolean {
  return ctx.content.zone(state.player.zoneId).npcs.includes(npcId);
}

export function talk(state: GameState, ctx: Ctx, npcId: NpcId): Result {
  if (!isHere(state, ctx, npcId)) return fail(`${ctx.content.npc(npcId).name} is not here.`);
  if (!state.world.talkedTo.includes(npcId)) state.world.talkedTo.push(npcId);
  ctx.events.emit('npc:talked', { npcId });
  return ok();
}
