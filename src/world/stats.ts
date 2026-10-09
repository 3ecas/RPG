/**
 * A character's numbers from its levels and what it wears: hit points from
 * Vitality, mana from Spirit, spell power from Magic, armor from gear
 * (shields count), attack from the weapon scaled by the weapon's skill.
 * Pure functions, so the server and the gear panel agree.
 */
import type { EquipInfo, WeaponType } from '@/types/content';
import type { EquipSlot, GearKind, SkillId } from '@/types/ids';

export interface CharacterStats {
  maxHp: number;
  maxMana: number;
  armor: number;
  attack: number;
  spellPower: number;
}

export const BASE_HP = 10;
export const BASE_MANA = 5;
/** Unarmed, you still hit for this. */
export const BASE_ATTACK = 1;

/** The skill that scales a weapon and is trained by it. */
export function weaponSkillFor(type: WeaponType | undefined): SkillId {
  if (type === 'bow') return 'bows';
  if (type === 'staff') return 'magic';
  return 'hand_weapons';
}

/** Hit points and mana grow one per level; attack grows one percent per level of the weapon's skill; spell power one per Magic level. */
export function deriveStats(level: (skill: SkillId) => number, worn: Iterable<EquipInfo>): CharacterStats {
  let hp = 0;
  let mana = 0;
  let armor = 0;
  let attack = 0;
  let spellPower = 0;
  let weapon: EquipInfo | null = null;
  for (const gear of worn) {
    hp += gear.stats.hp ?? 0;
    mana += gear.stats.mana ?? 0;
    armor += gear.stats.armor ?? 0;
    spellPower += gear.stats.spellPower ?? 0;
    if (gear.kind === 'weapon') weapon = gear;
    else attack += gear.stats.attack ?? 0;
  }
  const weaponAttack = weapon ? (weapon.stats.attack ?? 0) * (1 + 0.01 * (level(weaponSkillFor(weapon.weaponType)) - 1)) : 0;
  return {
    maxHp: BASE_HP + level('vitality') + hp,
    maxMana: BASE_MANA + level('spirit') + mana,
    armor,
    attack: BASE_ATTACK + Math.round(weaponAttack + attack),
    spellPower: level('magic') - 1 + spellPower,
  };
}

/** Action ticks between one point of regeneration: twelve at level 1, one fewer every ten levels, never under two. */
export function regenInterval(level: number): number {
  return Math.max(2, 12 - Math.floor(level / 10));
}

/** Where a kind of gear goes; a trinket may go in either trinket slot. */
export function slotsFor(kind: GearKind): readonly EquipSlot[] {
  switch (kind) {
    case 'weapon': return ['main_hand'];
    case 'shield': case 'book': return ['off_hand'];
    case 'trinket': return ['trinket_1', 'trinket_2'];
    default: return [kind];
  }
}

export const SLOT_NAMES: Readonly<Record<EquipSlot, string>> = {
  head: 'Head', body: 'Torso', legs: 'Legs', hands: 'Hands', feet: 'Feet', main_hand: 'Main hand', off_hand: 'Off hand', trinket_1: 'Trinket', trinket_2: 'Trinket',
};
