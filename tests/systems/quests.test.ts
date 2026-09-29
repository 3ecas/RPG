import { describe, expect, it } from 'vitest';
import * as inventory from '@/systems/inventory';
import * as quests from '@/systems/quests';
import { give, newGame, tickUntil, unlock } from '../helpers';

describe('quests', () => {
  it('locks quests behind prerequisites', () => {
    const game = newGame();
    expect(quests.status(game.state, game.ctx, 'goblin_menace')).toBe('locked');
    expect(game.acceptQuest('goblin_menace')).toEqual({ ok: false, reason: 'Requires: Complete "Rat Problem".' });
    expect(quests.status(game.state, game.ctx, 'rat_problem')).toBe('available');
  });

  it('tracks kills and collected items, then pays out', () => {
    const game = newGame();
    expect(game.acceptQuest('rat_problem').ok).toBe(true);
    expect(game.acceptQuest('rat_problem')).toEqual({ ok: false, reason: 'You already have that quest.' });
    expect(game.turnInQuest('rat_problem')).toEqual({ ok: false, reason: 'The quest is not finished yet.' });

    game.equip('rusty_dagger');
    game.startCombat('rat');
    tickUntil(game, () => (game.state.quests.active.rat_problem?.counts[0] ?? 0) >= 5);
    game.stopActivity();
    const view = quests.objectives(game.state, game.ctx, 'rat_problem');
    expect(view[0]).toMatchObject({ text: 'Defeat 5× Giant Rat', current: 5, target: 5, done: true });

    const tails = inventory.count(game.state, 'rat_tail');
    if (tails < 3) give(game, 'rat_tail', 3 - tails);
    const goldBefore = game.state.player.gold;
    const vitalityBefore = game.state.player.skills.vitality.xp;
    const shrimpBefore = inventory.count(game.state, 'shrimp');
    expect(game.turnInQuest('rat_problem').ok).toBe(true);
    expect(game.state.player.gold).toBe(goldBefore + 50);
    expect(game.state.player.skills.vitality.xp).toBe(vitalityBefore + 150);
    expect(inventory.count(game.state, 'shrimp')).toBe(shrimpBefore + 5);
    expect(inventory.count(game.state, 'rat_tail')).toBe(Math.max(0, tails - 3));
    expect(game.state.quests.completed).toEqual(['rat_problem']);
    expect(game.state.quests.active.rat_problem).toBeUndefined();
    expect(quests.status(game.state, game.ctx, 'goblin_menace')).toBe('available');
  });

  it('craft objectives advance from crafting events', () => {
    const game = newGame();
    expect(game.acceptQuest('apprentice_smith')).toEqual({ ok: false, reason: 'Requires: Unlock "Furnace" in the Progression tree.' });
    unlock(game, 'furnace');
    expect(game.acceptQuest('apprentice_smith').ok).toBe(true);
    give(game, 'copper_ore', 2);
    give(game, 'tin_ore', 2);
    game.startCrafting('smelt_bronze_bar', 2);
    tickUntil(game, () => game.state.activity === null);
    expect(game.state.quests.active.apprentice_smith?.counts).toEqual([2, 0]);
  });

  it('a quest gates the tree node that opens a zone', () => {
    const game = newGame();
    expect(game.travel('whispering_woods')).toEqual({ ok: false, reason: 'Requires: Unlock "Whispering Woods" in the Progression tree.' });
    expect(game.unlockNode('whispering_woods')).toEqual({ ok: false, reason: 'Requires: Complete "Goblin Menace".' });
    game.state.quests.completed.push('rat_problem');
    game.acceptQuest('goblin_menace');
    game.state.quests.active.goblin_menace!.counts = [10];
    expect(game.turnInQuest('goblin_menace').ok).toBe(true);
    expect(game.unlockNode('whispering_woods').ok).toBe(true);
    expect(game.state.world.unlockedZones).toContain('whispering_woods');
    expect(game.travel('whispering_woods').ok).toBe(true);
  });

  it('must be at the quest giver to accept or turn in', () => {
    const game = newGame();
    game.travel('copper_hills');
    expect(game.acceptQuest('rat_problem')).toEqual({ ok: false, reason: 'Maren is not here.' });
  });
});
