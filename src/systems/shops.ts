/** Fixed-price shops with finite stock that restocks over game time. */
import type { Keyed, ShopDef, ShopStockDef } from '@/types/content';
import type { ItemId, ShopId } from '@/types/ids';
import type { GameState, ShopState } from '@/types/state';
import { fail, ok, type Result } from '@/types/result';
import type { Ctx } from './ctx';
import * as inventory from './inventory';
import { log } from './log';
import * as progression from './progression';

export function here(state: GameState, ctx: Ctx): Keyed<ShopDef, ShopId>[] {
  return ctx.content.zone(state.player.zoneId).shops.map((id) => ctx.content.shop(id));
}

export function isHere(state: GameState, ctx: Ctx, shopId: ShopId): boolean {
  return ctx.content.zone(state.player.zoneId).shops.includes(shopId);
}

function fullStock(shop: ShopDef, nowMs: number): ShopState {
  const created: ShopState = { stock: {}, lastRestockMs: nowMs };
  for (const entry of shop.stock) if (entry.qty !== 'infinite') created.stock[entry.itemId] = entry.qty;
  return created;
}

/** Creates state for every shop that has none yet (at full stock). Called at boot. */
export function ensure(state: GameState, ctx: Ctx): void {
  for (const shopId of ctx.content.shopIds) {
    if (!state.world.shops[shopId]) state.world.shops[shopId] = fullStock(ctx.content.shop(shopId), state.time.nowMs);
  }
}

function stateOf(state: GameState, ctx: Ctx, shopId: ShopId): ShopState {
  const existing = state.world.shops[shopId];
  if (existing) return existing;
  const created = fullStock(ctx.content.shop(shopId), state.time.nowMs);
  state.world.shops[shopId] = created;
  return created;
}

export function buyPrice(ctx: Ctx, shop: ShopDef, entry: ShopStockDef): number {
  return entry.price ?? Math.max(1, Math.round(ctx.content.item(entry.itemId).value * shop.markup));
}

export function sellPrice(state: GameState, ctx: Ctx, shop: ShopDef, itemId: ItemId): number {
  return Math.floor(ctx.content.item(itemId).value * shop.sellRate * (1 + progression.perk(state, ctx, 'sell_bonus')));
}

export interface StockView {
  itemId: ItemId;
  price: number;
  qty: number | 'infinite';
  max: number | 'infinite';
}

export function stock(state: GameState, ctx: Ctx, shopId: ShopId): StockView[] {
  const shop = ctx.content.shop(shopId);
  const current = state.world.shops[shopId] ?? fullStock(shop, state.time.nowMs);
  return shop.stock.map((entry) => ({
    itemId: entry.itemId,
    price: buyPrice(ctx, shop, entry),
    qty: entry.qty === 'infinite' ? 'infinite' : (current.stock[entry.itemId] ?? 0),
    max: entry.qty,
  }));
}

export function canSell(state: GameState, ctx: Ctx, shopId: ShopId, itemId: ItemId): Result {
  const shop = ctx.content.shop(shopId);
  const item = ctx.content.item(itemId);
  if (shop.buys !== 'all' && !shop.buys.includes(item.category)) return fail(`${shop.name} doesn't buy ${item.category} items.`);
  if (sellPrice(state, ctx, shop, itemId) < 1) return fail(`${item.name} is worth nothing to ${shop.name}.`);
  if (inventory.count(state, itemId) < 1) return fail(`You don't have any ${item.name}.`);
  return ok();
}

/** Buys up to `qty`, limited by stock and gold. Says so in the log when it bought fewer. */
export function buy(state: GameState, ctx: Ctx, shopId: ShopId, itemId: ItemId, qty: number): Result {
  const shop = ctx.content.shop(shopId);
  const item = ctx.content.item(itemId);
  if (!isHere(state, ctx, shopId)) return fail(`${shop.name} is not here.`);
  const entry = shop.stock.find((e) => e.itemId === itemId);
  if (!entry) return fail(`${shop.name} doesn't sell ${item.name}.`);
  const wanted = Math.floor(qty);
  if (wanted < 1) return fail('Nothing to buy.');
  const current = stateOf(state, ctx, shopId);
  const available = entry.qty === 'infinite' ? wanted : Math.min(wanted, current.stock[itemId] ?? 0);
  if (available < 1) return fail(`${shop.name} is out of ${item.name}. Stock returns over time.`);
  const price = buyPrice(ctx, shop, entry);
  const bought = Math.min(available, Math.floor(state.player.gold / price));
  if (bought < 1) return fail(`Not enough gold: ${item.name} costs ${price}.`);
  if (!inventory.canAdd(state, ctx, itemId)) return fail('Inventory is full.');

  const cost = bought * price;
  state.player.gold -= cost;
  if (entry.qty !== 'infinite') current.stock[itemId] = (current.stock[itemId] ?? 0) - bought;
  inventory.add(state, ctx, itemId, bought, 'shop');
  log(state, ctx, 'trade', `You buy ${bought}× ${item.name} from ${shop.name} for ${cost} gold${bought < wanted ? ` (wanted ${wanted})` : ''}.`);
  ctx.events.emit('shop:bought', { shopId, itemId, qty: bought, gold: cost });
  return ok();
}

export function sell(state: GameState, ctx: Ctx, shopId: ShopId, itemId: ItemId, qty: number): Result {
  const shop = ctx.content.shop(shopId);
  const item = ctx.content.item(itemId);
  if (!isHere(state, ctx, shopId)) return fail(`${shop.name} is not here.`);
  const check = canSell(state, ctx, shopId, itemId);
  if (!check.ok) return check;
  const sold = Math.min(Math.floor(qty), inventory.count(state, itemId));
  if (sold < 1) return fail('Nothing to sell.');
  const earned = sold * sellPrice(state, ctx, shop, itemId);
  inventory.remove(state, ctx, itemId, sold);
  state.player.gold += earned;
  log(state, ctx, 'trade', `You sell ${sold}× ${item.name} to ${shop.name} for ${earned} gold.`);
  ctx.events.emit('shop:sold', { shopId, itemId, qty: sold, gold: earned });
  return ok();
}

/** One unit of every finite item returns per restock interval, up to the shop's maximum. */
export function tick(state: GameState, ctx: Ctx): void {
  for (const [id, current] of Object.entries(state.world.shops)) {
    if (!current) continue;
    const shop = ctx.content.shop(id as ShopId);
    const steps = Math.floor((state.time.nowMs - current.lastRestockMs) / shop.restockMs);
    if (steps <= 0) continue;
    current.lastRestockMs += steps * shop.restockMs;
    for (const entry of shop.stock) {
      if (entry.qty === 'infinite') continue;
      current.stock[entry.itemId] = Math.min(entry.qty, (current.stock[entry.itemId] ?? 0) + steps);
    }
  }
}
