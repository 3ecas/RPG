import { describe, expect, it } from 'vitest';
import { BALANCE } from '@/content/balance';
import * as inventory from '@/systems/inventory';
import * as market from '@/systems/market';
import { give, newGame, tickFor } from '../helpers';

const HOUR = 3_600_000;

describe('shops', () => {
  it('sells from stock for gold and restocks over time', () => {
    const game = newGame();
    game.state.player.gold = 1000;
    const before = game.shopStock('smithy').find((r) => r.itemId === 'bronze_bar')!;
    expect(before).toMatchObject({ qty: 10, max: 10, price: 27 }); // 15 × 1.8

    expect(game.buy('smithy', 'bronze_bar', 4).ok).toBe(true);
    expect(inventory.count(game.state, 'bronze_bar')).toBe(4);
    expect(game.state.player.gold).toBe(1000 - 4 * 27);
    expect(game.shopStock('smithy').find((r) => r.itemId === 'bronze_bar')?.qty).toBe(6);

    // Buying more than the stock buys what is there.
    expect(game.buy('smithy', 'bronze_bar', 50).ok).toBe(true);
    expect(inventory.count(game.state, 'bronze_bar')).toBe(10);
    expect(game.buy('smithy', 'bronze_bar', 1)).toEqual({ ok: false, reason: "Orla's Smithy is out of Bronze Bar. Stock returns over time." });

    tickFor(game, 3 * (HOUR / 2)); // three restock intervals
    expect(game.shopStock('smithy').find((r) => r.itemId === 'bronze_bar')?.qty).toBe(3);
  });

  it('refuses without gold, without the shop present, and for items it does not sell', () => {
    const game = newGame();
    expect(game.buy('smithy', 'steel_bar', 1)).toEqual({ ok: false, reason: 'Not enough gold: Steel Bar costs 220.' });
    expect(game.buy('smithy', 'shrimp', 1)).toEqual({ ok: false, reason: "Orla's Smithy doesn't sell Shrimp." });
    game.travel('copper_hills');
    expect(game.buy('smithy', 'bronze_bar', 1)).toEqual({ ok: false, reason: "Orla's Smithy is not here." });
    expect(game.buy('prospectors_outpost', 'copper_ore', 2).ok).toBe(true); // 4 × 1.5 = 6 each, we have 10 gold
    expect(game.state.player.gold).toBe(10 - 6); // could only afford one
    expect(inventory.count(game.state, 'copper_ore')).toBe(1);
  });

  it('buys at the sell rate, only categories it wants', () => {
    const game = newGame();
    give(game, 'bronze_sword', 2);
    give(game, 'bone', 5);
    expect(game.sell('smithy', 'bronze_sword', 1).ok).toBe(true);
    expect(game.state.player.gold).toBe(10 + 17); // floor(35 × 0.5)
    expect(inventory.count(game.state, 'bronze_sword')).toBe(1);
    expect(game.sell('smithy', 'shrimp', 1)).toEqual({ ok: false, reason: "Orla's Smithy doesn't buy food items." });
    expect(game.sell('smithy', 'bone', 5)).toEqual({ ok: false, reason: "Orla's Smithy doesn't buy misc items." });
    expect(game.sell('hollow_goods', 'bone', 5)).toEqual({ ok: false, reason: 'Bone is worth nothing to Hollow Goods.' }); // floor(2 × 0.4) = 0
    expect(game.sell('hollow_goods', 'shrimp', 99).ok).toBe(true); // clamps to what you have
    expect(inventory.count(game.state, 'shrimp')).toBe(0);
  });
});

