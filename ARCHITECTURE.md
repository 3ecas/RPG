# Browser RPG – Architecture

A text-based, single-player, idle-leaning RPG that runs entirely in the browser.
No graphics: the UI is a set of panels (skills, inventory, journal, crafting,
shops, combat log, …). Every game *rule* lives in plain TypeScript modules that
never touch the DOM, every piece of game *content* (items, recipes, monsters,
zones, quests, …) lives in data files, and the UI is a thin layer that renders
state and dispatches commands.

This document is the blueprint. Sections 1–3 are the decisions, 4 is the core
model, 5 maps every requested feature onto that model, 6–10 cover UI, tests,
build order, setup and conventions.

---

## 1. Decisions in one screen

| Topic        | Decision                                                      | Why |
|--------------|---------------------------------------------------------------|-----|
| Language     | TypeScript, `strict: true`                                    | Content-heavy games die from typos in ids and mismatched shapes. The compiler catches those for free. |
| Build / dev  | Vite                                                          | Zero-config dev server, native ES modules, bundling, tiny footprint. |
| UI           | Vanilla DOM, one module per panel                             | Text panels don't need a framework. The UI layer is isolated, so Preact/Svelte could be dropped in later without touching game logic. |
| Game engine  | None                                                          | No graphics, no physics, no scene graph. |
| State        | One plain, serializable `GameState` object                    | Saving is `JSON.stringify`. Tests build a state and call a function. No class instances in state. |
| Rules        | "Systems": modules of functions `(state, ctx, args) → Result` | Pure, testable, DOM-free. |
| Content      | Data files under `src/content/`, validated on boot            | Adding an item, recipe or quest is adding an object literal, never writing code. |
| Idle model   | Fixed-timestep tick driving one "current activity"            | The same scheduler handles gathering, crafting, fighting, dungeons and offline catch-up. |
| Messaging    | Typed event bus                                               | Quests listen to combat, UI listens to everything, nothing imports in the wrong direction. |
| Persistence  | `localStorage`, versioned, with migrations                    | Single player, no backend. Export/import as text for backups. |
| Tests        | Vitest                                                        | Systems are pure functions; content gets one validation test that catches broken references. |
| Not used     | Redux / immutability, ECS, Phaser, a backend                  | Overkill for one player on one thread. |

---

## 2. The layering rule (this is what keeps it clean)

```
ui  ──►  game.ts (facade)  ──►  systems  ──►  core
                                   │
                                   ▼
                                content  ──►  types
```

| Layer      | May import                        | Must never                                   |
|------------|-----------------------------------|----------------------------------------------|
| `types/`   | nothing                           | contain logic                                |
| `content/` | `types/`                          | contain game logic or reference `systems/`   |
| `core/`    | `types/`                          | know any RPG rule (it is generic plumbing)   |
| `systems/` | `types/`, `core/`, `content/`     | import `ui/`, touch `document` / `window`    |
| `game.ts`  | everything except `ui/`           | contain formulas                             |
| `ui/`      | `game.ts`, `types/`, `util/`      | mutate state, contain formulas               |

Enforce it mechanically with ESLint `no-restricted-imports` (or
`eslint-plugin-boundaries`) so that a `ui/` import inside `systems/` fails lint.
Once this rule holds, the game can be run headless in tests and the UI can be
rewritten without touching a single rule.

---

## 3. Folder layout

