import { describe, expect, it } from 'vitest';
import * as inventory from '@/systems/inventory';
import { give, newGame, setLevel, tickFor } from '../helpers';

describe('crafting', () => {
  it('needs the materials and the level', () => {
    const game = newGame();
    expect(game.startCrafting('smelt_bronze_bar', 1)).toEqual({ ok: false, reason: 'Missing: 1× Copper Ore, 1× Tin Ore.' });
    give(game, 'iron_ore', 1);
    expect(game.startCrafting('smelt_iron_bar', 1)).toEqual({ ok: false, reason: 'Requires Smithing level 15.' });
  });

  it('consumes inputs, produces outputs, grants xp, and stops when done or out of materials', () => {
    const game = newGame();
    give(game, 'copper_ore', 3);
    give(game, 'tin_ore', 5);
    const crafted: string[] = [];
    game.ctx.events.on('recipe:crafted', (e) => crafted.push(e.recipeId));

    expect(game.startCrafting('smelt_bronze_bar', 10).ok).toBe(true);
    expect(game.state.activity).toMatchObject({ kind: 'craft', remaining: 3 }); // clamped to what materials allow
    tickFor(game, 9000);
    expect(inventory.count(game.state, 'bronze_bar')).toBe(3);
    expect(inventory.count(game.state, 'copper_ore')).toBe(0);
    expect(inventory.count(game.state, 'tin_ore')).toBe(2);
    expect(game.state.player.skills.smithing.xp).toBe(18);
    expect(crafted).toHaveLength(3);
    expect(game.state.activity).toBeNull();
  });

  it('runs a full chain: ore to bar to dagger', () => {
    const game = newGame();
    give(game, 'copper_ore', 1);
    give(game, 'tin_ore', 1);
    game.startCrafting('smelt_bronze_bar', 1);
    tickFor(game, 3000);
    expect(game.startCrafting('smith_bronze_dagger', 1).ok).toBe(true);
    tickFor(game, 3000);
    expect(inventory.count(game.state, 'bronze_dagger')).toBe(1);
    expect(inventory.count(game.state, 'bronze_bar')).toBe(0);
  });

  it('stops early if a recipe becomes unavailable mid-batch', () => {
    const game = newGame();
    setLevel(game, 'cooking', 20);
    give(game, 'raw_trout', 2);
    game.startCrafting('cook_trout', 2);
    tickFor(game, 2500);
    game.state.inventory = game.state.inventory.filter((s) => s.itemId !== 'raw_trout'); // someone ate the bait
    tickFor(game, 2500);
    expect(inventory.count(game.state, 'trout')).toBe(1);
    expect(game.state.activity).toBeNull();
  });
});