describe('market', () => {
  it('only opens in zones that have one', () => {
    const game = newGame();
    game.travel('copper_hills');
    expect(game.marketBuy('copper_ore', 1)).toEqual({ ok: false, reason: 'There is no market in Copper Hills.' });
    expect(game.marketOpen().ok).toBe(false);
  });

  it('moves prices with trades and applies the spread', () => {
    const game = newGame();
    game.state.player.gold = 10_000;
    const base = game.content.item('copper_ore').value; // 4
    expect(market.priceOf(game.state, game.ctx, 'copper_ore')).toBe(base);

    expect(game.marketBuy('copper_ore', 100).ok).toBe(true);
    expect(inventory.count(game.state, 'copper_ore')).toBe(100);
    const after = market.priceOf(game.state, game.ctx, 'copper_ore');
    expect(after).toBeCloseTo(base * Math.pow(1 + BALANCE.MARKET_IMPACT, 100), 6);
    expect(game.state.player.gold).toBeLessThan(10_000 - 100 * base); // spread + impact cost more than base

    const goldBefore = game.state.player.gold;
    expect(game.marketSell('copper_ore', 100).ok).toBe(true);
    expect(market.priceOf(game.state, game.ctx, 'copper_ore')).toBeLessThan(after);
    expect(game.state.player.gold).toBeGreaterThan(goldBefore);
    expect(game.state.player.gold).toBeLessThan(10_000); // round trip loses money
  });

  it('clamps prices and relaxes them back toward base over time', () => {
    const game = newGame();
    give(game, 'bone', 5000);
    expect(game.marketSell('bone', 5000).ok).toBe(true);
    const base = game.content.item('bone').value;
    expect(market.priceOf(game.state, game.ctx, 'bone')).toBeCloseTo(base * BALANCE.MARKET_MIN_RATIO, 6);

    tickFor(game, 3 * HOUR);
    const relaxed = market.priceOf(game.state, game.ctx, 'bone');
    expect(relaxed).toBeGreaterThan(base * 0.9);
    expect(relaxed).toBeLessThan(base * 1.1);
  });

  it('buys as much as the gold allows', () => {
    const game = newGame();
    game.state.player.gold = 20;
    expect(game.marketBuy('copper_ore', 100).ok).toBe(true); // 4 × 1.04 → 4 gold each, rising
    expect(inventory.count(game.state, 'copper_ore')).toBeGreaterThanOrEqual(4);
    expect(inventory.count(game.state, 'copper_ore')).toBeLessThan(6);
    expect(game.state.player.gold).toBeLessThan(4);
    game.state.player.gold = 0;
    expect(game.marketBuy('copper_ore', 1)).toEqual({ ok: false, reason: 'Not enough gold: Copper Ore costs 4.' });
    expect(game.marketBuy('bronze_sword', 1)).toEqual({ ok: false, reason: "The market doesn't trade Bronze Sword." });
  });
});

describe('traders', () => {
  it('shows a rotating subset of offers', () => {
    const game = newGame();
    game.travel('copper_hills');
    const shown = game.traderOffers('peddler_vex');
    expect(shown).toHaveLength(3);
    expect(new Set(game.state.world.traders.peddler_vex!.offers).size).toBe(3);
    const before = [...game.state.world.traders.peddler_vex!.offers];
    tickFor(game, 30 * 60_000);
    const after = game.state.world.traders.peddler_vex!.offers;
    expect(after).toHaveLength(3);
    expect(game.state.world.traders.peddler_vex!.nextRefreshMs).toBe(game.state.time.nowMs + 30 * 60_000);
    // Rotation is random; over a few refreshes the set must change at least once.
    let changed = before.join() !== after.join();
    for (let i = 0; i < 5 && !changed; i++) {
      tickFor(game, 30 * 60_000);
      changed = game.state.world.traders.peddler_vex!.offers.join() !== before.join();
    }
    expect(changed).toBe(true);
  });

  it('swaps items and limits uses', () => {
    const game = newGame();
    game.travel('copper_hills');
    // Force a known offer into slot 0: 20 oak logs → 3 iron ore, 5 uses.
    game.state.world.traders.peddler_vex = { offers: [1, 2, 3], usesLeft: [5, 5, 3], nextRefreshMs: 10 * HOUR };
    expect(game.barter('peddler_vex', 0)).toEqual({ ok: false, reason: 'Missing: 20× Oak Log.' });
    give(game, 'oak_log', 100);
    for (let i = 0; i < 5; i++) expect(game.barter('peddler_vex', 0).ok).toBe(true);
    expect(inventory.count(game.state, 'oak_log')).toBe(0);
    expect(inventory.count(game.state, 'iron_ore')).toBe(15);
    expect(game.barter('peddler_vex', 0)).toEqual({ ok: false, reason: 'Used up until the offers rotate.' });
    expect(game.barter('peddler_vex', 7)).toEqual({ ok: false, reason: 'No such offer.' });
    game.travel('greenhollow');
    expect(game.barter('peddler_vex', 1)).toEqual({ ok: false, reason: 'Vex is not here.' });
  });
});
