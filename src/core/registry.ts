/**
 * Typed lookup over the content tables, plus boot-time validation of every
 * cross-reference. If validate() returns errors the game refuses to start.
 */
import {
  BIG_KINDS, TERRAIN_CHARS,
  type ChapterDef, type ContentTables, type GatherNodeDef, type ItemDef, type Keyed, type MapObjectDef, type MissionDef, type MonsterDef, type NpcDef, type Objective, type ProgressNodeDef, type QuestDef, type RecipeDef, type Requirement, type ShopDef, type SkillDef, type StationDef, type TraderDef, type ZoneDef, type ZoneMapDef,
} from '@/types/content';
import type { ItemId, MissionId, MonsterId, NodeId, NpcId, ProgressNodeId, QuestId, RecipeId, ShopId, SkillId, StationId, TraderId, ZoneId } from '@/types/ids';

function must<T, Id extends string>(table: Readonly<Record<string, T>>, id: Id, kind: string): Keyed<T, Id> {
  const def = table[id];
  if (!def) throw new Error(`Unknown ${kind} id: ${id}`);
  return def as Keyed<T, Id>;
}

export class Registry {
  constructor(readonly tables: ContentTables) {}

  skill(id: SkillId): Keyed<SkillDef, SkillId> { return must(this.tables.skills, id, 'skill'); }
  station(id: StationId): Keyed<StationDef, StationId> { return must(this.tables.stations, id, 'station'); }
  item(id: ItemId): Keyed<ItemDef, ItemId> { return must(this.tables.items, id, 'item'); }
  recipe(id: RecipeId): Keyed<RecipeDef, RecipeId> { return must(this.tables.recipes, id, 'recipe'); }
  node(id: NodeId): Keyed<GatherNodeDef, NodeId> { return must(this.tables.nodes, id, 'gather node'); }
  monster(id: MonsterId): Keyed<MonsterDef, MonsterId> { return must(this.tables.monsters, id, 'monster'); }
  npc(id: NpcId): Keyed<NpcDef, NpcId> { return must(this.tables.npcs, id, 'npc'); }
  quest(id: QuestId): Keyed<QuestDef, QuestId> { return must(this.tables.quests, id, 'quest'); }
  zone(id: ZoneId): Keyed<ZoneDef, ZoneId> { return must(this.tables.zones, id, 'zone'); }
  shop(id: ShopId): Keyed<ShopDef, ShopId> { return must(this.tables.shops, id, 'shop'); }
  trader(id: TraderId): Keyed<TraderDef, TraderId> { return must(this.tables.traders, id, 'trader'); }
  progressNode(id: ProgressNodeId): Keyed<ProgressNodeDef, ProgressNodeId> { return must(this.tables.progression, id, 'progression node'); }
  mission(id: MissionId): Keyed<MissionDef, MissionId> { return must(this.tables.missions, id, 'mission'); }
  get chapters(): readonly ChapterDef[] { return this.tables.chapters; }
  /** The tile map of a zone. */
  map(id: ZoneId): ZoneMapDef {
    const def = this.tables.maps[id];
    if (!def) throw new Error(`Unknown zone map: ${id}`);
    return def;
  }
  /** Zones reachable on foot from this one, in map order. */
  exits(id: ZoneId): ZoneId[] {
    const out: ZoneId[] = [];
    for (const obj of Object.values(this.map(id).legend)) if (obj.kind === 'exit' && !out.includes(obj.zone)) out.push(obj.zone);
    return out;
  }
  /** Zones visited on foot from `from` to `to`, exits only; null when unreachable. */
  route(from: ZoneId, to: ZoneId): ZoneId[] | null {
    const previous = new Map<ZoneId, ZoneId | null>([[from, null]]);
    const queue: ZoneId[] = [from];
    while (queue.length) {
      const zone = queue.shift()!;
      if (zone === to) {
        const path: ZoneId[] = [];
        for (let step: ZoneId | null = zone; step !== null; step = previous.get(step) ?? null) path.unshift(step);
        return path;
      }
      for (const next of this.exits(zone)) if (!previous.has(next)) { previous.set(next, zone); queue.push(next); }
    }
    return null;
  }
  get missionIds(): MissionId[] { return Object.keys(this.tables.missions) as MissionId[]; }
  hasMission(id: string): id is MissionId { return id in this.tables.missions; }
  missionsInChapter(chapter: number): Keyed<MissionDef, MissionId>[] { return this.missionIds.map((id) => this.mission(id)).filter((m) => m.chapter === chapter); }

