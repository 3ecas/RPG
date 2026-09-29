/** Every formula in the game. Numbers that are merely tuned live in content/balance.ts. */
import { BALANCE } from '@/content/balance';

/** XP_TABLE[level] = total xp needed to reach that level. Classic exponential curve: level 2 = 83, 50 ≈ 101k, 99 ≈ 13M. */
const XP_TABLE: number[] = (() => {
  const table = [0, 0];
  let points = 0;
  for (let level = 1; level < BALANCE.MAX_LEVEL; level++) {
    points += Math.floor(level + 300 * Math.pow(2, level / 7));
    table[level + 1] = Math.floor(points / 4);
  }
  return table;
})();

export function xpForLevel(level: number): number {
  const clamped = Math.min(BALANCE.MAX_LEVEL, Math.max(1, Math.floor(level)));
  return XP_TABLE[clamped] ?? 0;
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < BALANCE.MAX_LEVEL && xp >= (XP_TABLE[level + 1] ?? Infinity)) level++;
  return level;
}

/** Fraction of the way from the current level to the next, 0..1. */
export function levelProgress(xp: number): number {
  const level = levelForXp(xp);
  if (level >= BALANCE.MAX_LEVEL) return 1;
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return Math.min(1, Math.max(0, (xp - from) / (to - from)));
}

/** Chance that an attack with `attack` accuracy lands on `defence`. Equal values = 50%. */
export function hitChance(attack: number, defence: number): number {
  const a = Math.max(1, attack);
  const d = Math.max(0, defence);
  return Math.min(0.95, Math.max(0.05, a / (a + d)));
}

export function maxHit(strength: number): number {
  return Math.max(1, Math.floor(1.5 + strength * 0.5));
}

export function maxHpForLevel(hitpointsLevel: number): number {
  return hitpointsLevel * BALANCE.HP_PER_LEVEL;
}

export function combatXpForDamage(damage: number): { style: number; hitpoints: number } {
  return { style: damage * BALANCE.XP_PER_DAMAGE, hitpoints: damage * BALANCE.HITPOINTS_XP_PER_DAMAGE };
}
