# Greenhollow – a text-based idle RPG for the browser

Single-player, runs entirely in the browser. You walk a pixel-art world of
nine zones, talk to people, chop and mine and fish, fight what wanders there,
and manage it all in windows: skills, bag and gear, missions, crafting
stations, shops, the market, traders, a progression tree, log and settings.
It saves to `localStorage` and simulates up to 12 hours of progress while the
tab is closed.

## Run it

```bash
npm install
npm run dev       # http://localhost:5173, reloads as you edit
npm run build     # produces ONE self-contained file: dist/index.html
npm run check     # typecheck + lint (enforces layer boundaries) + tests
```

**Play online:** every push to `main` runs `.github/workflows/static.yml`,
which builds the game and publishes `dist/` to GitHub Pages at
https://3ecas.github.io/RPG/ (the repository's Pages source must be set to
"GitHub Actions" under Settings → Pages).

**Play offline:** run `npm run build` once and double-click `dist/index.html`.
Everything (script, styles) is inlined into that single file.

Opening the source `index.html` directly does *not* work: browsers cannot run
TypeScript, and the dev server is what compiles it. That page now says so
instead of staying blank.

## What is in the first slice

- **A world you walk through:** each zone is a tile map. Move with WASD / arrows or tap where you want to go; tap a tree, a rock, a person, a building or a monster to walk up and use it, or press E when you stand next to it. Exits at the edges lead to the next zone. Menus open as draggable windows; a bottom hotbar holds bag, world map, missions, log, skills, progression and settings.
- **Missions:** an eight-chapter campaign with tracked objectives that pays gold, xp, items and progression points; finishing a chapter opens the next.
- **Progression tree:** points from tier-ups, quests and missions buy nodes in four branches: zones, the Kingsport market, barter, auto-eat, dual wield and perks. Skills and stations are never gated; skills grow only by use.
- **Specialized zones:** the village is social and farming, Copper Hills the first forge, Kingsport the trade city with the only market, the Woods the lumber camp, the Mines the second forge, the Marsh the tannery. Resources are exclusive to their zone.
- **Realistic recipes:** swords need bars and a wooden grip, plate needs leather padding, shields need planks, a metal rim and a strap, cooking burns a log.
- **Skills with tiers:** fifteen skills, each with its own six-tier progression. Fill a tier's bar to unlock the next tier of materials, recipes and gear. Gathering: mining, woodcutting, fishing, farming, harvesting. Production: blacksmithing, woodworking, leatherworking, cooking. Combat: swords, axes, daggers, shields, armor, vitality.
- **Six material tiers:** bronze → iron → steel → mithril → adamant → rune, and the same ladder for wood, fish, crops, herbs and hides.
- **Zones:** eight, from Greenhollow Village to Dragon's Reach; each opens when any skill reaches its tier (the woods need a quest).
- **Gathering:** rocks, trees, fishing spots, fields and herb patches per zone.
- **Crafting:** furnace (smelting), anvil (weapons and armor), sawbench (shields), tannery (leather armor), campfire (cooking), each standing in specific zones. Catalogue windows filter by category and every item opens a card with full details and actions.
- **Combat:** idle auto-battle that trains the skill of the weapon you hold, plus Armor, Shields and Vitality; nine gear slots (head, torso, legs, hands, feet, two hands, two trinkets), food, loot tables, death and respawn.
- **Quests:** four quests given by village NPCs, tracked in the journal.
- **Economy:** three shops with restocking stock, a market whose prices react to what you trade and drift back over time, and two barter traders with rotating offers.
- **Persistence:** autosave, export/import, offline catch-up with a summary.

Typical first hour: mine copper and tin in Copper Hills until Mining reaches
tier 2, smelt bronze at the furnace, forge a dagger and armor at the anvil,
take Maren's rat quest, fight rats and goblins, unlock the woods and the iron
mines.

## How the code is organized

Read [ARCHITECTURE.md](ARCHITECTURE.md) for the full design. The short version:

| Folder          | Contains                                    | May import              |
|-----------------|---------------------------------------------|-------------------------|
| `src/types/`    | Shared types, typed content ids             | nothing                 |
| `src/content/`  | Items, recipes, monsters, zones, quests…    | types                   |
| `src/core/`     | Event bus, loop, RNG, registry, save/load   | types                   |
| `src/systems/`  | All game rules, as pure functions on state  | types, core, content    |
| `src/world/`    | Tile map model: grid, footprints, paths     | types                   |
| `src/game.ts`   | The facade the UI calls                     | everything but ui       |
| `src/ui/`       | DOM only: one file per panel, the world canvas | game, world, types, util |
| `tests/`        | Vitest: systems, content validation, maps, art, saves |               |

ESLint fails the build if a layer imports something it should not.

## Adding things

| Want to…        | Do                                                                              |
|-----------------|---------------------------------------------------------------------------------|
| Add an item     | Add a literal in `src/content/items/`. Panels and tooltips pick it up.          |
| Add a tier of gear | Tiered items, recipes and nodes are generated from the ladders in `src/content/tiers.ts`; extend the ladder or the generator. |
| Add a recipe    | Add a literal in `src/content/recipes/<station>.ts`.                            |
| Add a monster   | `src/content/monsters.ts`, then list it in a zone.                              |
| Add a quest     | Add the id to `QuestId` and the entry in `src/content/quests.ts`.               |
| Add a zone      | `src/content/zones.ts` (nodes, monsters, people, shops, stations, market), plus the tree node that unlocks it in `src/content/progression.ts`. |
| Add a tree node | `src/content/progression.ts`: add the id to the union and the entry; validation checks parents and unlocks. |
| Add a mission   | `src/content/missions.ts`: an entry with a chapter, objectives and rewards. |
| Add a shop      | `src/content/shops.ts`, then list it in a zone (its keeper must be there too).   |
| Add a trader    | `src/content/traders.ts`, then list it in a zone.                               |
| Sell on market  | Add the item id to `src/content/market.ts`.                                     |
| Add a panel     | `src/ui/panels/<name>-panel.ts` implementing `Panel`, register it in `index.ts`.|
| Add a mechanic  | A file in `src/systems/`, its test, its panel, one line in `src/game.ts`.       |

Misspelled ids are compile errors; dangling references fail `npm test`.