```
rpg/
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ eslint.config.js
├─ styles/
│  └─ main.css
├─ src/
│  ├─ main.ts                    # bootstrap: build registry, load save, start loop, mount UI
│  ├─ game.ts                    # Game facade: owns state, wires systems, exposes commands
│  │
│  ├─ types/                     # shared types only
│  │  ├─ ids.ts                  # ItemId, RecipeId, MonsterId, ... (derived from content)
│  │  ├─ content.ts              # ItemDef, RecipeDef, MonsterDef, ZoneDef, QuestDef, ...
│  │  ├─ state.ts                # GameState and its sub-shapes
│  │  ├─ events.ts               # GameEvents map
│  │  └─ result.ts               # Result<T>
│  │
│  ├─ core/                      # engine plumbing, no RPG knowledge
│  │  ├─ events.ts               # typed EventBus
│  │  ├─ loop.ts                 # fixed-timestep ticker + offline catch-up
│  │  ├─ rng.ts                  # seeded PRNG (mulberry32 / sfc32)
│  │  ├─ registry.ts             # content lookup by id + boot-time validation
│  │  ├─ save.ts                 # serialize / deserialize / autosave / export
│  │  └─ migrations.ts           # saveVersion N → N+1 functions
│  │
│  ├─ systems/                   # all game rules; pure functions over state
│  │  ├─ activity.ts             # the current-action scheduler (idle core)
│  │  ├─ formulas.ts             # xp curve, damage, hit chance, prices — every formula
│  │  ├─ stats.ts                # derived stats: levels + equipment + buffs
│  │  ├─ skills.ts               # xp gain, level ups
│  │  ├─ inventory.ts            # add / remove / has / count
│  │  ├─ equipment.ts            # equip / unequip, requirements
│  │  ├─ gathering.ts            # mining, woodcutting, fishing, herbalism (one system, data decides)
│  │  ├─ crafting.ts             # smelting, smithing, alchemy, cooking, … (one system, recipes decide)
│  │  ├─ consumables.ts          # potions, food → heals and timed buffs
│  │  ├─ magic.ts                # mana, spellbook, casting
│  │  ├─ combat.ts               # auto-battle tick, loot, death
│  │  ├─ dungeons.ts             # floors, encounters, boss, run rewards
│  │  ├─ zones.ts                # unlock rules, travel
│  │  ├─ npcs.ts                 # dialogue trees, actions
│  │  ├─ quests.ts               # journal: objectives, progress, rewards
│  │  ├─ shops.ts                # fixed-price stock, restock timers
│  │  ├─ market.ts               # simulated supply/demand prices
│  │  └─ trading.ts              # NPC barter offers
│  │
│  ├─ content/                   # data only
│  │  ├─ balance.ts              # tunable constants (tick, offline cap, xp curve params, …)
│  │  ├─ skills.ts
│  │  ├─ items/
│  │  │  ├─ materials.ts         # ores, bars, logs, herbs, hides, runes
│  │  │  ├─ weapons.ts
│  │  │  ├─ armor.ts
│  │  │  ├─ potions.ts
│  │  │  ├─ food.ts
│  │  │  ├─ misc.ts              # quest items, spellbooks, keys
│  │  │  └─ index.ts             # ITEMS = { ...materials, ...weapons, ... }
│  │  ├─ recipes/
│  │  │  ├─ smelting.ts          # station: furnace
│  │  │  ├─ smithing.ts          # station: anvil
│  │  │  ├─ alchemy.ts           # station: alchemy_table
│  │  │  ├─ cooking.ts           # station: campfire
│  │  │  ├─ crafting.ts          # station: workbench (leather, jewelry, bows)
│  │  │  └─ index.ts
│  │  ├─ gather-nodes.ts         # copper rock, oak tree, trout pool, …
│  │  ├─ monsters.ts
│  │  ├─ bosses.ts
│  │  ├─ spells.ts
│  │  ├─ npcs.ts
│  │  ├─ dialogue/               # one file per NPC with long dialogue
│  │  ├─ shops.ts
│  │  ├─ traders.ts
│  │  ├─ quests.ts
│  │  ├─ dungeons.ts
│  │  ├─ zones.ts
│  │  └─ index.ts                # assembles everything into the Registry
│  │
│  ├─ ui/                        # DOM only
│  │  ├─ app.ts                  # layout shell, nav, panel switching, render scheduling
│  │  ├─ html.ts                 # `html` tagged template with escaping
│  │  ├─ actions.ts              # single delegated click handler → game commands
│  │  ├─ components/             # reusable fragments: item-row, progress-bar, stat-table, tooltip
│  │  └─ panels/                 # one file per panel
│  │     ├─ skills-panel.ts
│  │     ├─ inventory-panel.ts
│  │     ├─ equipment-panel.ts
│  │     ├─ gathering-panel.ts
│  │     ├─ crafting-panel.ts    # generic; one instance per station
│  │     ├─ spellbook-panel.ts
│  │     ├─ combat-panel.ts
│  │     ├─ zones-panel.ts
│  │     ├─ dungeons-panel.ts
│  │     ├─ journal-panel.ts
│  │     ├─ npc-panel.ts
│  │     ├─ shop-panel.ts
│  │     ├─ market-panel.ts
│  │     ├─ trader-panel.ts
│  │     ├─ log-panel.ts
│  │     └─ settings-panel.ts    # save / export / import / reset
│  │
│  └─ util/
│     ├─ format.ts               # numbers (1.2k), durations, percentages
│     └─ collections.ts
│
└─ tests/
   ├─ content.test.ts            # every id referenced anywhere exists, no cycles, …
   ├─ save.test.ts               # round-trip + migrations
   └─ systems/
      ├─ crafting.test.ts
      ├─ combat.test.ts
      ├─ quests.test.ts
      └─ …
```

