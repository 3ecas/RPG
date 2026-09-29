import { describe, expect, it } from 'vitest';
import * as inventory from '@/systems/inventory';
import { newGame, setLevel, tickFor } from '../helpers';

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
    expect(game.state.player.skills.mining.xp).toBe(17.5);
    tickFor(game, 30_000);
    expect(inventory.count(game.state, 'copper_ore')).toBe(11);
    expect(game.state.activity?.kind).toBe('gather');
  });

  it('enforces the skill level', () => {
    const game = newGame();
    setLevel(game, 'mining', 15);
    game.travel('old_iron_mines');
    expect(game.startGathering('coal_rock')).toEqual({ ok: false, reason: 'Requires Mining level 30.' });
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

  it('a level up is announced once per level', () => {
    const game = newGame();
    const levelUps: number[] = [];
    game.ctx.events.on('skill:levelup', (e) => { if (e.skill === 'mining') levelUps.push(e.level); });
    game.travel('copper_hills');
    game.startGathering('copper_rock');
    tickFor(game, 60_000); // 20 ore = 350 xp: levels 2 (83), 3 (174), 4 (276)
    expect(levelUps).toEqual([2, 3, 4]);
  });
});
