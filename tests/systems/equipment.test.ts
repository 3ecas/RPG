import { describe, expect, it } from 'vitest';
import * as inventory from '@/systems/inventory';
import { derive } from '@/systems/stats';
import { give, newGame, setTier, unlock } from '../helpers';

describe('equipment', () => {
  it('equips into the main hand; mastery of the weapon skill adds to its stats', () => {
    const game = newGame();
    expect(derive(game.state, game.ctx)).toMatchObject({ attack: 0, strength: 0, defence: 2, maxHp: 45, attackIntervalMs: 2400 }); // armor T1, +5 hp root perk
    expect(game.equip('rusty_dagger').ok).toBe(true);
    expect(game.state.player.equipment.main_hand).toBe('rusty_dagger');
    expect(inventory.count(game.state, 'rusty_dagger')).toBe(0);
    expect(derive(game.state, game.ctx)).toMatchObject({ attack: 4, strength: 3 }); // item 1/1 + Daggers tier 1 mastery 3/2
    setTier(game, 'daggers', 3);
    expect(derive(game.state, game.ctx)).toMatchObject({ attack: 10, strength: 7 });
  });

  it('shields go in the off hand and add defence only while equipped', () => {
    const game = newGame();
    setTier(game, 'shields', 2);
    expect(derive(game.state, game.ctx).defence).toBe(2);
    give(game, 'oak_shield', 1);
    expect(game.equip('oak_shield').ok).toBe(true);
    expect(game.state.player.equipment.off_hand).toBe('oak_shield');
    expect(game.hasShield()).toBe(true);
    expect(derive(game.state, game.ctx).defence).toBe(2 + 4 + 4); // armor T1 + shields T2 mastery + oak shield
  });

  it('dual wield needs the tree node; an off-hand dagger adds half its stats', () => {
    const game = newGame();
    give(game, 'bronze_dagger', 1);
    game.equip('rusty_dagger');
    expect(game.equip('bronze_dagger', 'off_hand')).toEqual({ ok: false, reason: 'Unlock "Dual Wield" in the Progression tree to fight with two weapons.' });
    give(game, 'bronze_sword', 1);
    unlock(game, 'dual_wield');
    expect(game.equip('bronze_sword', 'off_hand')).toEqual({ ok: false, reason: 'Only daggers and shields fit in the off hand.' });
    expect(game.equip('bronze_dagger', 'off_hand').ok).toBe(true);
    expect(game.state.player.equipment).toMatchObject({ main_hand: 'rusty_dagger', off_hand: 'bronze_dagger' });
    expect(derive(game.state, game.ctx)).toMatchObject({ attack: 1 + 2 + 3, strength: 1 + 1 + 2, attackIntervalMs: 2400 });
    expect(game.weaponSkill()).toBe('daggers');
  });

  it('trinkets fill the two trinket slots', () => {
    const game = newGame();
    give(game, 'copper_ring', 2);
    expect(game.equip('copper_ring').ok).toBe(true);
    expect(game.equip('copper_ring').ok).toBe(true);
    expect(game.state.player.equipment).toMatchObject({ trinket_1: 'copper_ring', trinket_2: 'copper_ring' });
    expect(derive(game.state, game.ctx)).toMatchObject({ attack: 4, strength: 2 });
  });

  it('swapping returns the old item, unequipping too', () => {
    const game = newGame();
    give(game, 'bronze_dagger', 1);
    game.equip('rusty_dagger');
    expect(game.equip('bronze_dagger').ok).toBe(true);
    expect(inventory.count(game.state, 'rusty_dagger')).toBe(1);
    expect(game.unequip('main_hand').ok).toBe(true);
    expect(inventory.count(game.state, 'bronze_dagger')).toBe(1);
    expect(game.unequip('main_hand')).toEqual({ ok: false, reason: 'Nothing is equipped there.' });
  });

  it('checks ownership, tier requirements and type', () => {
    const game = newGame();
    expect(game.equip('iron_sword')).toEqual({ ok: false, reason: "You don't have a Iron Sword." });
    give(game, 'iron_sword', 1);
    expect(game.equip('iron_sword')).toEqual({ ok: false, reason: 'Requires Swords tier 2.' });
    setTier(game, 'swords', 2);
    expect(game.equip('iron_sword').ok).toBe(true);
    expect(game.equip('shrimp')).toEqual({ ok: false, reason: 'Shrimp cannot be equipped.' });
    give(game, 'bronze_helmet', 1);
    expect(game.equip('bronze_helmet', 'main_hand')).toEqual({ ok: false, reason: 'Bronze Helmet does not fit in the main hand slot.' });
  });

  it('food heals up to max hp and refuses at full health', () => {
    const game = newGame();
    expect(game.consume('shrimp')).toEqual({ ok: false, reason: 'You are already at full health.' });
    game.state.player.hp = 43;
    expect(game.consume('shrimp').ok).toBe(true);
    expect(game.state.player.hp).toBe(45);
    expect(inventory.count(game.state, 'shrimp')).toBe(4);
  });
});