Rule of thumb for growth: when a system file passes ~400 lines, split it into a
folder (`systems/combat/{tick,loot,abilities}.ts`) with an `index.ts`. Same for
content files.

---

## 4. Core model

### 4.1 GameState – one plain object

```ts
export interface GameState {
  version: number;                       // save format version, for migrations
  meta: { createdAt: number; lastTickAt: number; seed: number };
  time: { nowMs: number };               // GAME clock, advanced by ticks (not wall clock)
  player: {
    name: string;
    hp: number; mana: number; gold: number;
    zoneId: ZoneId;
    skills: Record<SkillId, { xp: number }>;   // level is derived, never stored
    equipment: Record<EquipSlot, ItemId | null>;
    buffs: ActiveBuff[];                       // { effect, expiresAtMs }
    spellbook: SpellId[]; selectedSpell: SpellId | null;
  };
  inventory: ItemStack[];                // { itemId, qty }
  activity: Activity | null;             // what you are doing right now (see 4.4)
  combat: CombatState | null;
  dungeonRun: DungeonRun | null;
  quests: { active: Record<QuestId, QuestProgress>; completed: QuestId[] };
  world: {
    unlockedZones: ZoneId[];
    flags: Record<string, boolean>;      // story / dialogue flags
    shops: Record<ShopId, ShopStock>;    // current qty per shop
    market: Record<ItemId, MarketEntry>; // { price, lastUpdateMs }
    traders: Record<TraderId, TraderOffers>;
  };
  log: LogEntry[];                       // capped, e.g. last 200
}
```

Principles:

- **Store facts, derive everything else.** Store xp, derive level. Store equipped
  ids, derive stats. Fewer things can go out of sync.
- **Use the game clock (`time.nowMs`) for every timer** (buff expiry, shop
  restock, market relaxation). It advances only in ticks, so offline simulation
  and real-time play behave identically.
- **Plain data, direct mutation.** Systems mutate `state` in place. There is one
  player and one thread; immutability would only add noise.

### 4.2 Content registry and typed ids

Content is defined as `as const` object literals so ids become string-literal
unions. A typo in an id is then a compile error and editors autocomplete ids.

```ts
// src/content/items/materials.ts
export const MATERIALS = defineItems({
  copper_ore: { name: 'Copper Ore', category: 'material', value: 3 },
  tin_ore:    { name: 'Tin Ore',    category: 'material', value: 3 },
  bronze_bar: { name: 'Bronze Bar', category: 'material', value: 12 },
});

// src/content/items/index.ts
export const ITEMS = { ...MATERIALS, ...WEAPONS, ...ARMOR, ...POTIONS, ...FOOD, ...MISC };

// src/types/ids.ts
export type ItemId = keyof typeof ITEMS;        // 'copper_ore' | 'tin_ore' | ...
```

`defineItems` just stamps the key onto each definition as `id` (a `const` type
parameter keeps the literal keys). Do the same for recipes, monsters, spells,
zones, quests, npcs, shops, dungeons.

The `Registry` (`core/registry.ts`) wraps all tables with `get(kind, id)`
helpers and a `validate()` that runs once on boot and in the content test:
every `itemId` in every recipe, loot table, shop, quest and equipment
requirement must exist; every quest prerequisite must exist and be acyclic;
every zone reference must resolve. This one function eliminates the most common
class of content bugs.

