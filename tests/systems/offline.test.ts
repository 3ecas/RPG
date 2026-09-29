import { describe, expect, it } from 'vitest';
import { BALANCE } from '@/content/balance';
import * as inventory from '@/systems/inventory';
import { derive } from '@/systems/stats';
import { newGame, NOW } from '../helpers';

const HOUR = 3_600_000;

describe('offline catch-up', () => {
  it('simulates the elapsed time for a gathering activity', () => {
    const game = newGame();
    game.travel('copper_hills');
    game.startGathering('copper_rock');
    const summary = game.offlineCatchUp(NOW + 2 * HOUR);
    expect(summary?.elapsedMs).toBe(2 * HOUR);
    expect(inventory.count(game.state, 'copper_ore')).toBe(2400);
    expect(summary?.items).toEqual([{ itemId: 'copper_ore', qty: 2400 }]);
    expect(summary?.xp).toEqual([{ skill: 'Mining', xp: 24000 }]);
    expect(summary?.tierUps.map((t) => t.tier)).toEqual([2, 3]);
    expect(game.skillTier('mining')).toBe(3);
    expect(game.state.time.nowMs).toBe(2 * HOUR);
    expect(game.state.meta.lastTickAt).toBe(NOW + 2 * HOUR);
  });

  it('is capped', () => {
    const game = newGame();
    game.travel('copper_hills');
    game.startGathering('tin_rock');
    const summary = game.offlineCatchUp(NOW + 30 * HOUR);
    expect(summary?.elapsedMs).toBe(BALANCE.OFFLINE_CAP_MS);
    expect(inventory.count(game.state, 'tin_ore')).toBe(BALANCE.OFFLINE_CAP_MS / 3000);
  });

  it('reports nothing for a short absence', () => {
    const game = newGame();
    expect(game.offlineCatchUp(NOW + 500)).toBeNull();
  });

  it('keeps combat sane over a long absence', () => {
    const game = newGame(5);
    game.equip('rusty_dagger');
    game.startCombat('rat');
    const summary = game.offlineCatchUp(NOW + HOUR);
    expect(summary?.kills).toBeGreaterThan(50);
    const stats = derive(game.state, game.ctx);
    expect(game.state.player.hp).toBeGreaterThanOrEqual(1);
    expect(game.state.player.hp).toBeLessThanOrEqual(stats.maxHp);
    expect(Number.isFinite(game.state.player.skills.daggers.xp)).toBe(true);
    expect(game.state.inventory.every((s) => s.qty > 0)).toBe(true);
  });
});
