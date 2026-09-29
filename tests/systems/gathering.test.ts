import { describe, expect, it } from 'vitest';
import * as inventory from '@/systems/inventory';
import { newGame, setTier, tickFor } from '../helpers';

describe('gathering', () => {
  it('only works on nodes in the current zone', () => {
    const game = newGame();
    const result = game.startGathering('copper_rock');
    expect(result).toEqual({ ok: false, reason: 'There is no Copper Rock in Greenhollow Village.' });
  });

  it('produces one item and xp per cycle', () => {
    const game = newGame();
    expect(game.travel('copper_hills').ok).toBe(true);
    expect(game.startGathering('copper_rock').ok).toBe(true);
    tickFor(game, 2900);
    expect(inventory.count(game.state, 'copper_ore')).toBe(0);
    tickFor(game, 100);
    expect(inventory.count(game.state, 'copper_ore')).toBe(1);
    expect(game.state.player.skills.mining.xp).toBe(10);
    tickFor(game, 30_000);
    expect(inventory.count(game.state, 'copper_ore')).toBe(11);
    expect(game.state.activity?.kind).toBe('gather');
  });

  it('enforces the skill tier: tier 2 unlocks iron, tier 3 coal', () => {
    const game = newGame();
    expect(game.travel('old_iron_mines')).toEqual({ ok: false, reason: 'Requires: Any skill at tier 2.' });
    setTier(game, 'mining', 2);
    expect(game.travel('old_iron_mines').ok).toBe(true);
    expect(game.startGathering('coal_seam')).toEqual({ ok: false, reason: 'Requires Mining tier 3.' });
    expect(game.startGathering('iron_rock').ok).toBe(true);
  });

  it('stops when the inventory is full', () => {
    const game = newGame();
    game.travel('copper_hills');
    // Fill every slot (duplicate stacks are fine for this test: only the slot count matters).
    game.state.inventory = Array.from({ length: 40 }, () => ({ itemId: 'bone' as const, qty: 1 }));
    expect(game.startGathering('copper_rock')).toEqual({ ok: false, reason: 'Inventory is full.' });

    game.state.inventory.pop();
    expect(game.startGathering('copper_rock').ok).toBe(true);
    tickFor(game, 3000);
    expect(inventory.count(game.state, 'copper_ore')).toBe(1);
    tickFor(game, 30_000); // stack exists now, so it keeps going
    expect(inventory.count(game.state, 'copper_ore')).toBe(11);
  });

  it('filling a tier bar announces the next tier exactly once', () => {
    const game = newGame();
    const tierUps: number[] = [];
    game.ctx.events.on('skill:tierup', (e) => { if (e.skill === 'mining') tierUps.push(e.tier); });
    game.state.player.skills.mining.xp = 1495;
    game.travel('copper_hills');
    game.startGathering('copper_rock');
    tickFor(game, 9000); // three ore: 1505, 1515, 1525 xp
    expect(tierUps).toEqual([2]);
    expect(game.skillView('mining')).toMatchObject({ tier: 2, tierName: 'Apprentice', xpIntoTier: 25, tierSize: 5500 });
  });
});
