import { describe, expect, it } from 'vitest';
import { Game } from '@/game';
import * as inventory from '@/systems/inventory';
import { give, newGame, NOW, registry, tickFor, tickUntil } from '../helpers';

describe('missions', () => {
  it('tracks gathering in the open chapter and pays out on claim', () => {
    const game = newGame();
    expect(game.currentChapter()).toBe(1);
    expect(game.canClaimMission('first_logs')).toEqual({ ok: false, reason: 'Not finished yet.' });
    game.startGathering('oak_tree');
    tickFor(game, 30_000); // ten logs
    expect(game.missionObjectives('first_logs')[0]).toMatchObject({ current: 10, target: 10, done: true });
    const gold = game.state.player.gold;
    const xp = game.state.player.skills.woodcutting.xp;
    expect(game.claimMission('first_logs').ok).toBe(true);
    expect(game.state.player.gold).toBe(gold + 20);
    expect(game.state.player.skills.woodcutting.xp).toBeCloseTo(xp + 100 * 1.0); // gathering xp has no root perk
    expect(game.isMissionClaimed('first_logs')).toBe(true);
    expect(game.claimMission('first_logs')).toEqual({ ok: false, reason: 'Already claimed.' });
  });

  it('what is already in the bag counts for gather and craft objectives', () => {
    const game = newGame();
    give(game, 'oak_log', 10);
    expect(game.missionObjectives('first_logs')[0]).toMatchObject({ current: 10, target: 10, done: true });
    expect(game.claimMission('first_logs').ok).toBe(true);
    expect(inventory.count(game.state, 'oak_log')).toBe(10); // gathering objectives do not take the items

    give(game, 'shrimp', 5);
    expect(game.missionObjectives('first_meal')[0]).toMatchObject({ current: 5, done: true });
    expect(game.claimMission('first_meal').ok).toBe(true);

    // Progress already tallied is never lost, even after selling the goods.
    game.startGathering('shrimp_spot');
    tickFor(game, 9000);
    game.state.inventory = game.state.inventory.filter((s) => s.itemId !== 'raw_shrimp');
    expect(game.missionObjectives('first_catch')[0]?.current).toBe(3);
  });

  it('live objectives (talk, equip) and points rewards', () => {
    const game = newGame();
    expect(game.claimMission('meet_the_elder')).toEqual({ ok: false, reason: 'Not finished yet.' });
    game.talk('elder_maren');
    const before = game.progressPoints().granted;
    expect(game.claimMission('meet_the_elder').ok).toBe(true);
    expect(game.progressPoints().granted).toBe(before + 1);
    game.equip('rusty_dagger');
    expect(game.claimMission('armed').ok).toBe(true);
  });

  it('missions of a locked chapter cannot be claimed and do not count events', () => {
    const game = newGame();
    game.travel('copper_hills');
    expect(game.canClaimMission('into_the_hills')).toEqual({ ok: false, reason: 'This chapter is not open yet.' });
    game.startGathering('copper_rock');
    tickFor(game, 6000);
    expect(game.state.missions.counts.ore_haul).toBeUndefined(); // chapter 2 is not open, so nothing was counted
  });

  it('claiming every mission of a chapter opens the next one', () => {
    const game = newGame();
    let opened = 0;
    game.ctx.events.on('chapter:opened', (e) => { opened = e.chapter; });
    // Do chapter 1 for real.
    game.startGathering('oak_tree');
    tickFor(game, 45_000);
    game.startGathering('shrimp_spot');
    tickFor(game, 30_000);
    game.startCrafting('cook_shrimp', 5);
    tickFor(game, 10_000);
    game.equip('rusty_dagger');
    game.startCombat('rat');
    tickUntil(game, () => (game.state.combat?.kills ?? 0) >= 5);
    game.stopActivity();
    game.talk('elder_maren');
    for (const id of ['first_logs', 'first_catch', 'first_meal', 'pest_control', 'meet_the_elder', 'armed'] as const) {
      expect(game.claimMission(id), id).toEqual({ ok: true, value: undefined });
    }
    expect(opened).toBe(2);
    expect(game.currentChapter()).toBe(2);
    expect(game.chapterStatus(1)).toBe('done');
    expect(game.chapterStatus(3)).toBe('locked');
    expect(game.travel('copper_hills').ok).toBe(true);
    expect(game.claimMission('into_the_hills').ok).toBe(true); // visit objective is live
  });

  it('progress survives a save round-trip', () => {
    const game = newGame();
    game.startGathering('oak_tree');
    tickFor(game, 9000);
    const loaded = Game.fromSave(registry, game.save(), NOW);
    expect(loaded.state.missions).toEqual(game.state.missions);
    expect(loaded.missionObjectives('first_logs')[0]?.current).toBe(3);
    give(loaded, 'oak_log', 0);
    expect(inventory.count(loaded.state, 'oak_log')).toBe(3);
  });
});
