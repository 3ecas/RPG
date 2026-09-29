/** The one place where skill tiers, equipment and buffs are added up. */
import { BALANCE } from '@/content/balance';
import { EQUIP_SLOTS, type EquipSlot, type SkillId } from '@/types/ids';
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
const ARMOR_SLOTS: readonly EquipSlot[] = ['head', 'body', 'legs', 'hands', 'feet'];

/** The combat skill trained by the equipped weapon, or null when bare-handed or the skill is still locked. */
export function weaponSkill(state: GameState, ctx: Ctx): SkillId | null {
  const weapon = state.player.equipment.weapon;
  const type = weapon ? ctx.content.item(weapon).equip?.weaponType : undefined;
  const skill = type ? WEAPON_SKILL[type] : null;
  return skill && progression.hasSkill(state, ctx, skill) ? skill : null;
}

export function armorPiecesWorn(state: GameState): number {
  return ARMOR_SLOTS.filter((slot) => state.player.equipment[slot] !== null).length;
}

export function derive(state: GameState, ctx: Ctx): DerivedStats {
  const skill = weaponSkill(state, ctx);
  const masteryTier = skill ? tier(state, skill) : 0;
  // Locked skills give no mastery, even if the gear is somehow worn.
  const armorTier = progression.hasSkill(state, ctx, 'armor') ? tier(state, 'armor') : 0;
  const shieldTier = state.player.equipment.shield && progression.hasSkill(state, ctx, 'shields') ? tier(state, 'shields') : 0;
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
    for (const [stat, value] of Object.entries(equip.stats) as [keyof StatBlock, number][]) stats[stat] += value;
    if (equip.attackIntervalMs) stats.attackIntervalMs = equip.attackIntervalMs;
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
