/** Every formula in the game. Numbers that are merely tuned live in content/balance.ts. */
import { BALANCE } from '@/content/balance';
import type { Tier } from '@/types/content';

/** The tier a skill is at for a given total xp. */
export function tierForXp(xp: number): Tier {
  let tier = 1;
  while (tier < BALANCE.MAX_TIER && xp >= (BALANCE.TIER_XP[tier] ?? Infinity)) tier += 1;
  return tier as Tier;
}

/** Total xp needed to reach a tier. Tier 1 is 0. */
export function xpForTier(tier: number): number {
  const clamped = Math.min(BALANCE.MAX_TIER, Math.max(1, Math.floor(tier)));
  return BALANCE.TIER_XP[clamped - 1] ?? 0;
}

/** Fraction of the current tier's bar that is filled, 0..1. Full at the max tier. */
export function tierProgress(xp: number): number {
  const tier = tierForXp(xp);
  if (tier >= BALANCE.MAX_TIER) return 1;
  const from = xpForTier(tier);
  const to = xpForTier(tier + 1);
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

export function maxHpForTier(vitalityTier: number): number {
  return BALANCE.HP_BASE + BALANCE.HP_PER_TIER * vitalityTier;
}

/** Xp for dealing damage: the weapon's skill and Vitality. */
export function combatXpForDamage(damage: number): { weapon: number; vitality: number } {
  return { weapon: damage * BALANCE.XP_PER_DAMAGE, vitality: damage * BALANCE.VITALITY_XP_PER_DAMAGE };
}

/** Xp for taking an attack (hit or miss): Armor scales with how much of you is covered, Shields needs a shield. */
export function defenceXpForAttack(monsterTier: number, armorPiecesWorn: number, hasShield: boolean): { armor: number; shields: number } {
  return {
    armor: BALANCE.ARMOR_XP_PER_ATTACK * monsterTier * (armorPiecesWorn / 5),
    shields: hasShield ? BALANCE.SHIELD_XP_PER_ATTACK * monsterTier : 0,
  };
}
