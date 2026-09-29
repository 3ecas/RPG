import { CONTENT } from '@/content';
import { Registry } from '@/core/registry';
import { Game } from '@/game';
import * as inventory from '@/systems/inventory';
import { xpForTier } from '@/systems/formulas';
import type { ItemId, ProgressNodeId, SkillId } from '@/types/ids';

export const registry = new Registry(CONTENT);

/** Wall-clock stand-in so tests are independent of the real clock. */
export const NOW = 1_700_000_000_000;

export function newGame(seed = 42): Game {
  return Game.newGame(registry, seed, NOW);
}

export function give(game: Game, itemId: ItemId, qty: number): void {
  if (!inventory.add(game.state, game.ctx, itemId, qty, 'test')) throw new Error('test inventory full');
}

export function setTier(game: Game, skill: SkillId, tier: number): void {
  game.state.player.skills[skill].xp = xpForTier(tier);
}

/** Unlocks tree nodes directly, bypassing cost and prerequisites, for tests that are not about the tree. */
export function unlock(game: Game, ...nodeIds: ProgressNodeId[]): void {
  for (const id of nodeIds) if (!game.state.progression.unlocked.includes(id)) game.state.progression.unlocked.push(id);
}

/** Every node of the tree, for tests that need the whole game open. */
export function unlockAll(game: Game): void {
  unlock(game, ...game.content.progressNodeIds);
}

/** Advances the game in 100 ms ticks. */
export function tickFor(game: Game, ms: number): void {
  let remaining = ms;
  while (remaining > 0) {
    const step = Math.min(100, remaining);
    game.tick(step, NOW);
    remaining -= step;
  }
}

/** Ticks until `done` returns true or the time budget runs out. Returns the ms simulated. */
export function tickUntil(game: Game, done: () => boolean, maxMs = 600_000): number {
  let elapsed = 0;
  while (!done() && elapsed < maxMs) {
    game.tick(100, NOW);
    elapsed += 100;
  }
  return elapsed;
}
