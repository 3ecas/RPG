/**
 * The campaign. Missions of the current chapter track objectives from events;
 * claiming a finished mission pays out, and a fully claimed chapter opens the next.
 */
import type { ChapterDef, Keyed, MissionDef } from '@/types/content';
import type { MissionId } from '@/types/ids';
import type { GameState } from '@/types/state';
import { fail, ok, type Result } from '@/types/result';
import type { Ctx, SystemListeners } from './ctx';
import * as inventory from './inventory';
import { log } from './log';
import * as objectives from './objectives';
import * as skills from './skills';

export function isClaimed(state: GameState, missionId: MissionId): boolean {
  return state.missions.claimed.includes(missionId);
}

/** The lowest chapter with an unclaimed mission; past the last chapter when everything is done. */
export function currentChapter(state: GameState, ctx: Ctx): number {
  for (const chapter of ctx.content.chapters) {
    if (ctx.content.missionsInChapter(chapter.number).some((m) => !isClaimed(state, m.id))) return chapter.number;
  }
  return ctx.content.chapters.length + 1;
}

export function chapterStatus(state: GameState, ctx: Ctx, chapter: number): 'done' | 'current' | 'locked' {
  const current = currentChapter(state, ctx);
  return chapter < current ? 'done' : chapter === current ? 'current' : 'locked';
}

export function objectiveViews(state: GameState, ctx: Ctx, missionId: MissionId): objectives.ObjectiveView[] {
  const mission = ctx.content.mission(missionId);
  const counts = state.missions.counts[missionId] ?? [];
  return mission.objectives.map((o, i) => objectives.view(state, ctx, o, counts[i] ?? 0));
}

export function isComplete(state: GameState, ctx: Ctx, missionId: MissionId): boolean {
  return objectiveViews(state, ctx, missionId).every((o) => o.done);
}

export function canClaim(state: GameState, ctx: Ctx, missionId: MissionId): Result {
  const mission = ctx.content.mission(missionId);
  if (isClaimed(state, missionId)) return fail('Already claimed.');
  if (chapterStatus(state, ctx, mission.chapter) !== 'current') return fail('This chapter is not open yet.');
  if (!isComplete(state, ctx, missionId)) return fail('Not finished yet.');
  const rewardItems = mission.rewards.flatMap((r) => (r.type === 'item' ? [{ itemId: r.itemId, qty: r.qty }] : []));
  if (!inventory.canAddAll(state, ctx, rewardItems)) return fail('Make room in your bag for the reward first.');
  return ok();
}

export function claim(state: GameState, ctx: Ctx, missionId: MissionId): Result {
  const check = canClaim(state, ctx, missionId);
  if (!check.ok) return check;
  const mission = ctx.content.mission(missionId);
  const before = currentChapter(state, ctx);
  for (const o of mission.objectives) {
    if (o.type === 'collect') inventory.removeAll(state, ctx, [{ itemId: o.itemId, qty: o.count }]);
  }
  const granted: string[] = [];
  for (const r of mission.rewards) {
    switch (r.type) {
      case 'gold': state.player.gold += r.amount; granted.push(`${r.amount} gold`); break;
      case 'item': inventory.add(state, ctx, r.itemId, r.qty, 'mission'); granted.push(`${r.qty}× ${ctx.content.item(r.itemId).name}`); break;
      case 'xp': skills.addXp(state, ctx, r.skill, r.amount); granted.push(`${r.amount} ${ctx.content.skill(r.skill).name} xp`); break;
      case 'points': granted.push(`${r.amount} progression point${r.amount === 1 ? '' : 's'}`); break;
    }
  }
  state.missions.claimed.push(missionId);
  delete state.missions.counts[missionId];
  log(state, ctx, 'quest', `Mission complete: ${mission.name}. Reward: ${granted.join(', ')}.`);
  ctx.events.emit('mission:claimed', { missionId });
  const after = currentChapter(state, ctx);
  if (after > before) {
    const chapter = ctx.content.chapters[after - 1];
    log(state, ctx, 'quest', chapter ? `Chapter ${chapter.number} opened: ${chapter.name}.` : 'Every chapter is complete. The road ends here, for now.');
    ctx.events.emit('chapter:opened', { chapter: after });
  }
  return ok();
}

/** Missions of the open chapter that are not claimed yet. */
export function active(state: GameState, ctx: Ctx): Keyed<MissionDef, MissionId>[] {
  const chapter = currentChapter(state, ctx);
  return ctx.content.missionsInChapter(chapter).filter((m) => !isClaimed(state, m.id));
}

export function chapter(ctx: Ctx, number: number): ChapterDef | undefined {
  return ctx.content.chapters[number - 1];
}

function advance(state: GameState, ctx: Ctx, tick: objectives.Tick): void {
  for (const mission of active(state, ctx)) {
    const wasComplete = isComplete(state, ctx, mission.id);
    const counts = state.missions.counts[mission.id] ?? mission.objectives.map(() => 0);
    let changed = false;
    mission.objectives.forEach((o, i) => {
      if (!objectives.matches(o, tick)) return;
      const current = counts[i] ?? 0;
      if (current >= objectives.target(o)) return;
      counts[i] = current + 1;
      changed = true;
    });
    if (!changed) continue;
    state.missions.counts[mission.id] = counts;
    ctx.events.emit('mission:progress', { missionId: mission.id });
    if (!wasComplete && isComplete(state, ctx, mission.id)) log(state, ctx, 'quest', `Mission ready to claim: ${mission.name}.`);
  }
}

export const listeners: SystemListeners = objectives.listenersFor(advance);