  get skillIds(): SkillId[] { return Object.keys(this.tables.skills) as SkillId[]; }
  get stationIds(): StationId[] { return Object.keys(this.tables.stations) as StationId[]; }
  get itemIds(): ItemId[] { return Object.keys(this.tables.items) as ItemId[]; }
  get recipeIds(): RecipeId[] { return Object.keys(this.tables.recipes) as RecipeId[]; }
  get zoneIds(): ZoneId[] { return Object.keys(this.tables.zones) as ZoneId[]; }
  get questIds(): QuestId[] { return Object.keys(this.tables.quests) as QuestId[]; }
  get shopIds(): ShopId[] { return Object.keys(this.tables.shops) as ShopId[]; }
  get traderIds(): TraderId[] { return Object.keys(this.tables.traders) as TraderId[]; }
  get marketItems(): ItemId[] { return this.tables.market as ItemId[]; }
  get progressNodeIds(): ProgressNodeId[] { return Object.keys(this.tables.progression) as ProgressNodeId[]; }

  hasSkill(id: string): id is SkillId { return id in this.tables.skills; }
  hasStation(id: string): id is StationId { return id in this.tables.stations; }
  hasItem(id: string): id is ItemId { return id in this.tables.items; }
  hasRecipe(id: string): id is RecipeId { return id in this.tables.recipes; }
  hasNode(id: string): id is NodeId { return id in this.tables.nodes; }
  hasMonster(id: string): id is MonsterId { return id in this.tables.monsters; }
  hasNpc(id: string): id is NpcId { return id in this.tables.npcs; }
  hasQuest(id: string): id is QuestId { return id in this.tables.quests; }
  hasZone(id: string): id is ZoneId { return id in this.tables.zones; }
  hasShop(id: string): id is ShopId { return id in this.tables.shops; }
  hasTrader(id: string): id is TraderId { return id in this.tables.traders; }
  hasProgressNode(id: string): id is ProgressNodeId { return id in this.tables.progression; }
  isMarketItem(id: string): id is ItemId { return this.tables.market.includes(id); }

  shopsKeptBy(npcId: NpcId): Keyed<ShopDef, ShopId>[] {
    return this.shopIds.map((id) => this.shop(id)).filter((s) => s.keeperId === npcId);
  }

  recipesByStation(station: StationId): Keyed<RecipeDef, RecipeId>[] {
    return this.recipeIds.map((id) => this.recipe(id)).filter((r) => r.station === station).sort((a, b) => a.tier - b.tier);
  }

  questsByGiver(npcId: NpcId): Keyed<QuestDef, QuestId>[] {
    return this.questIds.map((id) => this.quest(id)).filter((q) => q.giverId === npcId);
  }

  /** Display name of a recipe: explicit name, else the first output's item name. */
  recipeName(recipe: RecipeDef): string {
    if (recipe.name) return recipe.name;
    const first = recipe.outputs[0];
    return first ? this.item(first.itemId).name : recipe.id;
  }

