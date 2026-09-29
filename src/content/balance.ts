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
} as const;
