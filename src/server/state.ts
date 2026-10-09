/**
 * The part of a character that the slices keep adding to, as it lives in a
 * room (typed, in memory) and as it is stored (one JSON object under
 * `state` in the character record). Reading is forgiving: a missing part
 * starts fresh, an item or skill the content no longer has is dropped, and
 * a brand new character gets the starting kit.
 */
import type { EquipInfo, ItemStack } from '@/types/content';
import { EQUIP_SLOTS, type EquipSlot, type ItemId, type SkillId } from '@/types/ids';
import { addToBag, addToStacks, type Bag, BAG_SLOTS, emptyBag } from '@/world/bag';
import { MAX_XP } from '@/world/skills';
import { slotsFor } from '@/world/stats';

/** What is worn, by slot. Gear is never stacked: a slot holds one. */
export type Gear = Partial<Record<EquipSlot, ItemStack>>;

export interface PlayerState {
  /** Total xp per skill. */
  skills: Record<SkillId, number>;
  bag: Bag;
  bank: ItemStack[];
  gear: Gear;
  /** Current hit points and mana; Infinity when unknown, which the room reads as full. */
  hp: number;
  mana: number;
}

export interface StateContent {
  hasItem(id: string): id is ItemId;
  item(id: ItemId): { readonly stackable?: boolean; readonly equip?: EquipInfo };
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

function parsePoints(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : Infinity;
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
  const gear: Gear = {};
  if (isRecord(raw.gear)) {
    for (const slot of EQUIP_SLOTS) {
      const stack = parseStack(raw.gear[slot], content);
      const equip = stack ? content.item(stack.itemId).equip : undefined;
      if (stack && equip && slotsFor(equip.kind).includes(slot)) gear[slot] = { itemId: stack.itemId, qty: 1 };
    }
  }
  return { skills, bag, bank, gear, hp: parsePoints(raw.hp), mana: parsePoints(raw.mana) };
}

/** The document to store, a copy. */
export function stateOf(state: PlayerState): Record<string, unknown> {
  const gear: Record<string, ItemStack> = {};
  for (const slot of EQUIP_SLOTS) {
    const worn = state.gear[slot];
    if (worn) gear[slot] = { itemId: worn.itemId, qty: worn.qty };
  }
  return {
    skills: { ...state.skills },
    bag: state.bag.map((s) => (s ? { itemId: s.itemId, qty: s.qty } : null)),
    bank: state.bank.map((s) => ({ itemId: s.itemId, qty: s.qty })),
    gear,
    hp: state.hp,
    mana: state.mana,
  };
}
