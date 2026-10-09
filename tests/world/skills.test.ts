import { describe, expect, it } from 'vitest';
import { gatherChance, levelForTier, levelOf, MAX_LEVEL, MAX_XP, progressOf, xpForLevel } from '@/world/skills';

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
    expect(levelOf(MAX_XP)).toBe(99);
    expect(levelOf(MAX_XP * 2)).toBe(99);
    expect(progressOf(100)).toEqual({ level: 2, into: 17, span: 91 });
    expect(progressOf(MAX_XP)).toEqual({ level: 99, into: 0, span: 0 });
  });

  it('opens each tier at its level band', () => {
    expect([1, 2, 3, 4, 5, 6].map((t) => levelForTier(t as 1))).toEqual([1, 15, 30, 50, 70, 85]);
  });
});

describe('skills: gathering', () => {
  const oak = { durationMs: 3000, tier: 1 as const };
  it('succeeds at the node pace for a beginner with a basic tool, faster with levels and a better tool, within bounds', () => {
    expect(gatherChance(oak, 1, 1, 600)).toBeCloseTo(0.2, 9);
    expect(gatherChance(oak, 11, 1, 600)).toBeCloseTo(0.26, 9);
    expect(gatherChance(oak, 1, 6, 600)).toBeCloseTo(0.4, 9);
    expect(gatherChance(oak, 1, 0, 600)).toBeCloseTo(0.2, 9); // no tool counts as a basic one where none is needed
    expect(gatherChance(oak, 99, 6, 600)).toBe(0.95);
    expect(gatherChance({ durationMs: 60_000, tier: 1 }, 1, 1, 600)).toBe(0.05);
    expect(gatherChance({ durationMs: 3500, tier: 2 }, 15, 1, 600)).toBeCloseTo(600 / 3500, 9); // at the band's level the bonus is nil
  });
});
