import type { EquipSlot, ItemId } from '@/types/ids';
import type { GameState } from '@/types/state';
import { fail, ok, type Result } from '@/types/result';
import type { Ctx } from './ctx';
import * as inventory from './inventory';
import * as skills from './skills';
import { clampVitals } from './stats';

export function canEquip(state: GameState, ctx: Ctx, itemId: ItemId): Result {
  const item = ctx.content.item(itemId);
  if (!item.equip) return fail(`${item.name} cannot be equipped.`);
  if (inventory.count(state, itemId) < 1) return fail(`You don't have a ${item.name}.`);
  for (const req of item.equip.requirements ?? []) {
    if (skills.level(state, req.skill) < req.level) return fail(`Requires ${ctx.content.skill(req.skill).name} level ${req.level}.`);
  }
  return ok();
}

export function equip(state: GameState, ctx: Ctx, itemId: ItemId): Result {
  const check = canEquip(state, ctx, itemId);
  if (!check.ok) return check;
  const slot = ctx.content.item(itemId).equip!.slot;
  const current = state.player.equipment[slot];
  inventory.remove(state, ctx, itemId, 1);
  if (current && !inventory.add(state, ctx, current, 1, 'unequip')) {
    inventory.add(state, ctx, itemId, 1, 'unequip');
    return fail('Inventory is full.');
  }
  state.player.equipment[slot] = itemId;
  clampVitals(state, ctx);
  return ok();
}

export function unequip(state: GameState, ctx: Ctx, slot: EquipSlot): Result {
  const current = state.player.equipment[slot];
  if (!current) return fail('Nothing is equipped there.');
  if (!inventory.add(state, ctx, current, 1, 'unequip')) return fail('Inventory is full.');
  state.player.equipment[slot] = null;
  clampVitals(state, ctx);
  return ok();
}
