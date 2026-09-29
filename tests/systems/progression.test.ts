import { describe, expect, it } from 'vitest';
import { BALANCE } from '@/content/balance';
import * as inventory from '@/systems/inventory';
import * as gathering from '@/systems/gathering';
import { Game } from '@/game';
import { give, newGame, NOW, registry, setTier, tickFor, tickUntil, unlock } from '../helpers';

describe('progression tree', () => {
  it('starts with the free roots unlocked and the starting points', () => {
    const game = newGame();
    expect(game.state.progression.unlocked.sort()).toEqual(['combat_basics', 'crafting_basics', 'gathering_basics', 'world_basics']);
    expect(game.progressPoints()).toEqual({ available: BALANCE.STARTING_POINTS, granted: BALANCE.STARTING_POINTS, spent: 0 });
    expect(game.isSkillUnlocked('mining')).toBe(true);
    expect(game.isSkillUnlocked('farming')).toBe(false);
    expect(game.isStationUnlocked('campfire')).toBe(true);
    expect(game.isStationUnlocked('furnace')).toBe(false);
  });

  it('spends points, and checks parents, requirements and cost', () => {
    const game = newGame();
    expect(game.unlockNode('harvesting')).toEqual({ ok: false, reason: 'Requires "Farming" first.' });
    expect(game.unlockNode('quick_hands')).toEqual({ ok: false, reason: 'Requires: Any skill at tier 2.' });
    expect(game.unlockNode('farming').ok).toBe(true);
    expect(game.unlockNode('farming')).toEqual({ ok: false, reason: 'Already unlocked.' });
    expect(game.unlockNode('harvesting').ok).toBe(true);
    expect(game.progressPoints()).toEqual({ available: 1, granted: 3, spent: 2 });
    expect(game.unlockNode('deep_pockets')).toEqual({ ok: false, reason: 'Needs 2 points, you have 1.' });
    expect(game.progressNodeView('deep_pockets').status).toBe('locked');
    expect(game.progressNodeView('furnace').status).toBe('available');
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

  it('locks skills, stations, gear and zones behind nodes', () => {
    const game = newGame();
    expect(game.startGathering('wheat_field')).toEqual({ ok: false, reason: 'Farming is locked. Unlock "Farming" in the Progression tree.' });
    give(game, 'copper_ore', 1);
    give(game, 'tin_ore', 1);
    expect(game.startCrafting('smelt_bronze_bar', 1)).toEqual({ ok: false, reason: 'The Furnace is locked. Unlock "Furnace" in the Progression tree.' });
    give(game, 'bronze_sword', 1);
    expect(game.equip('bronze_sword')).toEqual({ ok: false, reason: 'Swords is locked. Unlock "Swordplay" in the Progression tree.' });
    give(game, 'bronze_helmet', 1);
    expect(game.equip('bronze_helmet')).toEqual({ ok: false, reason: 'Armor is locked. Unlock "Armor Training" in the Progression tree.' });
    setTier(game, 'mining', 2);
    expect(game.travel('old_iron_mines')).toEqual({ ok: false, reason: 'Requires: Unlock "Old Iron Mines" in the Progression tree.' });
    expect(game.marketBuy('copper_ore', 1)).toEqual({ ok: false, reason: 'Unlock "Market Access" in the Progression tree to trade here.' });

    expect(game.unlockNode('old_iron_mines').ok).toBe(true);
    expect(game.travel('old_iron_mines').ok).toBe(true);
    expect(game.state.world.unlockedZones).toContain('old_iron_mines');
    expect(game.unlockNode('swordplay').ok).toBe(true);
    expect(game.equip('bronze_sword').ok).toBe(true);
    expect(game.weaponSkill()).toBe('swords');
  });

  it('a locked skill gains no xp, even from a weapon of its type', () => {
    const game = newGame();
    unlock(game, 'swordplay');
    give(game, 'bronze_sword', 1);
    game.equip('bronze_sword');
    game.state.progression.unlocked = game.state.progression.unlocked.filter((n) => n !== 'swordplay'); // lock it again while worn
    expect(game.weaponSkill()).toBeNull();
    game.startCombat('rat');
    tickUntil(game, () => (game.state.combat?.kills ?? 0) >= 1);
    expect(game.state.player.skills.swords.xp).toBe(0);
    expect(game.state.player.skills.vitality.xp).toBeGreaterThan(0);
  });

  it('perks change capacity, speed, xp, hp, prices and gold', () => {
    const game = newGame();
    expect(game.inventoryCapacity()).toBe(BALANCE.INVENTORY_SLOTS);
    unlock(game, 'deep_pockets', 'pack_mule');
    expect(game.inventoryCapacity()).toBe(BALANCE.INVENTORY_SLOTS + 16);
    expect(inventory.freeSlots(game.state, game.ctx)).toBe(BALANCE.INVENTORY_SLOTS + 16 - 2);

    unlock(game, 'quick_hands', 'swift_hands');
    expect(gathering.durationOf(game.state, game.ctx, game.content.node('copper_rock'))).toBe(2250); // 3000 × (1 − 0.25)

    unlock(game, 'keen_eye');
    game.travel('copper_hills');
    game.startGathering('copper_rock');
    tickFor(game, 2250);
    expect(game.state.player.skills.mining.xp).toBeCloseTo(11); // 10 × 1.1

    unlock(game, 'toughness', 'iron_skin');
    expect(game.stats().maxHp).toBe(40 + 30);

    unlock(game, 'haggling');
    expect(game.shopSellPrice('smithy', 'bronze_sword')).toBe(Math.floor(35 * 0.5 * 1.1));
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