Content import order must stay acyclic:
`items → recipes, gather-nodes, spells, monsters → shops, traders, dungeons, npcs → quests → zones`.

### 4.3 Systems and the `Result` type

Every command a player can take is a function with the same shape:

```ts
export interface Ctx { content: Registry; rng: Rng; events: EventBus; }
export type Result<T = void> = { ok: true; value: T } | { ok: false; reason: string };

// src/systems/crafting.ts
export function startCraft(state: GameState, ctx: Ctx, recipeId: RecipeId, count: number): Result {
  const recipe = ctx.content.recipe(recipeId);
  if (skills.level(state, recipe.skill) < recipe.level)
    return fail(`Requires ${recipe.skill} level ${recipe.level}`);
  if (!inventory.hasAll(state, recipe.inputs))
    return fail('Missing materials');
  state.activity = { kind: 'craft', recipeId, remaining: count, elapsedMs: 0 };
  ctx.events.emit('activity:started', { activity: state.activity });
  return ok();
}
```

- Gameplay validation is a **returned reason, never an exception**. The UI shows
  the reason as a toast. Exceptions are reserved for programmer errors.
- Systems are grouped by domain and export three kinds of functions:
  **commands** (mutate), **queries** (read, e.g. `canCraft`, used by the UI to
  grey out buttons) and an optional **`tick`**.
- One system per *mechanic*, not per *skill*: `gathering.ts` handles mining,
  woodcutting, fishing and herbalism identically because a gather node's data
  says which skill it trains. `crafting.ts` handles smelting, smithing, alchemy
  and cooking because a recipe's data says which station and skill it uses.

### 4.4 The activity scheduler (the idle core)

The player is always doing at most **one activity**. This single concept covers
"idle RPG":

```ts
export type Activity =
  | { kind: 'gather';  nodeId: NodeId;      elapsedMs: number }
  | { kind: 'craft';   recipeId: RecipeId;  elapsedMs: number; remaining: number }
  | { kind: 'combat';  zoneId: ZoneId;      monsterId?: MonsterId }   // details in state.combat
  | { kind: 'dungeon'; dungeonId: DungeonId };                         // details in state.dungeonRun
```

`systems/activity.ts` dispatches each tick to the owning system:

```ts
export function tick(state: GameState, ctx: Ctx, dtMs: number): void {
  state.time.nowMs += dtMs;
  consumables.tickBuffs(state, ctx);
  magic.tickManaRegen(state, ctx, dtMs);
  shops.tickRestock(state, ctx);
  market.tickRelax(state, ctx);

  const a = state.activity;
  if (!a) return;
  switch (a.kind) {
    case 'gather':  return gathering.tick(state, ctx, a, dtMs);
    case 'craft':   return crafting.tick(state, ctx, a, dtMs);
    case 'combat':  return combat.tick(state, ctx, a, dtMs);
    case 'dungeon': return dungeons.tick(state, ctx, a, dtMs);
  }
}
```

Timed activities all follow the same loop, which works for any `dtMs`:

```ts
a.elapsedMs += dtMs;
while (a.elapsedMs >= duration(state, a)) {       // re-read: level-ups can shorten it
  a.elapsedMs -= duration(state, a);
  complete(state, ctx, a);                          // grant items/xp, emit events
  if (!canContinue(state, a)) { state.activity = null; break; }   // out of ore, inventory full, count reached
}
```

Because the loop handles large `dtMs`, **offline progress is just a big tick**
(see 4.5). Starting a new activity always replaces the current one.

### 4.5 Tick loop and offline progress

```ts
// src/core/loop.ts — fixed timestep, catch-up on tab wake
const TICK_MS = 100;
let acc = 0, last = performance.now();
function frame(now: number) {
  acc += now - last; last = now;
  for (let n = 0; acc >= TICK_MS && n < MAX_TICKS_PER_FRAME; n++) { game.tick(TICK_MS); acc -= TICK_MS; }
  ui.render();
  requestAnimationFrame(frame);
}
```

