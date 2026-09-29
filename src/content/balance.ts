/** Every tunable number that is not attached to a specific item, recipe or monster. */
import type { ZoneId } from '@/types/ids';

export const BALANCE = {
  /** Simulation step. */
  TICK_MS: 100,
  /** How much offline time is simulated on load. */
  OFFLINE_CAP_MS: 12 * 60 * 60 * 1000,
  /** Size of a catch-up step during offline simulation. */
  OFFLINE_STEP_MS: 1000,
  /** Cumulative xp needed to reach each tier (index 0 = tier 1). Filling a tier's bar unlocks the next. */
  TIER_XP: [0, 1500, 7000, 25000, 75000, 200000] as readonly number[],
  MAX_TIER: 6,
  /** Distinct item stacks the inventory can hold. */
  INVENTORY_SLOTS: 40,
  /** One hit point regenerates every this many ms. */
  HP_REGEN_MS: 4000,
  UNARMED_ATTACK_INTERVAL_MS: 2400,
  /** Max hp = HP_BASE + HP_PER_TIER × Vitality tier. */
  HP_BASE: 30,
  HP_PER_TIER: 10,
  /** Mastery: each tier of the equipped weapon's skill adds this much accuracy and power. */
  MASTERY_ATTACK_PER_TIER: 3,
  MASTERY_STRENGTH_PER_TIER: 2,
  /** Each tier of Armor adds this much defence; Shields likewise, but only with a shield equipped. */
  ARMOR_DEFENCE_PER_TIER: 2,
  SHIELD_DEFENCE_PER_TIER: 2,
  /** Weapon-skill xp per point of damage dealt; Vitality xp per point of damage dealt. */
  XP_PER_DAMAGE: 4,
  VITALITY_XP_PER_DAMAGE: 1.33,
  /** Armor / Shields xp per incoming attack, multiplied by the monster's tier. */
  ARMOR_XP_PER_ATTACK: 3,
  SHIELD_XP_PER_ATTACK: 4,
  START_ZONE: 'greenhollow' as ZoneId,
  LOG_CAP: 200,
  AUTOSAVE_MS: 30_000,

  /** Market: prices step once per tick, relax toward base value and drift a little. */
  MARKET_TICK_MS: 60_000,
  /** Fraction of the gap to the base value closed per market tick. */
  MARKET_RELAX: 0.03,
  /** Max random price movement per market tick (fraction). */
  MARKET_DRIFT: 0.01,
  /** Price change per unit the player buys (up) or sells (down). */
  MARKET_IMPACT: 0.01,
  /** Buy price = price × (1 + spread), sell price = price × (1 − spread). */
  MARKET_SPREAD: 0.04,
  MARKET_MIN_RATIO: 0.25,
  MARKET_MAX_RATIO: 4,
  /** Barter offers can be taken this many times per rotation unless the offer says otherwise. */
  TRADER_DEFAULT_USES: 3,
} as const;
