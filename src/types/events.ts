/** Everything systems tell each other and the UI. Payloads are plain data. */
import type { Activity, LogKind } from './state';
import type { ItemId, MonsterId, NpcId, ProgressNodeId, QuestId, RecipeId, ShopId, SkillId, TraderId, ZoneId } from './ids';

export interface GameEvents {
  'item:gained': { itemId: ItemId; qty: number; source: string };
  'item:removed': { itemId: ItemId; qty: number };
  'skill:xp': { skill: SkillId; xp: number };
  'skill:tierup': { skill: SkillId; tier: number };
  'recipe:crafted': { recipeId: RecipeId };
  'node:gathered': { nodeId: string; itemId: ItemId };
  'monster:killed': { monsterId: MonsterId; zoneId: ZoneId };
  'player:died': { by: MonsterId };
  'quest:accepted': { questId: QuestId };
  'quest:progress': { questId: QuestId };
  'quest:completed': { questId: QuestId };
  'zone:unlocked': { zoneId: ZoneId };
  'progress:unlocked': { nodeId: ProgressNodeId };
  'progress:points': { granted: number };
  'zone:travelled': { zoneId: ZoneId };
  'npc:talked': { npcId: NpcId };
  'shop:bought': { shopId: ShopId; itemId: ItemId; qty: number; gold: number };
  'shop:sold': { shopId: ShopId; itemId: ItemId; qty: number; gold: number };
  'market:bought': { itemId: ItemId; qty: number; gold: number };
  'market:sold': { itemId: ItemId; qty: number; gold: number };
  'trader:bartered': { traderId: TraderId; offerIndex: number };
  'activity:started': { activity: Activity };
  'activity:stopped': { reason: string };
  'log': { text: string; kind: LogKind };
  'state:changed': Record<string, never>;
}

export type GameEventName = keyof GameEvents;
