/**
 * Objective evaluation shared by quests and missions. Counted kinds (kill,
 * craft, gather, talk, trade) advance from events; live kinds read the state.
 * Gather and craft objectives also look in the bag, so what you already hold
 * counts and nothing has to be redone after accepting.
 */
import { EQUIP_SLOTS } from '@/types/ids';
import type { Objective } from '@/types/content';
import type { GameState } from '@/types/state';
import type { Ctx, SystemListeners } from './ctx';
import * as inventory from './inventory';
import * as progression from './progression';
import * as skills from './skills';

export interface ObjectiveView {
  text: string;
  current: number;
  target: number;
  done: boolean;
}

/** An event that can advance counted objectives. */
export interface Tick {
  kind: 'kill' | 'craft' | 'gather' | 'talk' | 'trade';
  id: string;
}

export function target(o: Objective): number {
  switch (o.type) {
    case 'kill':
    case 'craft':
    case 'gather':
    case 'collect':
    case 'trade': return o.count;
    case 'reach_tier':
    case 'any_tier': return o.tier;
    case 'talk':
    case 'unlock':
    case 'visit':
    case 'equip': return 1;
  }
}

export function isCounted(o: Objective): boolean {
  return o.type === 'kill' || o.type === 'craft' || o.type === 'gather' || o.type === 'talk' || o.type === 'trade';
}

/** Whether an event advances this objective. */
export function matches(o: Objective, tick: Tick): boolean {
  switch (o.type) {
    case 'kill': return tick.kind === 'kill' && tick.id === o.monsterId;
    case 'craft': return tick.kind === 'craft' && tick.id === o.recipeId;
    case 'gather': return tick.kind === 'gather' && tick.id === o.itemId;
    case 'talk': return tick.kind === 'talk' && tick.id === o.npcId;
    case 'trade': return tick.kind === 'trade' && tick.id === o.kind;
    default: return false;
  }
}

export function view(state: GameState, ctx: Ctx, o: Objective, counted: number): ObjectiveView {
  const t = target(o);
  const make = (text: string, current: number) => ({ text, current: Math.min(current, t), target: t, done: current >= t });
  switch (o.type) {
    case 'kill': return make(`Defeat ${o.count}× ${ctx.content.monster(o.monsterId).name}`, counted);
    case 'craft': {
      const recipe = ctx.content.recipe(o.recipeId);
      const output = recipe.outputs[0];
      const held = output ? Math.floor(inventory.count(state, output.itemId) / output.qty) : 0;
      return make(`Craft or hold ${o.count}× ${ctx.content.recipeName(recipe)}`, Math.max(counted, held));
    }
    case 'gather': return make(`Gather or hold ${o.count}× ${ctx.content.item(o.itemId).name}`, Math.max(counted, inventory.count(state, o.itemId)));
    case 'talk': return make(`Talk to ${ctx.content.npc(o.npcId).name}`, Math.max(counted, state.world.talkedTo.includes(o.npcId) ? 1 : 0));
    case 'trade': return make(`${o.kind === 'market' ? 'Trade on the market' : o.kind === 'shop' ? 'Buy or sell at shops' : 'Barter with a trader'} ${o.count}×`, counted);
    case 'collect': return make(`Bring ${o.count}× ${ctx.content.item(o.itemId).name}`, inventory.count(state, o.itemId));
    case 'reach_tier': return make(`Reach ${ctx.content.skill(o.skill).name} tier ${o.tier}`, skills.tier(state, o.skill));
    case 'any_tier': return make(`Bring any skill to tier ${o.tier}`, Math.max(...ctx.content.skillIds.map((id) => skills.tier(state, id))));
    case 'unlock': return make(`Unlock "${ctx.content.progressNode(o.nodeId).name}" in the Progression tree`, progression.isUnlocked(state, o.nodeId) ? 1 : 0);
    case 'visit': return make(`Visit ${ctx.content.zone(o.zoneId).name}`, state.world.visitedZones.includes(o.zoneId) ? 1 : 0);
    case 'equip': {
      const worn = EQUIP_SLOTS.some((slot) => {
        const itemId = state.player.equipment[slot];
        return itemId !== null && ctx.content.item(itemId).equip?.kind === o.kind;
      });
      const label = o.kind === 'weapon' ? 'a weapon' : o.kind === 'shield' ? 'a shield' : o.kind === 'trinket' ? 'a trinket' : `${o.kind} armor`;
      return make(`Equip ${label}`, worn ? 1 : 0);
    }
  }
}

/** Listeners that turn game events into ticks for a tracker. */
export function listenersFor(advance: (state: GameState, ctx: Ctx, tick: Tick) => void): SystemListeners {
  return {
    'monster:killed': (state, ctx, e) => advance(state, ctx, { kind: 'kill', id: e.monsterId }),
    'recipe:crafted': (state, ctx, e) => advance(state, ctx, { kind: 'craft', id: e.recipeId }),
    'node:gathered': (state, ctx, e) => advance(state, ctx, { kind: 'gather', id: e.itemId }),
    'npc:talked': (state, ctx, e) => advance(state, ctx, { kind: 'talk', id: e.npcId }),
    'shop:bought': (state, ctx) => advance(state, ctx, { kind: 'trade', id: 'shop' }),
    'shop:sold': (state, ctx) => advance(state, ctx, { kind: 'trade', id: 'shop' }),
    'market:bought': (state, ctx) => advance(state, ctx, { kind: 'trade', id: 'market' }),
    'market:sold': (state, ctx) => advance(state, ctx, { kind: 'trade', id: 'market' }),
    'trader:bartered': (state, ctx) => advance(state, ctx, { kind: 'trade', id: 'barter' }),
  };
}
