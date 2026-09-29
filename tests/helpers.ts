import { CONTENT } from '@/content';
import { Registry } from '@/core/registry';
import { Game } from '@/game';
import * as inventory from '@/systems/inventory';
import { xpForLevel } from '@/systems/formulas';
import type { ItemId, SkillId } from '@/types/ids';

export const registry = new Registry(CONTENT);

/** Wall-clock stand-in so tests are independent of the real clock. */
export const NOW = 1_700_000_000_000;

export function newGame(seed = 42): Game {
  return Game.newGame(registry, seed, NOW);
}

export function give(game: Game, itemId: ItemId, qty: number): void {
  if (!inventory.add(game.state, game.ctx, itemId, qty, 'test')) throw new Error('test inventory full');
}

export function setLevel(game: Game, skill: SkillId, level: number): void {
  game.state.player.skills[skill].xp = xpForLevel(level);
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
