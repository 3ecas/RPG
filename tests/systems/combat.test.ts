import { describe, expect, it } from 'vitest';
import { derive } from '@/systems/stats';
import { newGame, setLevel, tickUntil } from '../helpers';

describe('combat', () => {
  it('only fights monsters that live in the current zone', () => {
    const game = newGame();
    expect(game.startCombat('goblin')).toEqual({ ok: false, reason: 'There are no Goblins in Greenhollow Village.' });
    expect(game.startCombat('rat').ok).toBe(true);
    expect(game.state.combat).toMatchObject({ monsterId: 'rat', monsterHp: 5 });
  });

  it('kills things, grants xp to the chosen style, and keeps fighting', () => {
    const game = newGame();
    game.equip('rusty_dagger');
    game.setCombatStyle('strength');
    let kills = 0;
    game.ctx.events.on('monster:killed', () => { kills += 1; });
    game.startCombat('rat');
    tickUntil(game, () => kills >= 3);
    expect(kills).toBe(3);
    expect(game.state.player.skills.strength.xp).toBeGreaterThan(0);
    expect(game.state.player.skills.attack.xp).toBe(0);
    expect(game.state.player.skills.hitpoints.xp).toBeGreaterThan(1154);
    expect(game.state.activity?.kind).toBe('combat');
    expect(game.state.combat?.kills).toBe(3);
  });

  it('death sends you home at full health with nothing running', () => {
    const game = newGame();
    setLevel(game, 'mining', 15);
    game.travel('old_iron_mines');
    game.state.player.hp = 1;
    let died = false;
    game.ctx.events.on('player:died', () => { died = true; });
    game.startCombat('skeleton');
    tickUntil(game, () => died);
    expect(died).toBe(true);
    expect(game.state.activity).toBeNull();
    expect(game.state.combat).toBeNull();
    expect(game.state.player.zoneId).toBe('greenhollow');
    expect(game.state.player.hp).toBe(derive(game.state, game.ctx).maxHp);
    expect(game.state.log.at(-1)?.text).toContain('killed by a Skeleton Miner');
  });

  it('is deterministic for a given seed', () => {
    const run = () => {
      const game = newGame(99);
      game.startCombat('cow');
      tickUntil(game, () => (game.state.combat?.kills ?? 0) >= 5);
      return game.save();
    };
    expect(run()).toBe(run());
  });

  it('regenerates hp over time', () => {
    const game = newGame();
    game.state.player.hp = 10;
    tickUntil(game, () => game.state.player.hp >= 12, 10_000);
    expect(game.state.player.hp).toBe(12);
  });
});
