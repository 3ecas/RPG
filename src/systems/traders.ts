/** Barter traders: a rotating subset of item-for-item offers, no gold involved. */
import { BALANCE } from '@/content/balance';
import type { Keyed, TraderDef, TraderOfferDef } from '@/types/content';
import type { TraderId } from '@/types/ids';
import type { GameState, TraderState } from '@/types/state';
import { fail, ok, type Result } from '@/types/result';
import type { Ctx } from './ctx';
import * as inventory from './inventory';
import { log } from './log';

export function here(state: GameState, ctx: Ctx): Keyed<TraderDef, TraderId>[] {
  return ctx.content.zone(state.player.zoneId).traders.map((id) => ctx.content.trader(id));
}

export function isHere(state: GameState, ctx: Ctx, traderId: TraderId): boolean {
  return ctx.content.zone(state.player.zoneId).traders.includes(traderId);
}

/** Picks a fresh random subset of offers and resets their uses. */
export function refresh(state: GameState, ctx: Ctx, traderId: TraderId): TraderState {
  const def = ctx.content.trader(traderId);
  const indices = def.offers.map((_, i) => i);
  for (let i = 0; i < def.offersShown; i++) {
    const j = i + Math.floor(ctx.rng.next() * (indices.length - i));
    [indices[i], indices[j]] = [indices[j]!, indices[i]!];
  }
  const offers = indices.slice(0, def.offersShown);
  const created: TraderState = {
    offers,
    usesLeft: offers.map((index) => def.offers[index]?.uses ?? BALANCE.TRADER_DEFAULT_USES),
    nextRefreshMs: state.time.nowMs + def.refreshMs,
  };
  state.world.traders[traderId] = created;
  return created;
}

/** Creates state for every trader that has none yet. Called at boot. */
export function ensure(state: GameState, ctx: Ctx): void {
  for (const traderId of ctx.content.traderIds) if (!state.world.traders[traderId]) refresh(state, ctx, traderId);
}

export function tick(state: GameState, ctx: Ctx): void {
  for (const [id, current] of Object.entries(state.world.traders)) {
    if (current && state.time.nowMs >= current.nextRefreshMs) refresh(state, ctx, id as TraderId);
  }
}

export function refreshInMs(state: GameState, traderId: TraderId): number {
  return Math.max(0, (state.world.traders[traderId]?.nextRefreshMs ?? state.time.nowMs) - state.time.nowMs);
}

export interface OfferView {
  slot: number;
  offer: TraderOfferDef;
  usesLeft: number;
  can: Result;
}

export function offers(state: GameState, ctx: Ctx, traderId: TraderId): OfferView[] {
  const def = ctx.content.trader(traderId);
  const current = state.world.traders[traderId];
  if (!current) return [];
  return current.offers.flatMap((offerIndex, slot) => {
    const offer = def.offers[offerIndex];
    return offer ? [{ slot, offer, usesLeft: current.usesLeft[slot] ?? 0, can: canBarter(state, ctx, traderId, slot) }] : [];
  });
}

export function canBarter(state: GameState, ctx: Ctx, traderId: TraderId, slot: number): Result {
  const def = ctx.content.trader(traderId);
  if (!isHere(state, ctx, traderId)) return fail(`${def.name} is not here.`);
  const current = state.world.traders[traderId];
  const offerIndex = current?.offers[slot];
  const offer = offerIndex === undefined ? undefined : def.offers[offerIndex];
  if (!current || !offer) return fail('No such offer.');
  if ((current.usesLeft[slot] ?? 0) < 1) return fail('Used up until the offers rotate.');
  const missing = inventory.missing(state, offer.give);
  if (missing.length > 0) return fail(`Missing: ${missing.map((m) => `${m.qty}× ${ctx.content.item(m.itemId).name}`).join(', ')}.`);
  if (!inventory.canAddAll(state, offer.get)) return fail('Inventory is full.');
  return ok();
}

export function barter(state: GameState, ctx: Ctx, traderId: TraderId, slot: number): Result {
  const check = canBarter(state, ctx, traderId, slot);
  if (!check.ok) return check;
  const def = ctx.content.trader(traderId);
  const current = state.world.traders[traderId]!;
  const offerIndex = current.offers[slot]!;
  const offer = def.offers[offerIndex]!;
  inventory.removeAll(state, ctx, offer.give);
  for (const s of offer.get) inventory.add(state, ctx, s.itemId, s.qty, 'trade');
  current.usesLeft[slot] = (current.usesLeft[slot] ?? 1) - 1;
  const describe = (stacks: readonly { itemId: string; qty: number }[]) => stacks.map((s) => `${s.qty}× ${ctx.content.item(s.itemId as never).name}`).join(', ');
  log(state, ctx, 'trade', `Trade with ${def.name}: ${describe(offer.give)} for ${describe(offer.get)}.`);
  ctx.events.emit('trader:bartered', { traderId, offerIndex });
  return ok();
}
