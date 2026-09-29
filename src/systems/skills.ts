import type { GameState } from '@/types/state';
import type { SkillId } from '@/types/ids';
import type { Ctx } from './ctx';
import { levelForXp, levelProgress, xpForLevel } from './formulas';
import { log } from './log';

export function level(state: GameState, skill: SkillId): number {
  return levelForXp(state.player.skills[skill].xp);
}

export function totalLevel(state: GameState, ctx: Ctx): number {
  return ctx.content.skillIds.reduce((sum, id) => sum + level(state, id), 0);
}

export function addXp(state: GameState, ctx: Ctx, skill: SkillId, amount: number): void {
  if (amount <= 0) return;
  const before = level(state, skill);
  state.player.skills[skill].xp += amount;
  ctx.events.emit('skill:xp', { skill, xp: amount });
  const after = level(state, skill);
  for (let reached = before + 1; reached <= after; reached++) {
    ctx.events.emit('skill:levelup', { skill, level: reached });
  }
  if (after > before) log(state, ctx, 'level', `${ctx.content.skill(skill).name} level ${after}!`);
}

export interface SkillView {
  id: SkillId;
  name: string;
  level: number;
  xp: number;
  xpForNext: number | null;
  progress: number;
}

export function view(state: GameState, ctx: Ctx, skill: SkillId): SkillView {
  const xp = state.player.skills[skill].xp;
  const lvl = levelForXp(xp);
  const next = xpForLevel(lvl + 1);
  return {
    id: skill,
    name: ctx.content.skill(skill).name,
    level: lvl,
    xp,
    xpForNext: next > xp ? next : null,
    progress: levelProgress(xp),
  };
}
