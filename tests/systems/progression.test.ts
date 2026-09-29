import { describe, expect, it } from 'vitest';
import { BALANCE } from '@/content/balance';
import { Game } from '@/game';
import * as inventory from '@/systems/inventory';
import * as gathering from '@/systems/gathering';
import { give, newGame, NOW, registry, setTier, tickFor, unlock } from '../helpers';

describe('progression tree', () => {
  it('starts with the free roots unlocked and the starting points', () => {
    const game = newGame();
    expect(game.state.progression.unlocked.sort()).toEqual(['combat_basics', 'crafting_basics', 'gathering_basics', 'world_basics']);
    expect(game.progressPoints()).toEqual({ available: BALANCE.STARTING_POINTS, granted: BALANCE.STARTING_POINTS, spent: 0 });
    expect(game.inventoryCapacity()).toBe(BALANCE.INVENTORY_SLOTS + 4); // root perk
  });

  it('spends points, and checks parents, requirements and cost', () => {
    const game = newGame();
    expect(game.unlockNode('keen_eye')).toEqual({ ok: false, reason: 'Requires "Quick Hands" first.' });
    expect(game.unlockNode('quick_hands')).toEqual({ ok: false, reason: 'Requires: Any skill at tier 2.' });
    expect(game.unlockNode('barter').ok).toBe(true);
    expect(game.unlockNode('barter')).toEqual({ ok: false, reason: 'Already unlocked.' });
    expect(game.unlockNode('kingsport').ok).toBe(true);
    expect(game.progressPoints()).toEqual({ available: 0, granted: 3, spent: 3 });
    expect(game.unlockNode('deep_pockets')).toEqual({ ok: false, reason: 'Needs 2 points, you have 0.' });
    expect(game.progressNodeView('deep_pockets').status).toBe('locked');
  });

  it('grants a point per tier-up and two per quest, including for old saves', () => {
    const game = newGame();
    game.travel('copper_hills');
    game.state.player.skills.mining.xp = 1495;
    game.startGathering('copper_rock');
    tickFor(game, 3000);
    expect(game.skillTier('mining')).toBe(2);
    expect(game.progressPoints().granted).toBe(BALANCE.STARTING_POINTS + 1);

    game.travel('greenhollow');
    game.acceptQuest('rat_problem');
    game.state.quests.active.rat_problem!.counts = [5, 0];
    give(game, 'rat_tail', 3);
    expect(game.turnInQuest('rat_problem').ok).toBe(true);
    expect(game.progressPoints().granted).toBe(BALANCE.STARTING_POINTS + 1 + 2);

    // A save that predates the tree: points are reconciled from what it already achieved.
    const raw = JSON.parse(game.save());
    raw.progression = { granted: 0, unlocked: [] };
    setTier(game, 'fishing', 4); // not saved; only to show granted is from facts in the loaded state
    const loaded = Game.fromSave(registry, JSON.stringify(raw), NOW);
    expect(loaded.progressPoints().granted).toBe(BALANCE.STARTING_POINTS + 1 + 2);
    expect(loaded.state.progression.unlocked).toContain('gathering_basics');
  });

  it('gates zones, the market and dual wielding, never skills', () => {
    const game = newGame();
    expect(game.startGathering('wheat_field').ok).toBe(true); // farming is a skill: no node needed
    game.stopActivity();
    setTier(game, 'mining', 2);
    expect(game.travel('old_iron_mines')).toEqual({ ok: false, reason: 'Requires: Unlock "Old Iron Mines" in the Progression tree.' });
    expect(game.marketBuy('copper_ore', 1)).toEqual({ ok: false, reason: 'Unlock "Kingsport" in the Progression tree to reach the market.' });
    expect(game.unlockNode('old_iron_mines').ok).toBe(true);
    expect(game.travel('old_iron_mines').ok).toBe(true);
    expect(game.state.world.unlockedZones).toContain('old_iron_mines');
  });

  it('perks change capacity, speed, xp, hp, prices and gold', () => {
    const game = newGame();
    unlock(game, 'deep_pockets', 'pack_mule');
    expect(game.inventoryCapacity()).toBe(BALANCE.INVENTORY_SLOTS + 4 + 16);
    expect(inventory.freeSlots(game.state, game.ctx)).toBe(BALANCE.INVENTORY_SLOTS + 20 - 2);

    unlock(game, 'quick_hands', 'swift_hands');
    expect(gathering.durationOf(game.state, game.ctx, game.content.node('copper_rock'))).toBe(2250); // 3000 × (1 − 0.25)

    unlock(game, 'keen_eye');
    game.travel('copper_hills');
    game.startGathering('copper_rock');
    tickFor(game, 2250);
    expect(game.state.player.skills.mining.xp).toBeCloseTo(11); // 10 × 1.1

    unlock(game, 'toughness', 'iron_skin');
    expect(game.stats().maxHp).toBe(40 + 5 + 30);

    unlock(game, 'haggling');
    game.travel('greenhollow');
    expect(game.shopSellPrice('hollow_goods', 'shrimp')).toBe(Math.floor(6 * 0.4 * 1.1));
  });

  it('auto-eat feeds you when hp drops below half', () => {
    const game = newGame();
    unlock(game, 'toughness', 'second_wind', 'auto_eat');
    give(game, 'trout', 3);
    game.state.player.hp = 5;
    game.startCombat('rat');
    tickFor(game, 100);
    expect(inventory.count(game.state, 'trout')).toBe(2);
    expect(game.state.player.hp).toBeGreaterThan(5);
  });
});
