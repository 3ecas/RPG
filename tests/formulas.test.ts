import { describe, expect, it } from 'vitest';
import { BALANCE } from '@/content/balance';
import { defenceXpForAttack, hitChance, maxHit, maxHpForTier, tierForXp, tierProgress, xpForTier } from '@/systems/formulas';

describe('tiers', () => {
  it('maps xp to tiers at the balance thresholds', () => {
    expect(tierForXp(0)).toBe(1);
    expect(tierForXp(1499)).toBe(1);
    expect(tierForXp(1500)).toBe(2);
    expect(tierForXp(7000)).toBe(3);
    expect(tierForXp(25000)).toBe(4);
    expect(tierForXp(75000)).toBe(5);
    expect(tierForXp(200000)).toBe(6);
    expect(tierForXp(1e12)).toBe(6);
  });

  it('xpForTier is the inverse and clamps', () => {
    for (let tier = 1; tier <= 6; tier++) {
      expect(xpForTier(tier)).toBe(BALANCE.TIER_XP[tier - 1]);
      expect(tierForXp(xpForTier(tier))).toBe(tier);
      if (tier > 1) expect(tierForXp(xpForTier(tier) - 1)).toBe(tier - 1);
    }
    expect(xpForTier(0)).toBe(0);
    expect(xpForTier(99)).toBe(200000);
  });

  it('progress fills the current tier bar and stays full at the top', () => {
    expect(tierProgress(0)).toBe(0);
    expect(tierProgress(750)).toBeCloseTo(0.5);
    expect(tierProgress(1500)).toBe(0);
    expect(tierProgress(200000)).toBe(1);
    expect(tierProgress(1e9)).toBe(1);
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

  it('hit points and defence xp follow the tiers', () => {
    expect(maxHpForTier(1)).toBe(40);
    expect(maxHpForTier(6)).toBe(90);
    expect(defenceXpForAttack(2, 5, true)).toEqual({ armor: 6, shields: 8 });
    expect(defenceXpForAttack(2, 0, false)).toEqual({ armor: 0, shields: 0 });
  });
});
