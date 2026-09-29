/** The one place where levels, equipment and buffs are added up. */
import { BALANCE } from '@/content/balance';
import { EQUIP_SLOTS } from '@/types/ids';
import type { StatBlock } from '@/types/content';
import type { GameState } from '@/types/state';
import type { Ctx } from './ctx';
import { maxHpForLevel } from './formulas';
import { level } from './skills';

export interface DerivedStats extends StatBlock {
  attackIntervalMs: number;
}

export function derive(state: GameState, ctx: Ctx): DerivedStats {
  const stats: DerivedStats = {
    attack: level(state, 'attack'),
    strength: level(state, 'strength'),
    defence: level(state, 'defence'),
    magic: 0,
    maxHp: maxHpForLevel(level(state, 'hitpoints')),
    maxMana: 0,
    attackIntervalMs: BALANCE.UNARMED_ATTACK_INTERVAL_MS,
  };
  for (const slot of EQUIP_SLOTS) {
    const itemId = state.player.equipment[slot];
    if (!itemId) continue;
    const equip = ctx.content.item(itemId).equip;
    if (!equip) continue;
    for (const [stat, value] of Object.entries(equip.stats) as [keyof StatBlock, number][]) stats[stat] += value;
    if (equip.attackIntervalMs) stats.attackIntervalMs = equip.attackIntervalMs;
  }
  for (const buff of state.player.buffs) {
    if (buff.expiresAtMs > state.time.nowMs) stats[buff.stat] += buff.amount;
  }
  return stats;
}

/** Keep hp/mana inside their maximums after anything that can change them. */
export function clampVitals(state: GameState, ctx: Ctx): void {
  const stats = derive(state, ctx);
  state.player.hp = Math.min(state.player.hp, stats.maxHp);
  state.player.mana = Math.min(state.player.mana, stats.maxMana);
}