- 10 ticks per second is plenty for a text game and keeps timers accurate.
- Browsers throttle background tabs; `acc` simply grows and catches up on
  return (`MAX_TICKS_PER_FRAME` keeps the UI responsive while catching up).
- **Offline:** on load, `elapsed = Date.now() - meta.lastTickAt`, capped at
  `balance.OFFLINE_CAP_MS` (e.g. 12 h). Run `game.tick()` in 1 s chunks until
  consumed and show a "While you were away" summary built from the events
  emitted during catch-up. Nothing else is needed because all systems already
  run on game time.
- `meta.lastTickAt` is written on every autosave.

### 4.6 Events

A typed bus in `core/events.ts`; the map of events lives in `types/events.ts`:

```ts
export interface GameEvents {
  'item:gained':      { itemId: ItemId; qty: number; source: string };
  'item:removed':     { itemId: ItemId; qty: number };
  'skill:xp':         { skill: SkillId; xp: number };
  'skill:levelup':    { skill: SkillId; level: number };
  'recipe:crafted':   { recipeId: RecipeId };
  'monster:killed':   { monsterId: MonsterId; zoneId: ZoneId };
  'player:died':      { by: MonsterId };
  'dungeon:cleared':  { dungeonId: DungeonId };
  'quest:accepted':   { questId: QuestId };
  'quest:progress':   { questId: QuestId };
  'quest:completed':  { questId: QuestId };
  'zone:unlocked':    { zoneId: ZoneId };
  'npc:talked':       { npcId: NpcId };
  'activity:started': { activity: Activity };
  'activity:stopped': {};
  'log':              { text: string; kind: 'info' | 'loot' | 'combat' | 'quest' | 'warn' };
  'state:changed':    {};
}
```

Who listens:

- `quests.ts` subscribes once at boot and advances objectives (`kill`,
  `collect`, `craft`, `talk`, …). Combat never knows quests exist.
- `zones.ts` listens to `skill:levelup` / `quest:completed` to unlock zones.
- `ui/app.ts` listens to `log` (append to log panel) and `state:changed`
  (mark dirty). Systems emit `state:changed` via the facade after every command
  and tick.
- Achievements, statistics, tutorials can be added later as new listeners
  without modifying any system.

### 4.7 Stats pipeline

One function, one place: `systems/stats.ts`

```
base (from skill levels)  +  equipment bonuses  +  active buffs  ×  multipliers  →  DerivedStats
```

Combat, spells and requirements all read `stats.derive(state, ctx)`. Nobody
else adds up bonuses. Recompute on demand; it is a few dozen additions.

### 4.8 Save / load

- `save.ts`: `serialize(state)` → JSON string; `deserialize(json)` → runs
  `migrations` from `state.version` up to current, then a sanity pass (drop
  inventory stacks whose item no longer exists, clamp values).
- Autosave every 30 s, on `visibilitychange` (hidden) and `beforeunload`.
- Key: `rpg.save`. A second key `rpg.save.backup` holds the previous save.
- Export / import: base64 of the JSON, shown in a textarea in the settings
  panel. That is the whole "cloud save" story for a single-player game.
- Migrations are an array of `(oldState) => newState`, one per version bump,
  each tested.

---

## 5. Feature map – every requested feature on the model above