  /** Returns a list of human-readable problems. Empty means the content is consistent. */
  validate(): string[] {
    const errors: string[] = [];
    const t = this.tables;
    const check = (cond: boolean, msg: string) => { if (!cond) errors.push(msg); };
    const validTier = (tier: number) => Number.isInteger(tier) && tier >= 1 && tier <= 6;
    const checkObjective = (owner: string, o: Objective) => {
      switch (o.type) {
        case 'kill': check(o.monsterId in t.monsters && o.count > 0, `${owner}: bad kill objective`); break;
        case 'collect': check(o.itemId in t.items && o.count > 0, `${owner}: bad collect objective`); break;
        case 'gather': check(o.itemId in t.items && o.count > 0 && Object.values(t.nodes).some((n) => n.itemId === o.itemId), `${owner}: gather objective for '${o.itemId}' which no node yields`); break;
        case 'craft': check(o.recipeId in t.recipes && o.count > 0, `${owner}: bad craft objective`); break;
        case 'reach_tier': check(o.skill in t.skills && validTier(o.tier), `${owner}: bad reach_tier objective`); break;
        case 'any_tier': check(validTier(o.tier), `${owner}: bad any_tier objective`); break;
        case 'talk': check(o.npcId in t.npcs, `${owner}: unknown npc '${o.npcId}'`); break;
        case 'trade': check(o.count > 0, `${owner}: bad trade objective`); break;
        case 'unlock': check(o.nodeId in t.progression, `${owner}: unknown progression node '${o.nodeId}'`); break;
        case 'visit': check(o.zoneId in t.zones, `${owner}: unknown zone '${o.zoneId}'`); break;
        case 'equip': break;
      }
    };
    const checkReq = (owner: string, req: Requirement) => {
      switch (req.type) {
        case 'tier':
          check(req.skill in t.skills, `${owner}: unknown skill '${req.skill}' in requirement`);
          check(validTier(req.tier), `${owner}: bad tier ${req.tier} in requirement`);
          break;
        case 'any_tier': check(validTier(req.tier), `${owner}: bad tier ${req.tier} in requirement`); break;
        case 'quest': check(req.questId in t.quests, `${owner}: unknown quest '${req.questId}' in requirement`); break;
        case 'item': check(req.itemId in t.items, `${owner}: unknown item '${req.itemId}' in requirement`); break;
        case 'unlock': check(req.nodeId in t.progression, `${owner}: unknown progression node '${req.nodeId}' in requirement`); break;
      }
    };

    for (const [id, def] of Object.entries(t.items)) {
      check(def.id === id, `item ${id}: id field is '${def.id}'`);
      check(def.value >= 0, `item ${id}: negative value`);
      check(validTier(def.tier), `item ${id}: bad tier ${def.tier}`);
      for (const r of def.equip?.requirements ?? []) {
        check(r.skill in t.skills, `item ${id}: unknown skill '${r.skill}'`);
        check(validTier(r.tier), `item ${id}: bad requirement tier ${r.tier}`);
      }
      if (def.equip?.kind === 'weapon') {
        check((def.equip.attackIntervalMs ?? 0) > 0, `weapon ${id}: needs attackIntervalMs`);
        check(def.equip.weaponType !== undefined, `weapon ${id}: needs weaponType`);
      }
      if (def.tool) {
        check(def.tool.skill in t.skills, `tool ${id}: unknown skill '${def.tool.skill}'`);
        check(validTier(def.tool.tier), `tool ${id}: bad tier ${def.tool.tier}`);
        check(def.group === 'tool', `tool ${id}: must be in the 'tool' group`);
      }
    }
    for (const [id, def] of Object.entries(t.recipes)) {
      check(def.id === id, `recipe ${id}: id field is '${def.id}'`);
      check(def.skill in t.skills, `recipe ${id}: unknown skill '${def.skill}'`);
      check(def.station in t.stations, `recipe ${id}: unknown station '${def.station}'`);
      check(validTier(def.tier), `recipe ${id}: bad tier ${def.tier}`);
      check(def.durationMs > 0, `recipe ${id}: durationMs must be > 0`);
      check(def.inputs.length > 0 && def.outputs.length > 0, `recipe ${id}: needs inputs and outputs`);
      for (const s of [...def.inputs, ...def.outputs]) {
        check(s.itemId in t.items, `recipe ${id}: unknown item '${s.itemId}'`);
        check(s.qty > 0, `recipe ${id}: quantity of '${s.itemId}' must be > 0`);
      }
    }
    for (const [id, def] of Object.entries(t.nodes)) {
      check(def.id === id, `node ${id}: id field is '${def.id}'`);
      check(def.skill in t.skills, `node ${id}: unknown skill '${def.skill}'`);
      check(def.itemId in t.items, `node ${id}: unknown item '${def.itemId}'`);
      check(validTier(def.tier), `node ${id}: bad tier ${def.tier}`);
      check(def.durationMs > 0, `node ${id}: durationMs must be > 0`);
      if (def.deplete) {
        check(def.deplete.chance > 0 && def.deplete.chance <= 1, `node ${id}: deplete chance must be in (0, 1]`);
        check(def.deplete.respawnMs > 0, `node ${id}: respawnMs must be > 0`);
      }
    }
    for (const [id, def] of Object.entries(t.monsters)) {
      check(def.id === id, `monster ${id}: id field is '${def.id}'`);
      check(def.hp > 0 && def.attackIntervalMs > 0, `monster ${id}: hp and attackIntervalMs must be > 0`);
      check(validTier(def.tier), `monster ${id}: bad tier ${def.tier}`);
      check(def.gold[0] <= def.gold[1], `monster ${id}: gold min > max`);
      for (const l of def.loot) {
        check(l.itemId in t.items, `monster ${id}: unknown loot item '${l.itemId}'`);
        check(l.chance > 0 && l.chance <= 1, `monster ${id}: loot chance for '${l.itemId}' must be in (0, 1]`);
        check(l.min <= l.max && l.min > 0, `monster ${id}: bad loot range for '${l.itemId}'`);
      }
    }
    for (const [id, def] of Object.entries(t.quests)) {
      check(def.id === id, `quest ${id}: id field is '${def.id}'`);
      check(def.giverId in t.npcs, `quest ${id}: unknown giver '${def.giverId}'`);
      check(def.objectives.length > 0, `quest ${id}: needs at least one objective`);
      for (const r of def.prerequisites) checkReq(`quest ${id}`, r);
      for (const o of def.objectives) checkObjective(`quest ${id}`, o);
      for (const r of def.rewards) {
        if (r.type === 'item') check(r.itemId in t.items, `quest ${id}: unknown reward item '${r.itemId}'`);
        if (r.type === 'xp') check(r.skill in t.skills, `quest ${id}: unknown reward skill '${r.skill}'`);
        if (r.type === 'points') check(r.amount > 0, `quest ${id}: points reward must be > 0`);
      }
    }
    errors.push(...this.questCycles());
    errors.push(...this.validateProgression());

    const chapterNumbers = t.chapters.map((c) => c.number);
    check(chapterNumbers.every((n, i) => n === i + 1), 'chapters must be numbered 1..N in order');
    for (const [id, def] of Object.entries(t.missions)) {
      check(def.id === id, `mission ${id}: id field is '${def.id}'`);
      check(chapterNumbers.includes(def.chapter), `mission ${id}: unknown chapter ${def.chapter}`);
      check(def.objectives.length > 0, `mission ${id}: needs an objective`);
      for (const o of def.objectives) checkObjective(`mission ${id}`, o);
      for (const r of def.rewards) {
        if (r.type === 'item') check(r.itemId in t.items, `mission ${id}: unknown reward item '${r.itemId}'`);
        if (r.type === 'xp') check(r.skill in t.skills, `mission ${id}: unknown reward skill '${r.skill}'`);
        if (r.type === 'points') check(r.amount > 0, `mission ${id}: points reward must be > 0`);
      }
    }
    for (const chapter of t.chapters) check(Object.values(t.missions).some((m) => m.chapter === chapter.number), `chapter ${chapter.number}: has no missions`);

    for (const [id, def] of Object.entries(t.shops)) {
      check(def.id === id, `shop ${id}: id field is '${def.id}'`);
      check(!def.keeperId || def.keeperId in t.npcs, `shop ${id}: unknown keeper '${def.keeperId}'`);
      check(def.markup > 0, `shop ${id}: markup must be > 0`);
      check(def.sellRate >= 0 && def.sellRate <= 1, `shop ${id}: sellRate must be within 0..1`);
      check(def.restockMs > 0, `shop ${id}: restockMs must be > 0`);
      const seen = new Set<string>();
      for (const entry of def.stock) {
        check(entry.itemId in t.items, `shop ${id}: unknown item '${entry.itemId}'`);
        check(!seen.has(entry.itemId), `shop ${id}: '${entry.itemId}' listed twice`);
        seen.add(entry.itemId);
        check(entry.qty === 'infinite' || entry.qty > 0, `shop ${id}: stock of '${entry.itemId}' must be > 0`);
        check(entry.price === undefined || entry.price > 0, `shop ${id}: price of '${entry.itemId}' must be > 0`);
      }
    }
    for (const [id, def] of Object.entries(t.traders)) {
      check(def.id === id, `trader ${id}: id field is '${def.id}'`);
      check(def.refreshMs > 0, `trader ${id}: refreshMs must be > 0`);
      check(def.offersShown > 0 && def.offersShown <= def.offers.length, `trader ${id}: offersShown must be within 1..${def.offers.length}`);
      def.offers.forEach((offer, i) => {
        check(offer.give.length > 0 && offer.get.length > 0, `trader ${id}: offer ${i} needs give and get`);
        for (const s of [...offer.give, ...offer.get]) {
          check(s.itemId in t.items, `trader ${id}: offer ${i} has unknown item '${s.itemId}'`);
          check(s.qty > 0, `trader ${id}: offer ${i} quantity of '${s.itemId}' must be > 0`);
        }
        check(offer.uses === undefined || offer.uses > 0, `trader ${id}: offer ${i} uses must be > 0`);
      });
    }
    const marketSeen = new Set<string>();
    for (const itemId of t.market) {
      check(itemId in t.items, `market: unknown item '${itemId}'`);
      check(!marketSeen.has(itemId), `market: '${itemId}' listed twice`);
      marketSeen.add(itemId);
    }

    const referencedNodes = new Set<string>();
    const referencedMonsters = new Set<string>();
    const referencedNpcs = new Set<string>();
    const referencedShops = new Set<string>();
    const referencedTraders = new Set<string>();
    const referencedStations = new Set<string>();
    for (const [id, def] of Object.entries(t.zones)) {
      check(def.id === id, `zone ${id}: id field is '${def.id}'`);
      for (const r of def.unlock) checkReq(`zone ${id}`, r);
      for (const n of def.nodes) { check(n in t.nodes, `zone ${id}: unknown node '${n}'`); referencedNodes.add(n); }
      for (const m of def.monsters) { check(m in t.monsters, `zone ${id}: unknown monster '${m}'`); referencedMonsters.add(m); }
      for (const n of def.npcs) { check(n in t.npcs, `zone ${id}: unknown npc '${n}'`); referencedNpcs.add(n); }
      for (const s of def.shops) { check(s in t.shops, `zone ${id}: unknown shop '${s}'`); referencedShops.add(s); }
      for (const tr of def.traders) { check(tr in t.traders, `zone ${id}: unknown trader '${tr}'`); referencedTraders.add(tr); }
      for (const st of def.stations) { check(st in t.stations, `zone ${id}: unknown station '${st}'`); referencedStations.add(st); }
      for (const s of def.shops) {
        const keeper = t.shops[s]?.keeperId;
        check(!keeper || def.npcs.includes(keeper), `zone ${id}: shop '${s}' is here but its keeper '${keeper}' is not`);
      }
    }
    for (const id of Object.keys(t.nodes)) check(referencedNodes.has(id), `node ${id}: not placed in any zone`);
    for (const id of Object.keys(t.monsters)) check(referencedMonsters.has(id), `monster ${id}: not placed in any zone`);
    for (const id of Object.keys(t.npcs)) check(referencedNpcs.has(id), `npc ${id}: not placed in any zone`);
    for (const id of Object.keys(t.shops)) check(referencedShops.has(id), `shop ${id}: not placed in any zone`);
    for (const id of Object.keys(t.traders)) check(referencedTraders.has(id), `trader ${id}: not placed in any zone`);
    for (const id of Object.keys(t.stations)) check(referencedStations.has(id), `station ${id}: not placed in any zone`);
    errors.push(...this.validateMaps());

    return errors;
  }

