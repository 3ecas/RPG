/** The one place where skill tiers, equipment and buffs are added up. */
import { BALANCE } from '@/content/balance';
import { ARMOR_SLOTS, EQUIP_SLOTS, type SkillId } from '@/types/ids';
import type { StatBlock, WeaponType } from '@/types/content';
import type { GameState } from '@/types/state';
import type { Ctx } from './ctx';
import { maxHpForTier } from './formulas';
import * as progression from './progression';
import { tier } from './skills';

export interface DerivedStats extends StatBlock {
  attackIntervalMs: number;
}

const WEAPON_SKILL: Readonly<Record<WeaponType, SkillId>> = { sword: 'swords', axe: 'axes', dagger: 'daggers' };

/** The combat skill trained by the main-hand weapon, or null when bare-handed. */
export function weaponSkill(state: GameState, ctx: Ctx): SkillId | null {
  const weapon = state.player.equipment.main_hand;
  const type = weapon ? ctx.content.item(weapon).equip?.weaponType : undefined;
  return type ? WEAPON_SKILL[type] : null;
}

export function hasShield(state: GameState, ctx: Ctx): boolean {
  const off = state.player.equipment.off_hand;
  return !!off && ctx.content.item(off).equip?.kind === 'shield';
}

export function armorPiecesWorn(state: GameState): number {
  return ARMOR_SLOTS.filter((slot) => state.player.equipment[slot] !== null).length;
}

export function derive(state: GameState, ctx: Ctx): DerivedStats {
  const skill = weaponSkill(state, ctx);
  const masteryTier = skill ? tier(state, skill) : 0;
  const armorTier = tier(state, 'armor');
  const shieldTier = hasShield(state, ctx) ? tier(state, 'shields') : 0;
  const stats: DerivedStats = {
    attack: BALANCE.MASTERY_ATTACK_PER_TIER * masteryTier,
    strength: BALANCE.MASTERY_STRENGTH_PER_TIER * masteryTier,
    defence: BALANCE.ARMOR_DEFENCE_PER_TIER * armorTier + BALANCE.SHIELD_DEFENCE_PER_TIER * shieldTier,
    magic: 0,
    maxHp: maxHpForTier(tier(state, 'vitality')) + progression.perk(state, ctx, 'max_hp'),
    maxMana: 0,
    attackIntervalMs: BALANCE.UNARMED_ATTACK_INTERVAL_MS,
  };
  for (const slot of EQUIP_SLOTS) {
    const itemId = state.player.equipment[slot];
    if (!itemId) continue;
    const equip = ctx.content.item(itemId).equip;
    if (!equip) continue;
    // An off-hand weapon adds half its stats and does not change attack speed.
    const factor = slot === 'off_hand' && equip.kind === 'weapon' ? 0.5 : 1;
    for (const [stat, value] of Object.entries(equip.stats) as [keyof StatBlock, number][]) stats[stat] += Math.floor(value * factor);
    if (slot === 'main_hand' && equip.attackIntervalMs) stats.attackIntervalMs = equip.attackIntervalMs;
  }
  for (const buff of state.player.buffs) {
    if (buff.expiresAtMs > state.time.nowMs) stats[buff.stat] += buff.amount;
  }
  return stats;
}

/** Keep hp/mana inside their maximums after anything that can change them. */
export function clampVitals(state: GameState, ctx: Ctx): void {
  const stats = derive(state, ctx);
  state.player.hp = Math.min(state.player.hp, stats.maxHp);
  state.player.mana = Math.min(state.player.mana, stats.maxMana);
}
