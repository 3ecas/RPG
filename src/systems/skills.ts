import { TIER_NAMES } from '@/content/tiers';
import type { Tier } from '@/types/content';
import type { GameState } from '@/types/state';
import type { SkillId } from '@/types/ids';
import type { Ctx } from './ctx';
import { tierForXp, tierProgress, xpForTier } from './formulas';
import { log } from './log';
import * as progression from './progression';

export function tier(state: GameState, skill: SkillId): Tier {
  return tierForXp(state.player.skills[skill].xp);
}

/** Sum of all skill tiers, the headline progression number. */
export function totalTier(state: GameState, ctx: Ctx): number {
  return ctx.content.skillIds.reduce((sum, id) => sum + tier(state, id), 0);
}

/** Group perks from the progression tree multiply the xp. */
export function addXp(state: GameState, ctx: Ctx, skill: SkillId, baseAmount: number): void {
  if (baseAmount <= 0) return;
  const amount = baseAmount * progression.xpMultiplier(state, ctx, ctx.content.skill(skill).group);
  const before = tier(state, skill);
  state.player.skills[skill].xp += amount;
  ctx.events.emit('skill:xp', { skill, xp: amount });
  const after = tier(state, skill);
  for (let reached = before + 1; reached <= after; reached++) {
    ctx.events.emit('skill:tierup', { skill, tier: reached });
  }
  if (after > before) log(state, ctx, 'level', `${ctx.content.skill(skill).name} reached tier ${after}: ${TIER_NAMES[after]}!`);
}

export interface SkillView {
  id: SkillId;
  name: string;
  tier: Tier;
  tierName: string;
  xp: number;
  /** Xp earned within the current tier. */
  xpIntoTier: number;
  /** Size of the current tier's bar, or null at the max tier. */
  tierSize: number | null;
  progress: number;
}

export function view(state: GameState, ctx: Ctx, skill: SkillId): SkillView {
  const xp = state.player.skills[skill].xp;
  const current = tierForXp(xp);
  const from = xpForTier(current);
  const next = xpForTier(current + 1);
  return {
    id: skill,
    name: ctx.content.skill(skill).name,
    tier: current,
    tierName: TIER_NAMES[current],
    xp,
    xpIntoTier: xp - from,
    tierSize: next > from ? next - from : null,
    progress: tierProgress(xp),
  };
}
