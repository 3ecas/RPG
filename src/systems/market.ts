/**
 * A simulated exchange. Every listed item has a price that the player's own
 * trades push (buying up, selling down), that relaxes toward the item's base
 * value over game time, and that drifts a little at random.
 */
import { BALANCE } from '@/content/balance';
import type { ItemId } from '@/types/ids';
import type { GameState } from '@/types/state';
import { fail, ok, type Result } from '@/types/result';
import type { Ctx } from './ctx';
import * as inventory from './inventory';
import { log } from './log';
import * as progression from './progression';

export type TradeKind = 'buy' | 'sell';

export function isOpen(state: GameState, ctx: Ctx): Result {
  if (!progression.hasFeature(state, ctx, 'market')) return fail('Unlock "Kingsport" in the Progression tree to reach the market.');
  const zone = ctx.content.zone(state.player.zoneId);
  return zone.market ? ok() : fail(`There is no market in ${zone.name}.`);
}

function baseValue(ctx: Ctx, itemId: ItemId): number {
  return ctx.content.item(itemId).value;
}

function clampPrice(ctx: Ctx, itemId: ItemId, price: number): number {
  const base = baseValue(ctx, itemId);
  return Math.min(base * BALANCE.MARKET_MAX_RATIO, Math.max(base * BALANCE.MARKET_MIN_RATIO, price));
}

export function priceOf(state: GameState, ctx: Ctx, itemId: ItemId): number {
  return state.world.market.prices[itemId] ?? baseValue(ctx, itemId);
}

export function unitPrice(kind: TradeKind, price: number): number {
  const spread = kind === 'buy' ? 1 + BALANCE.MARKET_SPREAD : 1 - BALANCE.MARKET_SPREAD;
  return Math.max(1, Math.round(price * spread));
}

export interface Quote {
  /** Units actually covered by the quote (a buy stops when the budget runs out). */
  qty: number;
  total: number;
  priceAfter: number;
}

/** Total cost or proceeds for `qty` units, each unit moving the price for the next. */
export function quote(state: GameState, ctx: Ctx, kind: TradeKind, itemId: ItemId, qty: number, budget = Infinity): Quote {
  let price = priceOf(state, ctx, itemId);
  let total = 0;
  let units = 0;
  while (units < qty) {
    const unit = unitPrice(kind, price);
    if (kind === 'buy' && total + unit > budget) break;
    total += unit;
    units += 1;
    price = clampPrice(ctx, itemId, price * (kind === 'buy' ? 1 + BALANCE.MARKET_IMPACT : 1 - BALANCE.MARKET_IMPACT));
  }
  return { qty: units, total, priceAfter: price };
}

export function buy(state: GameState, ctx: Ctx, itemId: ItemId, qty: number): Result {
  const open = isOpen(state, ctx);
  if (!open.ok) return open;
  const item = ctx.content.item(itemId);
  if (!ctx.content.isMarketItem(itemId)) return fail(`The market doesn't trade ${item.name}.`);
  const wanted = Math.floor(qty);
  if (wanted < 1) return fail('Nothing to buy.');
  if (!inventory.canAdd(state, ctx, itemId)) return fail('Inventory is full.');
  const q = quote(state, ctx, 'buy', itemId, wanted, state.player.gold);
  if (q.qty < 1) return fail(`Not enough gold: ${item.name} costs ${unitPrice('buy', priceOf(state, ctx, itemId))}.`);

  state.player.gold -= q.total;
  state.world.market.prices[itemId] = q.priceAfter;
  inventory.add(state, ctx, itemId, q.qty, 'market');
  log(state, ctx, 'trade', `Market: bought ${q.qty}× ${item.name} for ${q.total} gold${q.qty < wanted ? ` (wanted ${wanted})` : ''}.`);
  ctx.events.emit('market:bought', { itemId, qty: q.qty, gold: q.total });
  return ok();
}

export function sell(state: GameState, ctx: Ctx, itemId: ItemId, qty: number): Result {
  const open = isOpen(state, ctx);
  if (!open.ok) return open;
  const item = ctx.content.item(itemId);
  if (!ctx.content.isMarketItem(itemId)) return fail(`The market doesn't trade ${item.name}.`);
  const sold = Math.min(Math.floor(qty), inventory.count(state, itemId));
  if (sold < 1) return fail(`You don't have any ${item.name}.`);
  const q = quote(state, ctx, 'sell', itemId, sold);

  inventory.remove(state, ctx, itemId, q.qty);
  state.player.gold += q.total;
  state.world.market.prices[itemId] = q.priceAfter;
  log(state, ctx, 'trade', `Market: sold ${q.qty}× ${item.name} for ${q.total} gold.`);
  ctx.events.emit('market:sold', { itemId, qty: q.qty, gold: q.total });
  return ok();
}

/** Prices relax toward base value and wobble, once per market tick of game time. */
export function tick(state: GameState, ctx: Ctx): void {
  const market = state.world.market;
  const steps = Math.floor((state.time.nowMs - market.lastUpdateMs) / BALANCE.MARKET_TICK_MS);
  if (steps <= 0) return;
  market.lastUpdateMs += steps * BALANCE.MARKET_TICK_MS;
  for (const itemId of ctx.content.marketItems) {
    const base = baseValue(ctx, itemId);
    let price = market.prices[itemId] ?? base;
    for (let i = 0; i < steps; i++) {
      price += (base - price) * BALANCE.MARKET_RELAX;
      price *= 1 + (ctx.rng.next() * 2 - 1) * BALANCE.MARKET_DRIFT;
    }
    market.prices[itemId] = clampPrice(ctx, itemId, price);
  }
}

export interface MarketView {
  itemId: ItemId;
  price: number;
  base: number;
  buy: number;
  sell: number;
  have: number;
}

export function view(state: GameState, ctx: Ctx): MarketView[] {
  return ctx.content.marketItems.map((itemId) => {
    const price = priceOf(state, ctx, itemId);
    return { itemId, price, base: baseValue(ctx, itemId), buy: unitPrice('buy', price), sell: unitPrice('sell', price), have: inventory.count(state, itemId) };
  });
}
