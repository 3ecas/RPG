import { EQUIP_SLOTS, type EquipSlot, type GearKind, type ItemId } from '@/types/ids';
import type { GameState } from '@/types/state';
import { fail, ok, type Result } from '@/types/result';
import type { Ctx } from './ctx';
import * as inventory from './inventory';
import * as progression from './progression';
import * as skills from './skills';
import { clampVitals } from './stats';

/** Slots that accept a kind of gear, preferred first. */
export function slotsFor(kind: GearKind): EquipSlot[] {
  switch (kind) {
    case 'weapon': return ['main_hand', 'off_hand'];
    case 'shield': return ['off_hand'];
    case 'trinket': return ['trinket_1', 'trinket_2'];
    default: return [kind];
  }
}

export const SLOT_NAMES: Readonly<Record<EquipSlot, string>> = {
  head: 'Head', body: 'Torso', legs: 'Legs', hands: 'Hands', feet: 'Feet',
  main_hand: 'Main hand', off_hand: 'Off hand', trinket_1: 'Trinket', trinket_2: 'Trinket',
};

/** Where an item would go: a free matching slot first, else the preferred one (swapping). */
export function defaultSlot(state: GameState, ctx: Ctx, itemId: ItemId): EquipSlot | null {
  const equip = ctx.content.item(itemId).equip;
  if (!equip) return null;
  const options = slotsFor(equip.kind);
  if (equip.kind === 'weapon') return 'main_hand';
  return options.find((slot) => state.player.equipment[slot] === null) ?? options[0] ?? null;
}

export function canEquip(state: GameState, ctx: Ctx, itemId: ItemId, slot?: EquipSlot): Result {
  const item = ctx.content.item(itemId);
  if (!item.equip) return fail(`${item.name} cannot be equipped.`);
  if (inventory.count(state, itemId) < 1) return fail(`You don't have a ${item.name}.`);
  const target = slot ?? defaultSlot(state, ctx, itemId);
  if (!target || !slotsFor(item.equip.kind).includes(target)) return fail(`${item.name} does not fit in the ${SLOT_NAMES[target ?? 'main_hand'].toLowerCase()} slot.`);
  if (target === 'off_hand' && item.equip.kind === 'weapon') {
    if (item.equip.weaponType !== 'dagger') return fail('Only daggers and shields fit in the off hand.');
    if (!progression.hasFeature(state, ctx, 'dual_wield')) return fail('Unlock "Dual Wield" in the Progression tree to fight with two weapons.');
  }
  for (const req of item.equip.requirements ?? []) {
    if (skills.tier(state, req.skill) < req.tier) return fail(`Requires ${ctx.content.skill(req.skill).name} tier ${req.tier}.`);
  }
  return ok();
}

export function equip(state: GameState, ctx: Ctx, itemId: ItemId, slot?: EquipSlot): Result {
  const check = canEquip(state, ctx, itemId, slot);
  if (!check.ok) return check;
  const target = (slot ?? defaultSlot(state, ctx, itemId)) as EquipSlot;
  const current = state.player.equipment[target];
  inventory.remove(state, ctx, itemId, 1);
  if (current && !inventory.add(state, ctx, current, 1, 'unequip')) {
    inventory.add(state, ctx, itemId, 1, 'unequip');
    return fail('Inventory is full.');
  }
  state.player.equipment[target] = itemId;
  clampVitals(state, ctx);
  return ok();
}

export function unequip(state: GameState, ctx: Ctx, slot: EquipSlot): Result {
  if (!EQUIP_SLOTS.includes(slot)) return fail('No such slot.');
  const current = state.player.equipment[slot];
  if (!current) return fail('Nothing is equipped there.');
  if (!inventory.add(state, ctx, current, 1, 'unequip')) return fail('Inventory is full.');
  state.player.equipment[slot] = null;
  clampVitals(state, ctx);
  return ok();
}