| Feature | Content (data) | State | System | Panel |
|---|---|---|---|---|
| Skills / progression | `skills.ts`: id, name, group (gathering / production / combat / magic) | `player.skills[id].xp` | `skills.ts` + `formulas.xpForLevel` | skills |
| Zones | `zones.ts`: unlock requirements, nodes, monsters, npcs, shops, dungeons | `player.zoneId`, `world.unlockedZones` | `zones.ts` | zones |
| Resource gathering | `gather-nodes.ts`: skill, level, item, duration, xp, zone, bonus loot | `activity{gather}` | `gathering.ts` | gathering |
| Inventory | items | `inventory: ItemStack[]` | `inventory.ts` | inventory |
| Weapons / armor | `items/weapons.ts`, `items/armor.ts` with `equip: { slot, stats, requirements }` | `player.equipment` | `equipment.ts`, `stats.ts` | equipment |
| Crafting / smelting / smithing / alchemy / cooking | `recipes/*`: station, skill, level, inputs, outputs, duration, xp | `activity{craft}` | `crafting.ts` | crafting (one generic panel per station) |
| Potions | `items/potions.ts` with `consume: { effects }` + `recipes/alchemy.ts` | `player.buffs` | `consumables.ts` | inventory (use button) |
| Magic / spells | `spells.ts`: kind (combat / utility), level, mana, rune cost, effect; learned via spellbook items or level | `player.mana`, `spellbook`, `selectedSpell` | `magic.ts` | spellbook |
| Combat, monsters | `monsters.ts`: level, stats, attack interval, loot table, zone | `activity{combat}`, `combat` | `combat.ts` | combat |
| Bosses | `bosses.ts`: monsters with `abilities: [{ everyMs, effect }]`, `isBoss` | same | `combat.ts` (ability timers) | combat |
| Dungeons | `dungeons.ts`: unlock, floors (monster lists), boss, completion loot | `activity{dungeon}`, `dungeonRun` | `dungeons.ts` (drives `combat.ts`) | dungeons |
| NPCs | `npcs.ts` + `dialogue/*`: tree of nodes with options `{ text, requires?, actions[] }` | `world.flags` | `npcs.ts` | npc |
| Quests / journal | `quests.ts`: giver, prerequisites, objectives, rewards | `quests.active / completed` | `quests.ts` (event-driven) | journal |
| Shops | `shops.ts`: stock `{ itemId, price, qty \| 'infinite', restockMs }`, sell rate | `world.shops` | `shops.ts` | shop |
| Market | tradeable items (flag on item) | `world.market[itemId]` | `market.ts` | market |
| Trading | `traders.ts`: rotating barter offers `{ give[], get[] }` | `world.traders` | `trading.ts` | trader |

Design notes per feature:

- **Skills.** Suggested set: Mining, Woodcutting, Fishing, Herbalism
  (gathering); Smithing (covers smelting + forging), Crafting, Alchemy, Cooking,
  Runecrafting (production); Attack, Strength, Defence, Hitpoints, Magic
  (combat). Level = inverse of an exponential xp curve defined once in
  `formulas.ts`. Levels gate recipes, nodes, equipment, zones and spells through
  a shared `Requirement` type: `{ type: 'level' | 'quest' | 'item' | 'flag', … }`.
- **Items.** All stacks are `{ itemId, qty }`; two bronze swords are identical.
  This keeps inventory, shops, market and saves trivial. Per-instance data
  (enchantments, rolled stats) can be added later as a separate
  `ItemInstance` table without changing anything else. Item categories drive
  panel filters and tooltips.
- **Crafting is one system.** Smelting, smithing, alchemy, cooking and
  workbench crafting differ only in data: `station` and `skill`. The crafting
  panel takes a station id and lists the recipes for it, greyed out when
  `canCraft` fails with the reason on hover. Queueing a count is built in
  (`remaining`).
- **Combat is an auto-battler.** Each side has an attack interval; the tick
  accumulates time and resolves attacks: hit chance from attack vs. defence,
  damage from strength / weapon / magic level (all in `formulas.ts`). If a
  combat spell is selected and mana suffices, the player's attack casts it
  instead. Monster death → loot roll (`rng`), xp, `monster:killed`, spawn the
  next monster of the zone (idle continues). Player death → respawn in the
  starting zone, activity cleared, a log line; keep penalties out until the
  game has content to lose.
- **Bosses** are monsters with `abilities`, each with its own timer resolved in
  the same tick (e.g. "every 8 s: heavy strike", "at 50 % hp: enrage"). No
  separate boss system.
- **Dungeons** are a sequence of floors; each floor is a list of monster ids
  fought in order via the normal combat system, ending with a boss. Dying ends
  the run. Clearing emits `dungeon:cleared` and grants the completion loot
  table. Re-runnable; quests can require clears.
- **Zones** are the world map. Each zone lists what is there; the zones panel
  shows locked zones with their requirements so the player sees the progression
  ladder. Travel is instant to start with; a travel duration can become an
  activity later.
