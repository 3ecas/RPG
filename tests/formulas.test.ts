import { describe, expect, it } from 'vitest';
import { hitChance, levelForXp, levelProgress, maxHit, xpForLevel } from '@/systems/formulas';

describe('xp curve', () => {
  it('matches the classic table at known points', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(83);
    expect(xpForLevel(10)).toBe(1154);
    expect(xpForLevel(50)).toBe(101333);
    expect(xpForLevel(99)).toBe(13034431);
  });

  it('levelForXp is the inverse of xpForLevel', () => {
    for (let level = 1; level <= 99; level++) {
      expect(levelForXp(xpForLevel(level))).toBe(level);
      if (level > 1) expect(levelForXp(xpForLevel(level) - 1)).toBe(level - 1);
    }
    expect(levelForXp(1e12)).toBe(99);
  });

  it('progress stays within 0..1', () => {
    expect(levelProgress(0)).toBe(0);
    expect(levelProgress(xpForLevel(5))).toBe(0);
    expect(levelProgress(xpForLevel(99) * 2)).toBe(1);
    expect(levelProgress(50)).toBeGreaterThan(0.5);
  });
});

describe('combat formulas', () => {
  it('hit chance is 50% at parity and clamped', () => {
    expect(hitChance(10, 10)).toBeCloseTo(0.5);
    expect(hitChance(1000, 0)).toBe(0.95);
    expect(hitChance(1, 1000)).toBe(0.05);
  });

  it('max hit never drops below 1 and grows with strength', () => {
    expect(maxHit(0)).toBe(1);
    expect(maxHit(35)).toBeGreaterThan(maxHit(10));
  });
});
