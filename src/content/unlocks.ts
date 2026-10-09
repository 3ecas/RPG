/**
 * What every level of every skill gives, generated from the rest of the
 * content: the level a tier's trees, rocks, recipes or gear open at is a
 * milestone, and every level also gives the skill's small bonus. The
 * skills panel shows these; the rules in world/ and server/ apply them.
 */
import { MAX_LEVEL, type SkillUnlock, TIER_LEVELS, type Tier } from '@/types/content';
import type { SkillId } from '@/types/ids';
import { NODES } from './gather-nodes';
import { ITEMS } from './items';
import { RECIPES } from './recipes';
import { SKILLS } from './skills';
import { TIER_NAMES } from './tiers';

/** The bonus every level gives, by skill. */
export const PER_LEVEL: Readonly<Record<SkillId, string>> = {
  lumberjack: 'Each log takes 2 ticks less (250 at level 1, 50 at 100)',
  mining: 'Each ore takes 2 ticks less (250 at level 1, 50 at 100)',
  fishing: 'Each catch takes 2 ticks less (250 at level 1, 50 at 100)',
  harvesting: 'Each pick takes 2 ticks less (250 at level 1, 50 at 100)',
  smithing: '+1% faster work at the furnace and anvil',
  crafting: '+1% faster work at the sawbench and tannery',
  cooking: '+1% less chance to burn what you cook',
  hand_weapons: '+1% damage with swords, axes and daggers',
  bows: '+1% damage with bows',
  vitality: '+1 max HP',
  spirit: '+1 max mana',
  magic: '+1 spell power',
  witchcraft: '+1% potion strength',
};

function tierOfLevel(level: number): Tier | null {
  const index = TIER_LEVELS.indexOf(level);
  return index >= 0 ? ((index + 1) as Tier) : null;
}

function build(): Readonly<Record<SkillId, readonly SkillUnlock[]>> {
  const out = {} as Record<SkillId, SkillUnlock[]>;
  for (const skill of Object.keys(SKILLS) as SkillId[]) {
    const milestones = new Map<number, string[]>();
    const add = (tier: Tier, text: string) => {
      const level = TIER_LEVELS[tier - 1]!;
      const list = milestones.get(level) ?? [];
      if (!list.includes(text)) list.push(text);
      milestones.set(level, list);
    };
    for (const node of Object.values(NODES)) if (node.skill === skill) add(node.tier, node.name);
    for (const recipe of Object.values(RECIPES)) if (recipe.skill === skill) add(recipe.tier, recipe.name ?? ITEMS[recipe.outputs[0]!.itemId].name);
    for (const item of Object.values(ITEMS)) for (const req of item.equip?.requirements ?? []) if (req.skill === skill) add(req.tier, item.name);
    if (skill === 'witchcraft') for (const tier of [1, 2, 3, 4, 5, 6] as const) add(tier, `${TIER_NAMES[tier]} brews`);
    const list: SkillUnlock[] = [];
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const opened = milestones.get(level);
      const extra = (skill === 'vitality' || skill === 'spirit') && level % 10 === 0 ? `${skill === 'vitality' ? 'HP' : 'Mana'} comes back faster` : null;
      const parts = [...(opened ? [`Opens: ${opened.join(', ')}`] : []), PER_LEVEL[skill], ...(extra ? [extra] : [])];
      list.push({ level, text: parts.join(' · ') });
    }
    out[skill] = list;
    void tierOfLevel;
  }
  return out;
}

export const UNLOCKS = build();
