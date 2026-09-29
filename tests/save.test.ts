import { describe, expect, it } from 'vitest';
import { Game } from '@/game';
import { SAVE_VERSION } from '@/core/migrations';
import { give, newGame, NOW, registry, tickFor } from './helpers';

describe('save / load', () => {
  it('round-trips a state exactly', () => {
    const game = newGame(7);
    game.travel('copper_hills');
    game.startGathering('copper_rock');
    tickFor(game, 10_000);
    game.state.player.gold = 123;
    const json = game.save();

    const loaded = Game.fromSave(registry, json, NOW);
    expect(loaded.state).toEqual(game.state);
    expect(loaded.ctx.rng.state).toBe(game.ctx.rng.state);
  });

  it('restores a fight in progress', () => {
    const game = newGame(3);
    game.startCombat('rat');
    tickFor(game, 500);
    const loaded = Game.fromSave(registry, game.save(), NOW);
    expect(loaded.state.activity).toEqual({ kind: 'combat', zoneId: 'greenhollow', monsterId: 'rat' });
    expect(loaded.state.combat?.monsterId).toBe('rat');
  });

  it('drops references to content that no longer exists', () => {
    const game = newGame();
    give(game, 'bone', 3);
    const raw = JSON.parse(game.save());
    raw.inventory.push({ itemId: 'dragon_egg', qty: 1 });
    raw.player.equipment.main_hand = 'bronze_helmet'; // wrong slot
    raw.player.zoneId = 'atlantis';
    raw.quests.completed = ['rat_problem', 'nope'];
    raw.quests.active = { goblin_menace: { counts: [4] }, fake: { counts: [] } };
    raw.log.push({ garbage: true });

    const loaded = Game.fromSave(registry, JSON.stringify(raw), NOW);
    expect(loaded.state.inventory.some((s) => (s.itemId as string) === 'dragon_egg')).toBe(false);
    expect(loaded.state.inventory.find((s) => s.itemId === 'bone')?.qty).toBe(3);
    expect(loaded.state.player.equipment.main_hand).toBeNull();
    expect(loaded.state.player.zoneId).toBe('greenhollow');
    expect(loaded.state.quests.completed).toEqual(['rat_problem']);
    expect(loaded.state.quests.active).toEqual({ goblin_menace: { counts: [4] } });
    expect(loaded.state.log.every((e) => typeof e.text === 'string')).toBe(true);
  });

  it('round-trips economy state and upgrades a version 1 save', () => {
    const game = newGame(11);
    expect(game.unlockNode('kingsport').ok).toBe(true);
    game.state.player.gold = 500;
    game.travel('copper_hills');
    game.buy('smithy', 'bronze_bar', 3);
    game.travel('kingsport');
    game.marketSell('shrimp', 5);
    tickFor(game, 120_000);
    const loaded = Game.fromSave(registry, game.save(), NOW);
    expect(loaded.state.world).toEqual(game.state.world);

    const v1 = JSON.parse(game.save());
    v1.version = 1;
    delete v1.world.shops;
    delete v1.world.market;
    delete v1.world.traders;
    const upgraded = Game.fromSave(registry, JSON.stringify(v1), NOW);
    expect(upgraded.state.version).toBe(SAVE_VERSION);
    expect(upgraded.state.player.gold).toBe(game.state.player.gold);
    expect(upgraded.shopStock('smithy').find((r) => r.itemId === 'bronze_bar')?.qty).toBe(10); // fresh shops are full
    expect(upgraded.traderOffers('peddler_vex')).toHaveLength(3);
    expect(upgraded.marketView().every((r) => r.price === r.base)).toBe(true);
    expect(upgraded.state.progression.unlocked).toContain('gathering_basics'); // roots are restored on load
  });

  it('upgrades a version 2 save: old skills carry over and renamed items survive', () => {
    const v2 = {
      version: 2,
      player: { skills: { attack: { xp: 1600 }, hitpoints: { xp: 3000 }, mining: { xp: 50 } }, equipment: { shield: 'wooden_shield' }, combatStyle: 'strength' },
      inventory: [{ itemId: 'wooden_shield', qty: 2 }, { itemId: 'copper_ore', qty: 5 }],
    };
    const loaded = Game.fromSave(registry, JSON.stringify(v2), NOW);
    expect(loaded.state.version).toBe(SAVE_VERSION);
    expect(loaded.state.player.skills.swords.xp).toBe(1600);
    expect(loaded.state.player.skills.vitality.xp).toBe(3000);
    expect(loaded.state.player.skills.mining.xp).toBe(50);
    expect(loaded.state.player.equipment.off_hand).toBe('oak_shield'); // renamed item, renamed slot
    expect(loaded.state.inventory).toEqual([{ itemId: 'oak_shield', qty: 2 }, { itemId: 'copper_ore', qty: 5 }]);
    expect('combatStyle' in loaded.state.player).toBe(false);
  });

  it('fills missing sections from a fresh state', () => {
    const loaded = Game.fromSave(registry, JSON.stringify({ version: SAVE_VERSION, player: { gold: 50 } }), NOW);
    expect(loaded.state.player.gold).toBe(50);
    expect(loaded.state.player.skills.mining.xp).toBe(0);
    expect(loaded.state.inventory.length).toBeGreaterThan(0);
  });

  it('refuses saves from a newer version and unreadable input', () => {
    expect(() => Game.fromSave(registry, JSON.stringify({ version: SAVE_VERSION + 1 }), NOW)).toThrow(/newer/);
    expect(() => Game.fromSave(registry, 'not json', NOW)).toThrow();
    expect(() => Game.fromSave(registry, '[1,2]', NOW)).toThrow(/not an object/);
  });
});
