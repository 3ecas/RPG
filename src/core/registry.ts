/**
 * Typed lookup over the content tables, plus boot-time validation of every
 * cross-reference. If validate() returns errors the game refuses to start.
 */
import type {
  ContentTables, GatherNodeDef, ItemDef, Keyed, MonsterDef, NpcDef, QuestDef, RecipeDef, Requirement, SkillDef, StationDef, ZoneDef,
} from '@/types/content';
import type { ItemId, MonsterId, NodeId, NpcId, QuestId, RecipeId, SkillId, StationId, ZoneId } from '@/types/ids';

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

  get skillIds(): SkillId[] { return Object.keys(this.tables.skills) as SkillId[]; }
  get stationIds(): StationId[] { return Object.keys(this.tables.stations) as StationId[]; }
  get itemIds(): ItemId[] { return Object.keys(this.tables.items) as ItemId[]; }
  get recipeIds(): RecipeId[] { return Object.keys(this.tables.recipes) as RecipeId[]; }
  get zoneIds(): ZoneId[] { return Object.keys(this.tables.zones) as ZoneId[]; }
  get questIds(): QuestId[] { return Object.keys(this.tables.quests) as QuestId[]; }

  hasSkill(id: string): id is SkillId { return id in this.tables.skills; }
  hasItem(id: string): id is ItemId { return id in this.tables.items; }
  hasRecipe(id: string): id is RecipeId { return id in this.tables.recipes; }
  hasNode(id: string): id is NodeId { return id in this.tables.nodes; }
  hasMonster(id: string): id is MonsterId { return id in this.tables.monsters; }
  hasNpc(id: string): id is NpcId { return id in this.tables.npcs; }
  hasQuest(id: string): id is QuestId { return id in this.tables.quests; }
  hasZone(id: string): id is ZoneId { return id in this.tables.zones; }

  recipesByStation(station: StationId): Keyed<RecipeDef, RecipeId>[] {
    return this.recipeIds.map((id) => this.recipe(id)).filter((r) => r.station === station).sort((a, b) => a.level - b.level);
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
    const checkReq = (owner: string, req: Requirement) => {
      switch (req.type) {
        case 'level': check(req.skill in t.skills, `${owner}: unknown skill '${req.skill}' in requirement`); break;
        case 'quest': check(req.questId in t.quests, `${owner}: unknown quest '${req.questId}' in requirement`); break;
        case 'item': check(req.itemId in t.items, `${owner}: unknown item '${req.itemId}' in requirement`); break;
      }
    };

    for (const [id, def] of Object.entries(t.items)) {
      check(def.id === id, `item ${id}: id field is '${def.id}'`);
      check(def.value >= 0, `item ${id}: negative value`);
      for (const r of def.equip?.requirements ?? []) check(r.skill in t.skills, `item ${id}: unknown skill '${r.skill}'`);
      if (def.equip?.slot === 'weapon') check((def.equip.attackIntervalMs ?? 0) > 0, `weapon ${id}: needs attackIntervalMs`);
    }
    for (const [id, def] of Object.entries(t.recipes)) {
      check(def.id === id, `recipe ${id}: id field is '${def.id}'`);
      check(def.skill in t.skills, `recipe ${id}: unknown skill '${def.skill}'`);
      check(def.station in t.stations, `recipe ${id}: unknown station '${def.station}'`);
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
      check(def.durationMs > 0, `node ${id}: durationMs must be > 0`);
    }
    for (const [id, def] of Object.entries(t.monsters)) {
      check(def.id === id, `monster ${id}: id field is '${def.id}'`);
      check(def.hp > 0 && def.attackIntervalMs > 0, `monster ${id}: hp and attackIntervalMs must be > 0`);
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
      for (const o of def.objectives) {
        switch (o.type) {
          case 'kill': check(o.monsterId in t.monsters, `quest ${id}: unknown monster '${o.monsterId}'`); break;
          case 'collect': check(o.itemId in t.items, `quest ${id}: unknown item '${o.itemId}'`); break;
          case 'craft': check(o.recipeId in t.recipes, `quest ${id}: unknown recipe '${o.recipeId}'`); break;
          case 'reach_level': check(o.skill in t.skills, `quest ${id}: unknown skill '${o.skill}'`); break;
          case 'talk': check(o.npcId in t.npcs, `quest ${id}: unknown npc '${o.npcId}'`); break;
        }
      }
      for (const r of def.rewards) {
        if (r.type === 'item') check(r.itemId in t.items, `quest ${id}: unknown reward item '${r.itemId}'`);
        if (r.type === 'xp') check(r.skill in t.skills, `quest ${id}: unknown reward skill '${r.skill}'`);
      }
    }
    errors.push(...this.questCycles());

    const referencedNodes = new Set<string>();
    const referencedMonsters = new Set<string>();
    const referencedNpcs = new Set<string>();
    for (const [id, def] of Object.entries(t.zones)) {
      check(def.id === id, `zone ${id}: id field is '${def.id}'`);
      for (const r of def.unlock) checkReq(`zone ${id}`, r);
      for (const n of def.nodes) { check(n in t.nodes, `zone ${id}: unknown node '${n}'`); referencedNodes.add(n); }
      for (const m of def.monsters) { check(m in t.monsters, `zone ${id}: unknown monster '${m}'`); referencedMonsters.add(m); }
      for (const n of def.npcs) { check(n in t.npcs, `zone ${id}: unknown npc '${n}'`); referencedNpcs.add(n); }
    }
    for (const id of Object.keys(t.nodes)) check(referencedNodes.has(id), `node ${id}: not placed in any zone`);
    for (const id of Object.keys(t.monsters)) check(referencedMonsters.has(id), `monster ${id}: not placed in any zone`);
    for (const id of Object.keys(t.npcs)) check(referencedNpcs.has(id), `npc ${id}: not placed in any zone`);

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
