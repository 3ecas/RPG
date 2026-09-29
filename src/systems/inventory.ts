import { BALANCE } from '@/content/balance';
import type { ItemStack } from '@/types/content';
import type { ItemId } from '@/types/ids';
import type { GameState } from '@/types/state';
import type { Ctx } from './ctx';

export function count(state: GameState, itemId: ItemId): number {
  return state.inventory.find((s) => s.itemId === itemId)?.qty ?? 0;
}

export function has(state: GameState, stacks: readonly Readonly<ItemStack>[]): boolean {
  return stacks.every((s) => count(state, s.itemId) >= s.qty);
}

/** The part of `stacks` the player does not have. Empty when `has` is true. */
export function missing(state: GameState, stacks: readonly Readonly<ItemStack>[]): ItemStack[] {
  return stacks.flatMap((s) => {
    const short = s.qty - count(state, s.itemId);
    return short > 0 ? [{ itemId: s.itemId, qty: short }] : [];
  });
}

export function freeSlots(state: GameState): number {
  return Math.max(0, BALANCE.INVENTORY_SLOTS - state.inventory.length);
}

/** True if a stack of this item exists or there is a free slot for one. */
export function canAdd(state: GameState, itemId: ItemId): boolean {
  return count(state, itemId) > 0 || freeSlots(state) > 0;
}

/** True if every listed item can be added (distinct new items each need a slot). */
export function canAddAll(state: GameState, stacks: readonly Readonly<ItemStack>[]): boolean {
  const newItems = new Set(stacks.filter((s) => count(state, s.itemId) === 0).map((s) => s.itemId));
  return newItems.size <= freeSlots(state);
}

/** Adds to a stack. Returns false (and adds nothing) when there is no room. */
export function add(state: GameState, ctx: Ctx, itemId: ItemId, qty: number, source: string): boolean {
  if (qty <= 0) return true;
  const stack = state.inventory.find((s) => s.itemId === itemId);
  if (stack) {
    stack.qty += qty;
  } else {
    if (freeSlots(state) <= 0) return false;
    state.inventory.push({ itemId, qty });
  }
  ctx.events.emit('item:gained', { itemId, qty, source });
  return true;
}

/** Removes from a stack. Returns false (and removes nothing) when the player has too few. */
export function remove(state: GameState, ctx: Ctx, itemId: ItemId, qty: number): boolean {
  if (qty <= 0) return true;
  const index = state.inventory.findIndex((s) => s.itemId === itemId);
  const stack = state.inventory[index];
  if (!stack || stack.qty < qty) return false;
  stack.qty -= qty;
  if (stack.qty === 0) state.inventory.splice(index, 1);
  ctx.events.emit('item:removed', { itemId, qty });
  return true;
}

/** All or nothing. */
export function removeAll(state: GameState, ctx: Ctx, stacks: readonly Readonly<ItemStack>[]): boolean {
  if (!has(state, stacks)) return false;
  for (const s of stacks) remove(state, ctx, s.itemId, s.qty);
  return true;
}
