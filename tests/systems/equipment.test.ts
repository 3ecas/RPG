import { describe, expect, it } from 'vitest';
import * as inventory from '@/systems/inventory';
import { derive } from '@/systems/stats';
import { give, newGame, setTier, unlock } from '../helpers';

describe('equipment', () => {
  it('equips from the inventory; mastery of the weapon skill adds to its stats', () => {
    const game = newGame();
    expect(derive(game.state, game.ctx)).toMatchObject({ attack: 0, strength: 0, defence: 0, maxHp: 40, attackIntervalMs: 2400 }); // Armor is still locked
    expect(game.equip('rusty_dagger').ok).toBe(true);
    expect(game.state.player.equipment.weapon).toBe('rusty_dagger');
    expect(inventory.count(game.state, 'rusty_dagger')).toBe(0);
    expect(derive(game.state, game.ctx)).toMatchObject({ attack: 4, strength: 3 }); // item 1/1 + Daggers tier 1 mastery 3/2
    setTier(game, 'daggers', 3);
    expect(derive(game.state, game.ctx)).toMatchObject({ attack: 10, strength: 7 });
  });

  it('shields add defence only while one is equipped', () => {
    const game = newGame();
    unlock(game, 'armor_training', 'shield_training');
    setTier(game, 'shields', 2);
    expect(derive(game.state, game.ctx).defence).toBe(2);
    give(game, 'oak_shield', 1);
    game.equip('oak_shield');
    expect(derive(game.state, game.ctx).defence).toBe(2 + 4 + 4); // armor T1 + shields T2 mastery + oak shield
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

  it('checks ownership, tier requirements and type', () => {
    const game = newGame();
    expect(game.equip('iron_sword')).toEqual({ ok: false, reason: "You don't have a Iron Sword." });
    give(game, 'iron_sword', 1);
    expect(game.equip('iron_sword')).toEqual({ ok: false, reason: 'Swords is locked. Unlock "Swordplay" in the Progression tree.' });
    unlock(game, 'swordplay');
    expect(game.equip('iron_sword')).toEqual({ ok: false, reason: 'Requires Swords tier 2.' });
    setTier(game, 'swords', 2);
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
