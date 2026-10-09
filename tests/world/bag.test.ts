import { describe, expect, it } from 'vitest';
import type { ItemStack } from '@/types/content';
import { addToBag, addToStacks, BAG_SLOTS, countInBag, countInStacks, emptyBag, freeSlots, roomFor, takeFromSlot, takeFromStacks } from '@/world/bag';

describe('bag', () => {
  it('has 28 empty slots to begin with', () => {
    const bag = emptyBag();
    expect(bag).toHaveLength(BAG_SLOTS);
    expect(freeSlots(bag)).toBe(28);
    expect(countInBag(bag, 'oak_log')).toBe(0);
  });

  it('gives a slot to each of a plain item and one slot to any number of a stackable one', () => {
    const bag = emptyBag();
    expect(addToBag(bag, 'oak_log', 3, false)).toBe(0);
    expect(bag.slice(0, 4)).toEqual([{ itemId: 'oak_log', qty: 1 }, { itemId: 'oak_log', qty: 1 }, { itemId: 'oak_log', qty: 1 }, null]);
    expect(addToBag(bag, 'coal', 50, true)).toBe(0);
    expect(addToBag(bag, 'coal', 25, true)).toBe(0);
    expect(bag[3]).toEqual({ itemId: 'coal', qty: 75 });
    expect(countInBag(bag, 'coal')).toBe(75);
    expect(countInBag(bag, 'oak_log')).toBe(3);
    expect(freeSlots(bag)).toBe(24);
  });

  it('says how much fits and leaves the rest', () => {
    const bag = emptyBag();
    expect(addToBag(bag, 'oak_log', 30, false)).toBe(2);
    expect(freeSlots(bag)).toBe(0);
    expect(roomFor(bag, 'oak_log', 1, false)).toBe(0);
    expect(roomFor(bag, 'coal', 5, true)).toBe(0); // no slot to start a stack in
    takeFromSlot(bag, 0, 1);
    expect(roomFor(bag, 'oak_log', 3, false)).toBe(1);
    expect(roomFor(bag, 'coal', 5, true)).toBe(5);
    addToBag(bag, 'coal', 1, true);
    expect(roomFor(bag, 'coal', 500, true)).toBe(500); // on an existing stack, everything fits
    expect(addToBag(bag, 'oak_log', 0, false)).toBe(0);
  });

  it('takes some or all of a slot', () => {
    const bag = emptyBag();
    addToBag(bag, 'coal', 10, true);
    expect(takeFromSlot(bag, 0, 4)).toEqual({ itemId: 'coal', qty: 4 });
    expect(bag[0]).toEqual({ itemId: 'coal', qty: 6 });
    expect(takeFromSlot(bag, 0, 99)).toEqual({ itemId: 'coal', qty: 6 });
    expect(bag[0]).toBeNull();
    expect(takeFromSlot(bag, 0, 1)).toBeNull();
    expect(takeFromSlot(bag, 5, 0)).toBeNull();
  });
});

describe('bank stacks', () => {
  it('stacks everything by item, in order of arrival, and hands back what it has', () => {
    const stacks: ItemStack[] = [];
    addToStacks(stacks, 'oak_log', 3);
    addToStacks(stacks, 'coal', 2);
    addToStacks(stacks, 'oak_log', 4);
    addToStacks(stacks, 'coal', 0);
    expect(stacks).toEqual([{ itemId: 'oak_log', qty: 7 }, { itemId: 'coal', qty: 2 }]);
    expect(countInStacks(stacks, 'oak_log')).toBe(7);
    expect(takeFromStacks(stacks, 'oak_log', 5)).toBe(5);
    expect(takeFromStacks(stacks, 'coal', 9)).toBe(2);
    expect(stacks).toEqual([{ itemId: 'oak_log', qty: 2 }]);
    expect(takeFromStacks(stacks, 'coal', 1)).toBe(0);
    expect(countInStacks(stacks, 'coal')).toBe(0);
  });
});
