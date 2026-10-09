/**
 * The bag and the bank as pure operations on slots and stacks. The bag is 28
 * slots and almost nothing stacks: a log is a slot, so filling the bag and
 * walking to the bank is the loop. The bank stacks everything by item and
 * has as many stacks as it needs.
 */
import type { ItemStack } from '@/types/content';
import type { ItemId, ToolSkill } from '@/types/ids';

export const BAG_SLOTS = 28;

/** The tool belt: one tool per tool skill, worn, never in a bag slot. */
export type Belt = Partial<Record<ToolSkill, ItemStack>>;

/** What the tool of each tool skill is called. */
export const TOOL_NAMES: Readonly<Record<ToolSkill, string>> = { lumberjack: 'hatchet', mining: 'pickaxe', fishing: 'fishing rod' };

export function isToolSkill(skill: string): skill is ToolSkill {
  return skill === 'lumberjack' || skill === 'mining' || skill === 'fishing';
}

export type Slot = ItemStack | null;
export type Bag = Slot[];

export function emptyBag(): Bag {
  return new Array<Slot>(BAG_SLOTS).fill(null);
}

export function freeSlots(bag: Bag): number {
  let n = 0;
  for (const slot of bag) if (slot === null) n++;
  return n;
}

export function countInBag(bag: Bag, itemId: ItemId): number {
  let n = 0;
  for (const slot of bag) if (slot && slot.itemId === itemId) n += slot.qty;
  return n;
}

/** How many of `qty` would fit: a stackable item needs one slot unless it is already there, anything else a slot each. */
export function roomFor(bag: Bag, itemId: ItemId, qty: number, stackable: boolean): number {
  if (qty <= 0) return 0;
  if (stackable) return bag.some((s) => s?.itemId === itemId) || freeSlots(bag) > 0 ? qty : 0;
  return Math.min(qty, freeSlots(bag));
}

/** Puts `qty` of an item in the bag, as far as it fits. Returns how many did not. */
export function addToBag(bag: Bag, itemId: ItemId, qty: number, stackable: boolean): number {
  let left = qty;
  if (left <= 0) return 0;
  if (stackable) {
    const have = bag.find((s) => s?.itemId === itemId);
    if (have) {
      have.qty += left;
      return 0;
    }
    const free = bag.indexOf(null);
    if (free < 0) return left;
    bag[free] = { itemId, qty: left };
    return 0;
  }
  for (let i = 0; i < bag.length && left > 0; i++) {
    if (bag[i] !== null) continue;
    bag[i] = { itemId, qty: 1 };
    left--;
  }
  return left;
}

/** Takes up to `qty` of an item out of the bag, from whichever slots hold it. Returns how many came out. */
export function takeFromBag(bag: Bag, itemId: ItemId, qty: number): number {
  let left = qty;
  for (let i = 0; i < bag.length && left > 0; i++) {
    const stack = bag[i];
    if (!stack || stack.itemId !== itemId) continue;
    const n = Math.min(left, stack.qty);
    if (n === stack.qty) bag[i] = null;
    else stack.qty -= n;
    left -= n;
  }
  return qty - left;
}

/** Takes up to `qty` from a slot. Returns what came out, or null for an empty slot. */
export function takeFromSlot(bag: Bag, slot: number, qty: number): ItemStack | null {
  const stack = bag[slot];
  if (!stack || qty <= 0) return null;
  const n = Math.min(qty, stack.qty);
  if (n === stack.qty) bag[slot] = null;
  else stack.qty -= n;
  return { itemId: stack.itemId, qty: n };
}

/** Bank stacks: one per item, in the order they first arrived. */
export function addToStacks(stacks: ItemStack[], itemId: ItemId, qty: number): void {
  if (qty <= 0) return;
  const have = stacks.find((s) => s.itemId === itemId);
  if (have) have.qty += qty;
  else stacks.push({ itemId, qty });
}

export function countInStacks(stacks: ItemStack[], itemId: ItemId): number {
  return stacks.find((s) => s.itemId === itemId)?.qty ?? 0;
}

/** Takes up to `qty` of an item out of the stacks; an emptied stack disappears. Returns how many came out. */
export function takeFromStacks(stacks: ItemStack[], itemId: ItemId, qty: number): number {
  const index = stacks.findIndex((s) => s.itemId === itemId);
  const have = stacks[index];
  if (!have || qty <= 0) return 0;
  const n = Math.min(qty, have.qty);
  if (n === have.qty) stacks.splice(index, 1);
  else have.qty -= n;
  return n;
}
