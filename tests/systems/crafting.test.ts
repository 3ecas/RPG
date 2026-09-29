import { describe, expect, it } from 'vitest';
import * as inventory from '@/systems/inventory';
import { give, newGame, setTier, tickFor } from '../helpers';

describe('crafting', () => {
  it('needs the station nearby, the materials and the tier', () => {
    const game = newGame();
    give(game, 'copper_ore', 1);
    give(game, 'tin_ore', 1);
    expect(game.startCrafting('smelt_bronze_bar', 1)).toEqual({ ok: false, reason: 'There is no Furnace in Greenhollow Village. Travel to Copper Hills.' });
    game.travel('copper_hills');
    expect(game.startCrafting('smelt_bronze_bar', 1).ok).toBe(true);
    game.stopActivity();
    expect(game.startCrafting('smith_bronze_dagger', 1)).toEqual({ ok: false, reason: 'Missing: 1× Bronze Bar, 1× Oak Log.' });
    give(game, 'iron_ore', 1);
    expect(game.startCrafting('smelt_iron_bar', 1)).toEqual({ ok: false, reason: 'Requires Blacksmithing tier 2.' });
    setTier(game, 'blacksmithing', 2);
    expect(game.startCrafting('smelt_iron_bar', 1).ok).toBe(true);
  });

  it('consumes inputs, produces outputs, grants xp, and stops when done or out of materials', () => {
    const game = newGame();
    game.travel('copper_hills');
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
    expect(game.state.player.skills.blacksmithing.xp).toBeCloseTo(3 * game.content.recipe('smelt_bronze_bar').xp * 1.05); // root perk +5%
    expect(crafted).toHaveLength(3);
    expect(game.state.activity).toBeNull();
  });

  it('runs a full chain: ore and wood to bar to dagger', () => {
    const game = newGame();
    game.travel('copper_hills');
    give(game, 'copper_ore', 1);
    give(game, 'tin_ore', 1);
    give(game, 'oak_log', 1);
    game.startCrafting('smelt_bronze_bar', 1);
    tickFor(game, 3000);
    expect(game.startCrafting('smith_bronze_dagger', 1).ok).toBe(true);
    tickFor(game, game.content.recipe('smith_bronze_dagger').durationMs);
    expect(inventory.count(game.state, 'bronze_dagger')).toBe(1);
    expect(inventory.count(game.state, 'bronze_bar')).toBe(0);
    expect(inventory.count(game.state, 'oak_log')).toBe(0);
  });

  it('every tier has a full production chain with realistic materials', () => {
    const game = newGame();
    const metals = ['bronze', 'iron', 'steel', 'mithril', 'adamant', 'rune'] as const;
    const woods = ['oak', 'willow', 'maple', 'yew', 'ash', 'elder'] as const;
    const hides = ['cowhide', 'wolf_pelt', 'bear_pelt', 'troll_hide', 'wyvern_scale', 'dragon_scale'] as const;
    metals.forEach((metal, i) => {
      const bar = game.content.recipe(`smelt_${metal}_bar`);
      const sword = game.content.recipe(`smith_${metal}_sword`);
      const helmet = game.content.recipe(`smith_${metal}_helmet`);
      const shield = game.content.recipe(`carve_${woods[i]!}_shield`);
      expect(sword.tier).toBe(bar.tier);
      expect(sword.inputs.map((s) => s.itemId)).toEqual([`${metal}_bar`, `${woods[i]!}_log`]);
      expect(helmet.inputs.map((s) => s.itemId)).toEqual([`${metal}_bar`, hides[i]!]);
      expect(shield.inputs.map((s) => s.itemId)).toEqual([`${woods[i]!}_log`, `${metal}_bar`, hides[i]!]);
      expect(game.content.item(`${metal}_sword`).equip?.requirements?.[0]).toEqual({ skill: 'swords', tier: bar.tier });
    });
  });

  it('stops early if a recipe becomes unavailable mid-batch', () => {
    const game = newGame();
    setTier(game, 'cooking', 2);
    give(game, 'raw_trout', 2);
    give(game, 'willow_log', 2);
    const duration = game.content.recipe('cook_trout').durationMs;
    game.startCrafting('cook_trout', 2);
    tickFor(game, duration);
    game.state.inventory = game.state.inventory.filter((s) => s.itemId !== 'raw_trout'); // someone ate the bait
    tickFor(game, duration);
    expect(inventory.count(game.state, 'trout')).toBe(1);
    expect(game.state.activity).toBeNull();
  });
});
