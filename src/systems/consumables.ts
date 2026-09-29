/** Food, potions, and the timed buffs they grant. Also passive hp regeneration. */
import { BALANCE } from '@/content/balance';
import type { ItemId } from '@/types/ids';
import type { GameState } from '@/types/state';
import { fail, ok, type Result } from '@/types/result';
import type { Ctx } from './ctx';
import * as inventory from './inventory';
import { log } from './log';
import { derive } from './stats';

export function consume(state: GameState, ctx: Ctx, itemId: ItemId): Result {
  const item = ctx.content.item(itemId);
  if (!item.consume) return fail(`You can't use ${item.name}.`);
  if (inventory.count(state, itemId) < 1) return fail(`You don't have any ${item.name}.`);
  const stats = derive(state, ctx);
  const onlyHeals = item.consume.effects.every((e) => e.type === 'heal');
  if (onlyHeals && state.player.hp >= stats.maxHp) return fail('You are already at full health.');

  inventory.remove(state, ctx, itemId, 1);
  const notes: string[] = [];
  for (const effect of item.consume.effects) {
    switch (effect.type) {
      case 'heal': {
        const before = state.player.hp;
        state.player.hp = Math.min(stats.maxHp, before + effect.amount);
        notes.push(`+${state.player.hp - before} hp`);
        break;
      }
      case 'restore_mana': {
        const before = state.player.mana;
        state.player.mana = Math.min(stats.maxMana, before + effect.amount);
        notes.push(`+${state.player.mana - before} mana`);
        break;
      }
      case 'buff': {
        const expiresAtMs = state.time.nowMs + effect.durationMs;
        const existing = state.player.buffs.find((b) => b.source === itemId && b.stat === effect.stat);
        if (existing) existing.expiresAtMs = Math.max(existing.expiresAtMs, expiresAtMs);
        else state.player.buffs.push({ stat: effect.stat, amount: effect.amount, expiresAtMs, source: itemId });
        notes.push(`+${effect.amount} ${effect.stat}`);
        break;
      }
    }
  }
  log(state, ctx, 'info', `You use ${item.name}. ${notes.join(', ')}.`);
  return ok();
}

export function tickBuffs(state: GameState, ctx: Ctx): void {
  const now = state.time.nowMs;
  const remaining = state.player.buffs.filter((b) => b.expiresAtMs > now);
  if (remaining.length !== state.player.buffs.length) {
    state.player.buffs = remaining;
    ctx.events.emit('state:changed', {});
  }
}

export function tickRegen(state: GameState, ctx: Ctx, dtMs: number): void {
  const maxHp = derive(state, ctx).maxHp;
  if (state.player.hp >= maxHp) {
    state.player.regenMs = 0;
    return;
  }
  state.player.regenMs += dtMs;
  while (state.player.regenMs >= BALANCE.HP_REGEN_MS && state.player.hp < maxHp) {
    state.player.regenMs -= BALANCE.HP_REGEN_MS;
    state.player.hp += 1;
  }
}
