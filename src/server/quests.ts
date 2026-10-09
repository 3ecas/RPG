/**
 * Quests as the room keeps them: which are active or done, and how far each
 * objective is. Objectives are of two kinds. Counted ones (kill, gather,
 * craft, talk, visit, trade) advance when the room sees the event. Live
 * ones (have an item, reach a tier, wear a kind of gear) are read off the
 * character whenever it changes. Pure helpers; the room decides when to
 * call them.
 */
import type { QuestView } from '@/net/protocol';
import type { Objective, QuestDef } from '@/types/content';
import type { GearKind, QuestId, SkillId } from '@/types/ids';
import { type Bag, countInBag } from '@/world/bag';
import { levelForTier, levelOf } from '@/world/skills';

export interface QuestProgress {
  status: 'active' | 'done';
  /** One count per objective, in the quest's order. */
  progress: number[];
}

export type QuestState = Partial<Record<QuestId, QuestProgress>>;

/** The kinds of objective that advance on an event, and what the event names. */
export type QuestEventType = 'kill' | 'gather' | 'craft' | 'talk' | 'visit' | 'trade';

/** What a character is, as far as live objectives care. */
export interface LiveCharacter {
  bag: Bag;
  skills: Record<SkillId, number>;
  worn: readonly GearKind[];
}

export function targetOf(o: Objective): number {
  switch (o.type) {
    case 'kill': case 'collect': case 'gather': case 'craft': case 'trade': return o.count;
    default: return 1;
  }
}

/** The id an event must carry to count for this objective, or null for live and unreachable kinds. */
export function eventKey(o: Objective): { type: QuestEventType; key: string } | null {
  switch (o.type) {
    case 'kill': return { type: 'kill', key: o.monsterId };
    case 'gather': return { type: 'gather', key: o.itemId };
    case 'craft': return { type: 'craft', key: o.recipeId };
    case 'talk': return { type: 'talk', key: o.npcId };
    case 'visit': return { type: 'visit', key: o.zoneId };
    case 'trade': return { type: 'trade', key: o.kind };
    default: return null;
  }
}

/** The count a live objective stands at right now, or null for counted kinds. */
export function liveProgress(o: Objective, c: LiveCharacter): number | null {
  switch (o.type) {
    case 'collect': return Math.min(o.count, countInBag(c.bag, o.itemId));
    case 'reach_tier': return levelOf(c.skills[o.skill]) >= levelForTier(o.tier) ? 1 : 0;
    case 'any_tier': return Object.values(c.skills).some((xp) => levelOf(xp) >= levelForTier(o.tier)) ? 1 : 0;
    case 'equip': return c.worn.includes(o.kind) ? 1 : 0;
    default: return null;
  }
}

export function isComplete(def: QuestDef, progress: readonly number[]): boolean {
  return def.objectives.every((o, i) => (progress[i] ?? 0) >= targetOf(o));
}

export function questView(state: QuestState): QuestView[] {
  const out: QuestView[] = [];
  for (const [id, entry] of Object.entries(state)) if (entry) out.push([id, entry.status, [...entry.progress]]);
  return out;
}
