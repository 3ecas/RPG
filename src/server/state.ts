/**
 * The part of a character that the slices keep adding to, as it lives in a
 * room (typed, in memory) and as it is stored (one JSON object under
 * `state` in the character record). Reading is forgiving: a missing part
 * starts fresh, an item or skill the content no longer has is dropped, and
 * a brand new character gets the starting kit.
 */
import type { ItemStack } from '@/types/content';
import type { ItemId, SkillId } from '@/types/ids';
import { addToBag, addToStacks, type Bag, BAG_SLOTS, emptyBag } from '@/world/bag';
import { MAX_XP } from '@/world/skills';

export interface PlayerState {
  /** Total xp per skill. */
  skills: Record<SkillId, number>;
  bag: Bag;
  bank: ItemStack[];
}

export interface StateContent {
  hasItem(id: string): id is ItemId;
  item(id: ItemId): { readonly stackable?: boolean };
  readonly skillIds: SkillId[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseStack(raw: unknown, content: StateContent): ItemStack | null {
  if (!isRecord(raw) || typeof raw.itemId !== 'string' || !content.hasItem(raw.itemId)) return null;
  if (typeof raw.qty !== 'number' || !Number.isInteger(raw.qty) || raw.qty <= 0) return null;
  return { itemId: raw.itemId, qty: raw.qty };
}

/** The live state from a stored document; `kit` is what a character with no bag yet starts with. */
export function parseState(raw: Record<string, unknown>, content: StateContent, kit: readonly Readonly<ItemStack>[]): PlayerState {
  const skills = {} as Record<SkillId, number>;
  const rawSkills = isRecord(raw.skills) ? raw.skills : {};
  for (const id of content.skillIds) {
    const xp = rawSkills[id];
    skills[id] = typeof xp === 'number' && Number.isFinite(xp) && xp > 0 ? Math.min(MAX_XP, Math.floor(xp)) : 0;
  }
  const bag = emptyBag();
  if (Array.isArray(raw.bag)) {
    raw.bag.slice(0, BAG_SLOTS).forEach((slot, i) => {
      const stack = parseStack(slot, content);
      if (stack) bag[i] = stack;
    });
  } else {
    for (const stack of kit) addToBag(bag, stack.itemId, stack.qty, content.item(stack.itemId).stackable === true);
  }
  const bank: ItemStack[] = [];
  if (Array.isArray(raw.bank)) {
    for (const entry of raw.bank) {
      const stack = parseStack(entry, content);
      if (stack) addToStacks(bank, stack.itemId, stack.qty);
    }
  }
  return { skills, bag, bank };
}

/** The document to store, a copy. */
export function stateOf(state: PlayerState): Record<string, unknown> {
  return {
    skills: { ...state.skills },
    bag: state.bag.map((s) => (s ? { itemId: s.itemId, qty: s.qty } : null)),
    bank: state.bank.map((s) => ({ itemId: s.itemId, qty: s.qty })),
  };
}
