import { BALANCE } from '@/content/balance';
import { STARTING_KIT } from '@/content/starting-kit';
import type { Registry } from '@/core/registry';
import { SAVE_VERSION } from '@/core/migrations';
import { EQUIP_SLOTS, type EquipSlot, type ItemId, type SkillId } from '@/types/ids';
import type { GameState } from '@/types/state';
import { maxHpForTier } from './formulas';

export function createInitialState(content: Registry, seed: number, now: number): GameState {
  const skills = Object.fromEntries(content.skillIds.map((id) => [id, { xp: 0 }])) as Record<SkillId, { xp: number }>;
  const equipment = Object.fromEntries(EQUIP_SLOTS.map((slot) => [slot, null])) as Record<EquipSlot, ItemId | null>;
  return {
    version: SAVE_VERSION,
    meta: { createdAt: now, lastTickAt: now, seed, rngState: seed },
    time: { nowMs: 0 },
    player: {
      name: STARTING_KIT.name,
      hp: maxHpForTier(1),
      mana: 0,
      gold: STARTING_KIT.gold,
      zoneId: BALANCE.START_ZONE,
      skills,
      equipment,
      buffs: [],
      regenMs: 0,
    },
    inventory: STARTING_KIT.items.map((s) => ({ ...s })),
    activity: null,
    combat: null,
    quests: { active: {}, completed: [] },
    world: { unlockedZones: [], flags: {}, talkedTo: [], shops: {}, market: { lastUpdateMs: 0, prices: {} }, traders: {} },
    log: [{ t: 0, kind: 'info', text: `Welcome to ${content.zone(BALANCE.START_ZONE).name}. Pick something up and get to work.` }],
  };
}
