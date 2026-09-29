/** The journal. Objectives advance by listening to events; nothing else knows quests exist. */
import type { Keyed, Objective, QuestDef } from '@/types/content';
import type { NpcId, QuestId } from '@/types/ids';
import type { GameState } from '@/types/state';
import { fail, ok, type Result } from '@/types/result';
import type { Ctx, SystemListeners } from './ctx';
import * as inventory from './inventory';
import { log } from './log';
import * as npcs from './npcs';
import * as requirements from './requirements';
import * as skills from './skills';

export type QuestStatus = 'available' | 'locked' | 'active' | 'completed';

export function status(state: GameState, ctx: Ctx, questId: QuestId): QuestStatus {
  if (state.quests.completed.includes(questId)) return 'completed';
  if (state.quests.active[questId]) return 'active';
  return requirements.check(state, ctx, ctx.content.quest(questId).prerequisites).ok ? 'available' : 'locked';
}

export function byGiver(state: GameState, ctx: Ctx, npcId: NpcId): { quest: Keyed<QuestDef, QuestId>; status: QuestStatus }[] {
  return ctx.content.questsByGiver(npcId).map((quest) => ({ quest, status: status(state, ctx, quest.id) }));
}

export function accept(state: GameState, ctx: Ctx, questId: QuestId): Result {
  const quest = ctx.content.quest(questId);
  const current = status(state, ctx, questId);
  if (current === 'active') return fail('You already have that quest.');
  if (current === 'completed') return fail('You already completed that quest.');
  if (!npcs.isHere(state, ctx, quest.giverId)) return fail(`${ctx.content.npc(quest.giverId).name} is not here.`);
  const prereqs = requirements.check(state, ctx, quest.prerequisites);
  if (!prereqs.ok) return prereqs;
  state.quests.active[questId] = { counts: quest.objectives.map(() => 0) };
  ctx.events.emit('quest:accepted', { questId });
  log(state, ctx, 'quest', `Quest accepted: ${quest.name}.`);
  return ok();
}

export interface ObjectiveView {
  text: string;
  current: number;
  target: number;
  done: boolean;
}

export function objectives(state: GameState, ctx: Ctx, questId: QuestId): ObjectiveView[] {
  const quest = ctx.content.quest(questId);
  const counts = state.quests.active[questId]?.counts ?? quest.objectives.map(() => 0);
  return quest.objectives.map((o, i) => {
    const counted = Math.min(counts[i] ?? 0, target(o));
    switch (o.type) {
      case 'kill': return view(`Defeat ${o.count}× ${ctx.content.monster(o.monsterId).name}`, counted, o.count);
      case 'craft': return view(`Craft ${o.count}× ${ctx.content.recipeName(ctx.content.recipe(o.recipeId))}`, counted, o.count);
      case 'collect': return view(`Bring ${o.count}× ${ctx.content.item(o.itemId).name}`, Math.min(inventory.count(state, o.itemId), o.count), o.count);
      case 'reach_tier': return view(`Reach ${ctx.content.skill(o.skill).name} tier ${o.tier}`, Math.min(skills.tier(state, o.skill), o.tier), o.tier);
      case 'talk': return view(`Talk to ${ctx.content.npc(o.npcId).name}`, state.world.talkedTo.includes(o.npcId) ? 1 : 0, 1);
    }
  });
}

function view(text: string, current: number, targetValue: number): ObjectiveView {
  return { text, current, target: targetValue, done: current >= targetValue };
}

function target(o: Objective): number {
  switch (o.type) {
    case 'kill':
    case 'craft':
    case 'collect': return o.count;
    case 'reach_tier': return o.tier;
    case 'talk': return 1;
  }
}

export function isComplete(state: GameState, ctx: Ctx, questId: QuestId): boolean {
  return !!state.quests.active[questId] && objectives(state, ctx, questId).every((o) => o.done);
}

export function canTurnIn(state: GameState, ctx: Ctx, questId: QuestId): Result {
  const quest = ctx.content.quest(questId);
  if (!state.quests.active[questId]) return fail('That quest is not active.');
  if (!isComplete(state, ctx, questId)) return fail('The quest is not finished yet.');
  if (!npcs.isHere(state, ctx, quest.giverId)) return fail(`Return to ${ctx.content.npc(quest.giverId).name} to turn this in.`);
  const rewardItems = quest.rewards.flatMap((r) => (r.type === 'item' ? [{ itemId: r.itemId, qty: r.qty }] : []));
  if (!inventory.canAddAll(state, rewardItems)) return fail('Make room in your inventory for the reward first.');
  return ok();
}

export function turnIn(state: GameState, ctx: Ctx, questId: QuestId): Result {
  const check = canTurnIn(state, ctx, questId);
  if (!check.ok) return check;
  const quest = ctx.content.quest(questId);
  for (const o of quest.objectives) {
    if (o.type === 'collect') inventory.removeAll(state, ctx, [{ itemId: o.itemId, qty: o.count }]);
  }
  const granted: string[] = [];
  for (const r of quest.rewards) {
    switch (r.type) {
      case 'gold': state.player.gold += r.amount; granted.push(`${r.amount} gold`); break;
      case 'item': inventory.add(state, ctx, r.itemId, r.qty, 'quest'); granted.push(`${r.qty}× ${ctx.content.item(r.itemId).name}`); break;
      case 'xp': skills.addXp(state, ctx, r.skill, r.amount); granted.push(`${r.amount} ${ctx.content.skill(r.skill).name} xp`); break;
    }
  }
  delete state.quests.active[questId];
  state.quests.completed.push(questId);
  log(state, ctx, 'quest', `${ctx.content.npc(quest.giverId).name}: "${quest.completionText}"`);
  log(state, ctx, 'quest', `Quest complete: ${quest.name}. Reward: ${granted.join(', ')}.`);
  ctx.events.emit('quest:completed', { questId });
  return ok();
}

/** Bumps the counter of every active objective that `matches`, and announces quests that just became complete. */
function advance(state: GameState, ctx: Ctx, matches: (o: Objective) => boolean): void {
  for (const [id, progress] of Object.entries(state.quests.active)) {
    const questId = id as QuestId;
    if (!progress) continue;
    const quest = ctx.content.quest(questId);
    const wasComplete = isComplete(state, ctx, questId);
    let changed = false;
    quest.objectives.forEach((o, i) => {
      if (!matches(o)) return;
      const current = progress.counts[i] ?? 0;
      if (current >= target(o)) return;
      progress.counts[i] = current + 1;
      changed = true;
    });
    if (!changed) continue;
    ctx.events.emit('quest:progress', { questId });
    if (!wasComplete && isComplete(state, ctx, questId)) log(state, ctx, 'quest', `Ready to turn in: ${quest.name}.`);
  }
}

export const listeners: SystemListeners = {
  'monster:killed': (state, ctx, e) => advance(state, ctx, (o) => o.type === 'kill' && o.monsterId === e.monsterId),
  'recipe:crafted': (state, ctx, e) => advance(state, ctx, (o) => o.type === 'craft' && o.recipeId === e.recipeId),
  'npc:talked': (state, ctx, e) => advance(state, ctx, (o) => o.type === 'talk' && o.npcId === e.npcId),
};
