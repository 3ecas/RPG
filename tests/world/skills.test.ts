import { describe, expect, it } from 'vitest';
import { cookChance, GATHER_TICKS_FLOOR, gatherTicks, levelForTier, levelOf, MAX_LEVEL, MAX_XP, progressOf, xpForLevel } from '@/world/skills';
import { deriveStats, regenInterval, slotsFor, weaponSkillFor } from '@/world/stats';
import type { SkillId } from '@/types/ids';

describe('skills: cooking', () => {
  it('burns a third at the level the food opens at, less with every level, and never nothing', () => {
    expect(cookChance(1, 1)).toBeCloseTo(0.66);
    expect(cookChance(15, 15)).toBeCloseTo(0.66);
    expect(cookChance(21, 1)).toBeCloseTo(0.86);
    expect(cookChance(60, 1)).toBe(0.98);
    expect(cookChance(1, 15)).toBeCloseTo(0.66);
  });
});

describe('skills: the curve', () => {
  it('is the classic one', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(83);
    expect(xpForLevel(3)).toBe(174);
    expect(xpForLevel(10)).toBe(1154);
    expect(xpForLevel(15)).toBe(2411);
    expect(xpForLevel(50)).toBe(101_333);
    expect(xpForLevel(92)).toBe(6_517_253); // half way to 99, famously
    expect(xpForLevel(99)).toBe(13_034_431);
    expect(xpForLevel(100)).toBe(14_391_160);
    expect(MAX_LEVEL).toBe(100);
    expect(MAX_XP).toBe(xpForLevel(MAX_LEVEL));
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(150)).toBe(MAX_XP);
  });

  it('turns xp into a level and the way to the next', () => {
    expect(levelOf(0)).toBe(1);
    expect(levelOf(82)).toBe(1);
    expect(levelOf(83)).toBe(2);
    expect(levelOf(2410)).toBe(14);
    expect(levelOf(2411)).toBe(15);
    expect(levelOf(xpForLevel(99))).toBe(99);
    expect(levelOf(MAX_XP)).toBe(100);
    expect(levelOf(MAX_XP * 2)).toBe(100);
    expect(progressOf(100)).toEqual({ level: 2, into: 17, span: 91 });
    expect(progressOf(MAX_XP)).toEqual({ level: 100, into: 0, span: 0 });
  });

  it('opens each tier at its level band', () => {
    expect([1, 2, 3, 4, 5, 6].map((t) => levelForTier(t as 1))).toEqual([1, 15, 30, 50, 70, 85]);
  });
});

describe('skills: gathering', () => {
  const oak = { tier: 1 as const };
  const willow = { tier: 2 as const };
  const elder = { tier: 6 as const };
  it('takes 250 ticks an item at level 1 and 50 at level 100, longer on harder nodes, quicker with better tools, never under the floor', () => {
    expect(gatherTicks(oak, 1, 1)).toBe(250);
    expect(gatherTicks(oak, 25, 1)).toBe(202);
    expect(gatherTicks(oak, 50, 1)).toBe(151);
    expect(gatherTicks(oak, 100, 1)).toBe(50);
    expect(gatherTicks(oak, 0, 0)).toBe(250); // no tool counts as a basic one where none is needed
    expect(gatherTicks(oak, 999, 1)).toBe(50);
    expect(gatherTicks(willow, 15, 1)).toBe(266);
    expect(gatherTicks(elder, 85, 1)).toBe(161);
    expect(gatherTicks(oak, 1, 6)).toBe(125);
    expect(gatherTicks(oak, 100, 6)).toBe(GATHER_TICKS_FLOOR);
    expect(gatherTicks(elder, 100, 6)).toBe(50);
  });
});

describe('stats', () => {
  const level = (levels: Partial<Record<SkillId, number>>) => (skill: SkillId) => levels[skill] ?? 1;
  const sword = { kind: 'weapon' as const, weaponType: 'sword' as const, stats: { attack: 5 } };
  const bow = { kind: 'weapon' as const, weaponType: 'bow' as const, stats: { attack: 4 } };
  const helmet = { kind: 'head' as const, stats: { armor: 3 } };
  const tome = { kind: 'book' as const, stats: { spellPower: 2, mana: 3 } };
  const ring = { kind: 'trinket' as const, stats: { attack: 2 } };

  it('starts from the base numbers at level 1 with nothing on, and grows one per level', () => {
    expect(deriveStats(level({}), [])).toEqual({ maxHp: 11, maxMana: 6, armor: 0, attack: 1, spellPower: 0 });
    expect(deriveStats(level({ vitality: 50, spirit: 20, magic: 10 }), [])).toEqual({ maxHp: 60, maxMana: 25, armor: 0, attack: 1, spellPower: 9 });
  });

  it('adds what is worn, the weapon scaled by its own skill', () => {
    expect(deriveStats(level({}), [sword, helmet, tome, ring])).toEqual({ maxHp: 11, maxMana: 9, armor: 3, attack: 8, spellPower: 2 });
    expect(deriveStats(level({ hand_weapons: 41 }), [sword]).attack).toBe(1 + 7); // 5 × 1.4
    expect(deriveStats(level({ hand_weapons: 41 }), [bow]).attack).toBe(1 + 4); // a bow is the Bows skill's
    expect(deriveStats(level({ bows: 51 }), [bow]).attack).toBe(1 + 6);
    expect(weaponSkillFor('staff')).toBe('magic');
    expect(weaponSkillFor(undefined)).toBe('hand_weapons');
  });

  it('regenerates faster every ten levels, and knows where gear goes', () => {
    expect([1, 9, 10, 50, 99, 100].map(regenInterval)).toEqual([12, 12, 11, 7, 3, 2]);
    expect(slotsFor('weapon')).toEqual(['main_hand']);
    expect(slotsFor('shield')).toEqual(['off_hand']);
    expect(slotsFor('book')).toEqual(['off_hand']);
    expect(slotsFor('trinket')).toEqual(['trinket_1', 'trinket_2']);
    expect(slotsFor('feet')).toEqual(['feet']);
  });
});
