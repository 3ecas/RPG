/**
 * Eating. Food heals once it is down, which takes a moment; nothing else
 * about it is quick either. Pure numbers, shared by the room and the bag
 * menu.
 */
import type { Effect } from '@/types/content';

/** Ticks (50 ms steps) from the first bite to the food doing its work. */
export const EAT_TICKS = 35;

/** How much an item heals when eaten; 0 for anything that is not food. */
export function healOf(item: { readonly consume?: { readonly effects: readonly Effect[] } }): number {
  let total = 0;
  for (const effect of item.consume?.effects ?? []) if (effect.type === 'heal') total += effect.amount;
  return total;
}