  /** Every zone has a well-formed map that places exactly what the zone lists, with a spawn and symmetric exits. */
  private validateMaps(): string[] {
    const errors: string[] = [];
    const t = this.tables;
    const check = (cond: boolean, msg: string) => { if (!cond) errors.push(msg); };
    for (const zoneId of Object.keys(t.zones)) check(zoneId in t.maps, `zone ${zoneId}: has no map`);
    for (const [zoneId, map] of Object.entries(t.maps)) {
      const owner = `map ${zoneId}`;
      const zone = t.zones[zoneId];
      if (!zone) { errors.push(`${owner}: not a zone`); continue; }
      const width = map.rows[0]?.length ?? 0;
      check(map.rows.length > 0 && width > 0, `${owner}: empty`);
      check(map.rows.every((r) => r.length === width), `${owner}: rows differ in length`);
      const counts = new Map<string, number>();
      map.rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) {
          const ch = row[x]!;
          if (ch in TERRAIN_CHARS) continue;
          if (!(ch in map.legend)) { errors.push(`${owner}: unknown character '${ch}' at ${x},${y}`); continue; }
          counts.set(ch, (counts.get(ch) ?? 0) + 1);
        }
      });
      const placed = { node: new Set<string>(), station: new Set<string>(), shop: new Set<string>(), trader: new Set<string>(), npc: new Set<string>(), monster: new Set<string>(), exit: new Set<string>() };
      let spawns = 0;
      let market = 0;
      for (const [key, obj] of Object.entries(map.legend) as [string, MapObjectDef][]) {
        check(/^[A-Za-z0-9]$/.test(key), `${owner}: legend key '${key}' must be one letter or digit`);
        const n = counts.get(key) ?? 0;
        check(n > 0, `${owner}: legend key '${key}' is never used`);
        if (BIG_KINDS.includes(obj.kind)) check(this.wellFormedBlocks(map, key), `${owner}: '${key}' must fill 2×2 blocks`);
        switch (obj.kind) {
          case 'node': check(zone.nodes.includes(obj.id), `${owner}: node '${obj.id}' is not in the zone`); placed.node.add(obj.id); break;
          case 'station': check(zone.stations.includes(obj.id), `${owner}: station '${obj.id}' is not in the zone`); placed.station.add(obj.id); break;
          case 'shop': check(zone.shops.includes(obj.id), `${owner}: shop '${obj.id}' is not in the zone`); placed.shop.add(obj.id); break;
          case 'trader': check(zone.traders.includes(obj.id), `${owner}: trader '${obj.id}' is not in the zone`); placed.trader.add(obj.id); break;
          case 'npc': check(zone.npcs.includes(obj.id), `${owner}: npc '${obj.id}' is not in the zone`); placed.npc.add(obj.id); break;
          case 'monster': check(zone.monsters.includes(obj.id), `${owner}: monster '${obj.id}' is not in the zone`); placed.monster.add(obj.id); break;
          case 'market': check(zone.market, `${owner}: has a market but the zone has none`); market += n; break;
          case 'spawn': spawns += n; break;
          case 'exit': {
            check(obj.zone in t.zones, `${owner}: exit to unknown zone '${obj.zone}'`);
            check(obj.zone !== zoneId, `${owner}: exit leads to itself`);
            const back = Object.values(t.maps[obj.zone]?.legend ?? {}).some((o) => o.kind === 'exit' && o.zone === zoneId);
            check(back, `${owner}: exit to '${obj.zone}' has no exit back`);
            placed.exit.add(obj.zone);
            break;
          }
          case 'signpost': break;
          case 'bank': break;
        }
      }
      check(spawns === 1, `${owner}: needs exactly one spawn, has ${spawns}`);
      if (zone.market) check(market === 4, `${owner}: the market must be one 2×2 block`);
      for (const id of zone.nodes) check(placed.node.has(id), `${owner}: node '${id}' is not on the map`);
      for (const id of zone.stations) check(placed.station.has(id), `${owner}: station '${id}' is not on the map`);
      for (const id of zone.shops) check(placed.shop.has(id), `${owner}: shop '${id}' is not on the map`);
      for (const id of zone.traders) check(placed.trader.has(id), `${owner}: trader '${id}' is not on the map`);
      for (const id of zone.npcs) check(placed.npc.has(id), `${owner}: npc '${id}' is not on the map`);
      for (const id of zone.monsters) check(placed.monster.has(id), `${owner}: monster '${id}' is not on the map`);
    }
    return errors;
  }

  /** True when every occurrence of `key` belongs to a full 2×2 block of `key`. */
  private wellFormedBlocks(map: ZoneMapDef, key: string): boolean {
    const at = (x: number, y: number) => map.rows[y]?.[x] === key;
    let cells = 0;
    let blocks = 0;
    map.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (!at(x, y)) continue;
        cells += 1;
        if (!at(x - 1, y) && !at(x, y - 1) && at(x + 1, y) && at(x, y + 1) && at(x + 1, y + 1) && !at(x + 2, y) && !at(x, y + 2)) blocks += 1;
      }
    });
    return cells > 0 && cells === blocks * 4;
  }

  private validateProgression(): string[] {
    const t = this.tables;
    const errors: string[] = [];
    const check = (cond: boolean, msg: string) => { if (!cond) errors.push(msg); };
    const zoneUnlockedBy = new Map<string, string[]>();
    for (const [id, def] of Object.entries(t.progression)) {
      check(def.id === id, `progression ${id}: id field is '${def.id}'`);
      check(Number.isInteger(def.cost) && def.cost >= 0, `progression ${id}: cost must be a non-negative integer`);
      check(def.unlocks.length > 0, `progression ${id}: unlocks nothing`);
      for (const parent of def.requires) check(parent in t.progression, `progression ${id}: unknown parent '${parent}'`);
      for (const r of def.requirements) {
        switch (r.type) {
          case 'tier': check(r.skill in t.skills, `progression ${id}: unknown skill '${r.skill}'`); break;
          case 'quest': check(r.questId in t.quests, `progression ${id}: unknown quest '${r.questId}'`); break;
          case 'item': check(r.itemId in t.items, `progression ${id}: unknown item '${r.itemId}'`); break;
          case 'unlock': check(r.nodeId in t.progression, `progression ${id}: unknown node '${r.nodeId}'`); break;
          case 'any_tier': break;
        }
      }
      for (const u of def.unlocks) {
        switch (u.type) {
          case 'zone': check(u.zoneId in t.zones, `progression ${id}: unknown zone '${u.zoneId}'`); zoneUnlockedBy.set(u.zoneId, [...(zoneUnlockedBy.get(u.zoneId) ?? []), id]); break;
          case 'perk': check(u.value > 0, `progression ${id}: perk value must be > 0`); break;
          case 'feature': break;
        }
      }
    }
    for (const [id, zone] of Object.entries(t.zones)) {
      const by = zoneUnlockedBy.get(id) ?? [];
      check(by.length === 1, `zone ${id}: must be unlocked by exactly one progression node`);
      const nodeReq = zone.unlock.find((r) => r.type === 'unlock');
      const startZone = by[0] !== undefined && (t.progression[by[0]]?.cost ?? 1) === 0;
      check(startZone || (nodeReq !== undefined && nodeReq.type === 'unlock' && nodeReq.nodeId === by[0]), `zone ${id}: must require the node that unlocks it ('${by[0]}')`);
    }
    // Cycles in parents.
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (id: string, path: string[]) => {
      if (done.has(id)) return;
      if (visiting.has(id)) { errors.push(`progression parent cycle: ${[...path, id].join(' -> ')}`); return; }
      visiting.add(id);
      for (const parent of t.progression[id]?.requires ?? []) if (parent in t.progression) visit(parent, [...path, id]);
      visiting.delete(id);
      done.add(id);
    };
    for (const id of Object.keys(t.progression)) visit(id, []);
    return errors;
  }

  private questCycles(): string[] {
    const t = this.tables;
    const visiting = new Set<string>();
    const done = new Set<string>();
    const errors: string[] = [];
    const visit = (id: string, path: string[]) => {
      if (done.has(id)) return;
      if (visiting.has(id)) { errors.push(`quest prerequisite cycle: ${[...path, id].join(' -> ')}`); return; }
      visiting.add(id);
      const def = t.quests[id];
      for (const r of def?.prerequisites ?? []) if (r.type === 'quest' && r.questId in t.quests) visit(r.questId, [...path, id]);
      visiting.delete(id);
      done.add(id);
    };
    for (const id of Object.keys(t.quests)) visit(id, []);
    return errors;
  }
}
