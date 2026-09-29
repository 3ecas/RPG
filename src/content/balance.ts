/** Every tunable number that is not attached to a specific item, recipe or monster. */
import type { ZoneId } from '@/types/ids';

export const BALANCE = {
  /** Simulation step. */
  TICK_MS: 100,
  /** How much offline time is simulated on load. */
  OFFLINE_CAP_MS: 12 * 60 * 60 * 1000,
  /** Size of a catch-up step during offline simulation. */
  OFFLINE_STEP_MS: 1000,
  MAX_LEVEL: 99,
  /** Distinct item stacks the inventory can hold. */
  INVENTORY_SLOTS: 40,
  /** One hit point regenerates every this many ms. */
  HP_REGEN_MS: 4000,
  UNARMED_ATTACK_INTERVAL_MS: 2400,
  /** Hit points per Hitpoints level. */
  HP_PER_LEVEL: 4,
  /** Starting Hitpoints level (like classic RPGs, so a fresh character is not one-shot). */
  STARTING_HITPOINTS_LEVEL: 10,
  /** Combat xp granted to the chosen style per point of damage dealt. */
  XP_PER_DAMAGE: 4,
  HITPOINTS_XP_PER_DAMAGE: 1.33,
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
