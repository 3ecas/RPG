import { describe, expect, it } from 'vitest';
import * as inventory from '@/systems/inventory';
import { derive } from '@/systems/stats';
import { give, newGame, setLevel } from '../helpers';

describe('equipment', () => {
  it('equips from the inventory and changes derived stats', () => {
    const game = newGame();
    expect(derive(game.state, game.ctx)).toMatchObject({ attack: 1, strength: 1, defence: 1, maxHp: 40, attackIntervalMs: 2400 });
    expect(game.equip('rusty_dagger').ok).toBe(true);
    expect(game.state.player.equipment.weapon).toBe('rusty_dagger');
    expect(inventory.count(game.state, 'rusty_dagger')).toBe(0);
    expect(derive(game.state, game.ctx)).toMatchObject({ attack: 2, strength: 2 });
  });

  it('swapping returns the old item, unequipping too', () => {
    const game = newGame();
    give(game, 'bronze_dagger', 1);
    game.equip('rusty_dagger');
    expect(game.equip('bronze_dagger').ok).toBe(true);
    expect(inventory.count(game.state, 'rusty_dagger')).toBe(1);
    expect(game.unequip('weapon').ok).toBe(true);
    expect(inventory.count(game.state, 'bronze_dagger')).toBe(1);
    expect(game.unequip('weapon')).toEqual({ ok: false, reason: 'Nothing is equipped there.' });
  });

  it('checks ownership, requirements and type', () => {
    const game = newGame();
    expect(game.equip('iron_sword')).toEqual({ ok: false, reason: "You don't have a Iron Sword." });
    give(game, 'iron_sword', 1);
    expect(game.equip('iron_sword')).toEqual({ ok: false, reason: 'Requires Attack level 10.' });
    setLevel(game, 'attack', 10);
    expect(game.equip('iron_sword').ok).toBe(true);
    expect(game.equip('shrimp')).toEqual({ ok: false, reason: 'Shrimp cannot be equipped.' });
  });

  it('food heals up to max hp and refuses at full health', () => {
    const game = newGame();
    expect(game.consume('shrimp')).toEqual({ ok: false, reason: 'You are already at full health.' });
    game.state.player.hp = 38;
    expect(game.consume('shrimp').ok).toBe(true);
    expect(game.state.player.hp).toBe(40);
    expect(inventory.count(game.state, 'shrimp')).toBe(4);
  });
});
