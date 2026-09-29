/**
 * Serialize / deserialize the game state. Deserializing migrates old formats
 * and then sanitizes: anything that references content that no longer exists
 * is dropped, missing sections fall back to a fresh state.
 */
import type { GameState, LogKind } from '@/types/state';
import { EQUIP_SLOTS, type ItemId } from '@/types/ids';
import type { Registry } from './registry';
import { migrate, SAVE_VERSION } from './migrations';

type Raw = Record<string, unknown>;

const LOG_KINDS: readonly LogKind[] = ['info', 'loot', 'combat', 'quest', 'level', 'warn', 'trade'];
const COMBAT_STYLES = ['attack', 'strength', 'defence'] as const;

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** Throws on unreadable input; returns a usable state otherwise. */
export function deserialize(json: string, content: Registry, fresh: GameState): GameState {
  const parsed: unknown = JSON.parse(json);
  if (!isRecord(parsed)) throw new Error('Save data is not an object.');
  return sanitize(migrate(parsed), content, fresh);
}

function sanitize(raw: Raw, content: Registry, fresh: GameState): GameState {
  const s: GameState = structuredClone(fresh);
  s.version = SAVE_VERSION;

  const meta = rec(raw.meta);
  if (meta) {
    s.meta.createdAt = num(meta.createdAt, s.meta.createdAt);
    s.meta.lastTickAt = num(meta.lastTickAt, s.meta.lastTickAt);
    s.meta.seed = num(meta.seed, s.meta.seed);
    s.meta.rngState = num(meta.rngState, s.meta.rngState);
  }
  const time = rec(raw.time);
  if (time) s.time.nowMs = Math.max(0, num(time.nowMs, 0));

  const p = rec(raw.player);
  if (p) {
    s.player.name = str(p.name, s.player.name);
    s.player.hp = Math.max(1, num(p.hp, s.player.hp));
    s.player.mana = Math.max(0, num(p.mana, s.player.mana));
    s.player.gold = Math.max(0, num(p.gold, 0));
    s.player.regenMs = Math.max(0, num(p.regenMs, 0));
    if (typeof p.zoneId === 'string' && content.hasZone(p.zoneId)) s.player.zoneId = p.zoneId;
    if (typeof p.combatStyle === 'string' && (COMBAT_STYLES as readonly string[]).includes(p.combatStyle)) {
      s.player.combatStyle = p.combatStyle as GameState['player']['combatStyle'];
    }
    const skills = rec(p.skills);
    if (skills) {
      for (const skill of content.skillIds) {
        const entry = rec(skills[skill]);
        if (entry) s.player.skills[skill] = { xp: Math.max(0, num(entry.xp, 0)) };
      }
    }
    const equipment = rec(p.equipment);
    if (equipment) {
      for (const slot of EQUIP_SLOTS) {
        const itemId = equipment[slot];
        s.player.equipment[slot] =
          typeof itemId === 'string' && content.hasItem(itemId) && content.item(itemId).equip?.slot === slot ? itemId : null;
      }
    }
    if (Array.isArray(p.buffs)) {
      s.player.buffs = p.buffs.flatMap((b: unknown) => {
        const r = rec(b);
        if (!r || typeof r.stat !== 'string' || typeof r.source !== 'string' || !content.hasItem(r.source)) return [];
        return [{ stat: r.stat as GameState['player']['buffs'][number]['stat'], amount: num(r.amount, 0), expiresAtMs: num(r.expiresAtMs, 0), source: r.source }];
      });
    }
  }

  if (Array.isArray(raw.inventory)) {
    const merged = new Map<string, number>();
    for (const entry of raw.inventory) {
      const r = rec(entry);
      if (!r || typeof r.itemId !== 'string' || !content.hasItem(r.itemId)) continue;
      const qty = Math.floor(num(r.qty, 0));
      if (qty > 0) merged.set(r.itemId, (merged.get(r.itemId) ?? 0) + qty);
    }
    s.inventory = [...merged].map(([itemId, qty]) => ({ itemId: itemId as GameState['inventory'][number]['itemId'], qty }));
  }

  s.activity = validActivity(raw.activity, content);
  const combat = rec(raw.combat);
  if (s.activity?.kind === 'combat' && combat && typeof combat.monsterId === 'string' && content.hasMonster(combat.monsterId)) {
    s.combat = {
      monsterId: combat.monsterId,
      monsterHp: Math.max(1, num(combat.monsterHp, content.monster(combat.monsterId).hp)),
      playerTimerMs: Math.max(0, num(combat.playerTimerMs, 0)),
      monsterTimerMs: Math.max(0, num(combat.monsterTimerMs, 0)),
      kills: Math.max(0, num(combat.kills, 0)),
    };
  } else {
    s.combat = null;
    if (s.activity?.kind === 'combat') s.activity = null;
  }

  const quests = rec(raw.quests);
  if (quests) {
    const completed = Array.isArray(quests.completed) ? quests.completed.filter((q: unknown): q is string => typeof q === 'string' && content.hasQuest(q)) : [];
    s.quests.completed = [...new Set(completed)] as GameState['quests']['completed'];
    const active = rec(quests.active);
    if (active) {
      for (const [questId, progress] of Object.entries(active)) {
        if (!content.hasQuest(questId) || s.quests.completed.includes(questId)) continue;
        const r = rec(progress);
        const objectiveCount = content.quest(questId).objectives.length;
        const counts = Array.isArray(r?.counts) ? r.counts.map((c: unknown) => Math.max(0, num(c, 0))) : [];
        while (counts.length < objectiveCount) counts.push(0);
        s.quests.active[questId] = { counts: counts.slice(0, objectiveCount) };
      }
    }
  }

  const world = rec(raw.world);
  if (world) {
    if (Array.isArray(world.unlockedZones)) {
      s.world.unlockedZones = [...new Set(world.unlockedZones.filter((z: unknown): z is string => typeof z === 'string' && content.hasZone(z)))] as GameState['world']['unlockedZones'];
    }
    if (Array.isArray(world.talkedTo)) {
      s.world.talkedTo = [...new Set(world.talkedTo.filter((n: unknown): n is string => typeof n === 'string' && content.hasNpc(n)))] as GameState['world']['talkedTo'];
    }
    const flags = rec(world.flags);
    if (flags) {
      s.world.flags = {};
      for (const [k, v] of Object.entries(flags)) if (typeof v === 'boolean') s.world.flags[k] = v;
    }
    const shops = rec(world.shops);
    if (shops) {
      for (const [shopId, value] of Object.entries(shops)) {
        const r = rec(value);
        if (!content.hasShop(shopId) || !r) continue;
        const def = content.shop(shopId);
        const stock: Partial<Record<ItemId, number>> = {};
        const rawStock = rec(r.stock) ?? {};
        for (const entry of def.stock) {
          if (entry.qty === 'infinite') continue;
          const qty = rawStock[entry.itemId];
          stock[entry.itemId] = Math.min(entry.qty, Math.max(0, Math.floor(num(qty, entry.qty))));
        }
        s.world.shops[shopId] = { stock, lastRestockMs: Math.max(0, num(r.lastRestockMs, 0)) };
      }
    }
    const market = rec(world.market);
    if (market) {
      s.world.market.lastUpdateMs = Math.max(0, num(market.lastUpdateMs, 0));
      const prices = rec(market.prices) ?? {};
      for (const [itemId, price] of Object.entries(prices)) {
        if (content.isMarketItem(itemId) && typeof price === 'number' && Number.isFinite(price) && price > 0) s.world.market.prices[itemId] = price;
      }
    }
    const traders = rec(world.traders);
    if (traders) {
      for (const [traderId, value] of Object.entries(traders)) {
        const r = rec(value);
        if (!content.hasTrader(traderId) || !r || !Array.isArray(r.offers) || !Array.isArray(r.usesLeft)) continue;
        const count = content.trader(traderId).offers.length;
        const rawUses = r.usesLeft as unknown[];
        const offers = r.offers.map((o: unknown) => Math.floor(num(o, -1))).filter((o: number) => o >= 0 && o < count);
        const usesLeft = offers.map((_, i) => Math.max(0, Math.floor(num(rawUses[i], 0))));
        if (offers.length === 0) continue;
        s.world.traders[traderId] = { offers, usesLeft, nextRefreshMs: Math.max(0, num(r.nextRefreshMs, 0)) };
      }
    }
  }

  if (Array.isArray(raw.log)) {
    s.log = raw.log.flatMap((e: unknown) => {
      const r = rec(e);
      if (!r || typeof r.text !== 'string' || typeof r.kind !== 'string' || !LOG_KINDS.includes(r.kind as LogKind)) return [];
      return [{ t: num(r.t, 0), kind: r.kind as LogKind, text: r.text }];
    });
  }

  return s;
}

function validActivity(raw: unknown, content: Registry): GameState['activity'] {
  const a = rec(raw);
  if (!a || typeof a.kind !== 'string') return null;
  switch (a.kind) {
    case 'gather':
      return typeof a.nodeId === 'string' && content.hasNode(a.nodeId) ? { kind: 'gather', nodeId: a.nodeId, elapsedMs: Math.max(0, num(a.elapsedMs, 0)) } : null;
    case 'craft':
      return typeof a.recipeId === 'string' && content.hasRecipe(a.recipeId)
        ? { kind: 'craft', recipeId: a.recipeId, elapsedMs: Math.max(0, num(a.elapsedMs, 0)), remaining: Math.max(0, Math.floor(num(a.remaining, 0))) }
        : null;
    case 'combat':
      return typeof a.zoneId === 'string' && content.hasZone(a.zoneId) && typeof a.monsterId === 'string' && content.hasMonster(a.monsterId)
        ? { kind: 'combat', zoneId: a.zoneId, monsterId: a.monsterId }
        : null;
    default:
      return null;
  }
}

function isRecord(v: unknown): v is Raw {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function rec(v: unknown): Raw | null {
  return isRecord(v) ? v : null;
}
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}