- **NPCs / dialogue.** A small tree: nodes have text and options; options can
  carry `requires` (same `Requirement` type) and `actions` such as
  `accept_quest`, `turn_in_quest`, `open_shop`, `open_trader`, `set_flag`,
  `give_item`. That covers quest givers, shopkeepers, lore and gated dialogue.
- **Quests** are pure data plus an event listener. Objective kinds: `kill`,
  `collect` (checked on turn-in, items consumed if `consume: true`), `craft`,
  `gather`, `talk`, `reach_level`, `clear_dungeon`, `flag`. Rewards: items,
  gold, xp, flags, zone unlocks. The journal shows active quests with per-
  objective progress and a completed list.
- **Economy.** Three deliberately different mechanics:
  *Shops* have fixed prices and finite stock with restock timers; selling to a
  shop pays `value × sellRate`.
  *Market* is a simulated exchange: every tradeable item has a price that moves
  with the player's own buys (up) and sells (down) by `impact %` and relaxes
  toward `value` over game time, with a mild random drift. The panel shows
  price vs. base and a trend arrow, so selling 500 bars at once is a bad idea.
  *Traders* offer rotating barter deals (`give 20 oak logs → get 1 iron bar`),
  refreshed on a game-time schedule; a cheap way to add "trading" flavor and
  soft-gate rare materials.
- **Magic.** Combat spells hit with Magic level; utility spells are commands
  (`superheat`: smelt from inventory instantly for mana; `teleport`: travel to
  an unlocked zone; `enchant`: convert gear to a better id). Spells may also
  consume runes, which come from Runecrafting recipes — that ties magic into the
  crafting economy.
- **Potions / food.** `consume.effects` is a list of `{ type: 'heal' | 'restore_mana' | 'buff', … }`.
  Buffs are `{ stat, amount | multiplier, expiresAtMs }` in `player.buffs` and
  flow through `stats.derive`. Food heals; potions buff. Both are crafted.

---

## 6. UI design

- **Layout:** left nav (one entry per panel, badges for "new quest" / "level up"),
  center: the active panel, right sidebar: current activity with progress bar
  and a Stop button, hp / mana / gold, equipped weapon, last 5 log lines.
  Header: player name, current zone, offline / autosave indicator.
- **Panel contract**, one file per panel:

  ```ts
  export interface Panel {
    id: PanelId;
    title: string;
    render(state: Readonly<GameState>, game: Game): string;   // returns HTML
    onMount?(root: HTMLElement, game: Game): void;            // rarely needed
  }
  ```
- **Rendering:** each frame, if dirty, re-render the active panel and the
  sidebar via `innerHTML`. Text panels are cheap enough that this is simpler and
  faster to write than any diffing scheme. Use an `html` tagged template that
  escapes interpolations so content names can never inject markup.
- **Input:** one delegated click handler on the app root. Buttons carry
  `data-action="craft" data-id="bronze_bar" data-qty="10"`; `ui/actions.ts`
  maps `action` → `game.<command>()` and shows `Result.reason` as a toast on
  failure. Listeners never need re-binding after a re-render.
- **The UI never computes rules.** Whether a button is enabled comes from a
  system query (`crafting.canCraft`), never from the panel re-implementing the
  check.
- **Keyboard / accessibility for free:** it is all real buttons and lists.
  Add number formatting (`1.2k`, `3m 20s`) in `util/format.ts` and use it
  everywhere.

If the UI ever grows past what `innerHTML` panels handle comfortably, swap the
`ui/` folder for Preact or Svelte components that call the same `Game` facade.
Nothing below `ui/` changes.

---

## 7. Testing

- **Systems** are pure functions: build a state with a small helper
  (`makeState({ inventory: [...], skills: {...} })`), call the function, assert
  on state and emitted events. Use a seeded `Rng` so loot and hit rolls are
  deterministic.
- **Content validation** (`tests/content.test.ts`): calls `registry.validate()`.
  Every dangling id, missing skill, cyclic quest prerequisite or unreachable zone
  fails CI before it is ever seen in the browser.
- **Save round-trip** (`tests/save.test.ts`): serialize → deserialize equals the
  original; each migration has a fixture of the old format.
- **Simulation smoke test:** run `tick` for 12 simulated hours of mining and
  assert no NaN, no negative quantities, inventory obeys stack rules. Cheap and
  catches idle-math regressions.

---

## 8. Build order (vertical slices, each one playable)

1. **Tooling.** Vite + TS strict + Vitest + ESLint with the layer boundaries.
   Empty `GameState`, event bus, loop, save/load, an app shell with one panel.
2. **The loop proves itself.** Skills panel + one gather node (copper rock).
   Ticks give ore and xp, level-ups fire, autosave works, offline catch-up
   shows a summary. If this feels good, everything else is content.
3. **First production chain.** Inventory panel, furnace (smelting) and anvil
   (smithing) recipes: copper + tin → bronze bar → bronze dagger. Generic
   crafting panel with queue count.
4. **Combat.** Equipment panel, stats pipeline, one zone with two monsters and
   loot, combat panel, log panel, death/respawn.
5. **Story spine.** NPC dialogue, quests with `kill` / `collect` / `talk`
   objectives, journal panel, a village zone.
6. **Economy.** Shop, market, one trader.
7. **Magic and consumables.** Mana, three combat spells, one utility spell,
   alchemy recipes and buffs, cooking and fishing.
8. **Dungeons and bosses.** One dungeon, one boss with two abilities, boss loot.
9. **Breadth and polish.** More zones with unlock gates, more of everything,
   export/import, settings, number tuning in `balance.ts`, a balance
   spreadsheet if you enjoy that.

Each step is a few files in `content/` plus one system and one panel. Do not
start any step by writing the panel; start with the system and its test.

---

## 9. Setup

```bash
npm create vite@latest . -- --template vanilla-ts
npm install
npm install -D vitest eslint @eslint/js typescript-eslint prettier
```

`package.json` scripts:

```json
{
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "lint": "eslint src tests"
}
```

`tsconfig.json` essentials: `"strict": true`, `"noUncheckedIndexedAccess": true`,
`"paths": { "@/*": ["src/*"] }` (mirror in `vite.config.ts` with `resolve.alias`).

Deploy: `vite build` produces a static `dist/` that works on GitHub Pages,
Netlify or any static host. No server.

---

## 10. Conventions

- **Ids:** `snake_case` strings (`bronze_bar`, `goblin_chief`). File names:
  `kebab-case.ts`. Types: `PascalCase`. No default exports.
- **Time:** always milliseconds, always from `state.time.nowMs` inside systems.
  Wall-clock time is read only in `core/loop.ts` and `core/save.ts`.
- **Randomness:** never `Math.random()`; always `ctx.rng` so tests and offline
  simulation are reproducible.
- **Formulas** live only in `systems/formulas.ts`; **tunable numbers** only in
  `content/balance.ts`. A balance change must never require editing a system.
- **Logging to the player** goes through `events.emit('log', …)`. No
  `console.log` in systems.
- **Adding content** must never require touching `systems/` or `ui/`. If it
  does, the data model is missing a field; add the field, not a special case.
- **Adding a mechanic** = one system file, its types, its test, its panel, and
  the wiring line in `game.ts`. Nothing else changes.

### How-to cheat sheet

| Want to… | Do |
|---|---|
| Add an item | Add a literal to the right file in `content/items/`. Panels, shops and tooltips pick it up. |
| Add a recipe | Add a literal to `content/recipes/<station>.ts`. The station's crafting panel lists it. |
| Add a monster | `content/monsters.ts` + list its id in a zone. |
| Add a zone | `content/zones.ts` with unlock requirements; reference existing nodes/monsters/npcs. |
| Add a quest | `content/quests.ts` + give it to an NPC's dialogue via `accept_quest`. |
| Add a spell | `content/spells.ts`; if it is a new *kind* of effect, add the effect handler in `magic.ts`. |
| Add a panel | `ui/panels/<name>-panel.ts` implementing `Panel`, register it in `ui/app.ts`. |
| Add a mechanic | `systems/<name>.ts` (+ test), extend `GameState` and `GameEvents`, wire it in `game.ts` and `activity.tick` if it runs over time. |
