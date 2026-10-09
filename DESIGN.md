# Greenhollow Online – Design

What the game is becoming: a small, RuneScape-like MMO in the browser. Top-down
pixel art, point and click, one shared world, skills that grow by use. This
document is the *what*; [ARCHITECTURE.md](ARCHITECTURE.md) is the *how* and
describes the code as it stands. When they disagree, this one is the intent.

The single-player idle game that exists today is the seed: its content, rules,
maps and renderer carry over. Its idle-game shape does not (see §12).

---

## 1. Three decisions that are hard to reverse

| Decision | Choice | Why |
|---|---|---|
| Grid | Square tiles, eight-direction movement, diagonals cost the same as straight steps | What RuneScape does. Hexes buy equal neighbours but fight pixel-art tilesets, rectangular buildings and four-way sprites; with click-to-move nobody sees the grid anyway. |
| Time | A fixed 50 ms simulation step on the server; movement is click-to-move, cell to cell with a fluid walk between, predicted in the browser; actions (a swing, a mining roll, a respawn) will resolve on a slower action tick on top | Walking has to feel immediate whatever the ping, so the browser simulates your own character from your clicks and the server confirms. Actions can wait a few hundred milliseconds; walking cannot. |
| Play | Active, never idle | Activities stop at logout and nothing is simulated while you are away. This is what makes the bank loop and a shared economy work, and the server only runs online players. |

Everything else below can change with experience. These three are baked into
every tile, every number and every message.

## 2. The rules that make the feel

- **One action at a time.** Clicking elsewhere cancels.
- **Everything happens on cells.** Movement is click-to-move, cell to cell,
  with the walk between two cells drawn fluidly at a steady speed. A character
  is always in a cell or on its way to the next one, and every interaction is
  between a cell and the cell beside it: you talk to someone from the cell
  next to them and chop the tree from the cell next to it. There is no free
  position and nothing half on a cell, so every rule reasons in whole cells.
- **Server authority.** The server owns every position, roll and item. The
  browser renders a replica and sends intents: walk here, use that, say this.
- **Small bag, non-stackable items, a bank.** Ore takes a slot each; only coins
  and a few designated things stack. The loop is fill the bag, walk to the bank,
  deposit, walk back. This single rule creates pacing, makes map layout matter
  and caps what one player can produce.
- **Shared, depletable resources.** A rock empties when you succeed and respawns
  on a timer, for everyone. Fishing spots and trees can stay infinite.
- **Right-click menus and examine text.** Left click does the default action;
  right click lists Walk here, Attack, Talk, Examine.
- **Single-combat lock.** The first player to hit a monster owns it until a few
  ticks after their last hit. Loot attribution solved with one rule.
- **Players never block tiles.** Monsters and NPCs do.
- **Walking, not teleporting.** Distance is content. No fast travel.
- **Death costs something.** Keep your three most valuable items; the rest
  drops where you fell.
- **Trade window before any market.** Face-to-face trading and chat over heads
  are the social glue. An exchange is a later feature.
- **Skills level by doing.** A ding every few minutes early on.
- **Ground items have an owner, then everyone, then nothing.** A dropped item is
  visible only to its owner first, then to all, then it vanishes.

## 3. Defaults

Starting values. Expect to tune them after the first playable slice.

| Setting | Default |
|---|---|
| Simulation step | 50 ms |
| Action tick (one roll at a node) | 600 ms, twelve steps |
| Walk / run | 4 / 7 cells per second |
| Bag | 28 slots |
| A tree falls after a log | one in eight; an oak is back after 8 s. Rocks and fields empty on every success |
| Skill levels | 1 to 100; every level gives something |
| Tier bands start at level | 1, 15, 30, 50, 70, 85 |
| Dropped item visible to others after | 60 s; gone after 180 s |
| Reconnect grace after a dropped connection | 30 s |
| Zone map size | 40 × 24 today; mainland maps may grow |

## 4. Skills, levels, stats and gear

- **Thirteen skills**, each from level 1 to 100 on the classic steep curve.
  Gathering: Lumberjack, Mining, Fishing, Harvesting (fields, patches and
  foraging are one skill). Making: Smithing (smelt and forge), Crafting
  (shields, bows and staffs from logs, light armor from hides), Cooking.
  Fighting: Hand Weapons (swords, axes, daggers), Bows, Vitality (max hit
  points and how fast they return; heavier armor needs it). The mind:
  Spirit (max mana and its return), Magic (spell power, with staffs and
  tomes), Witchcraft (potions and charms from herbs; content to come).
  Mining stays because Smithing eats ore.
- **Every level gives something.** The content of a tier opens at the tier's
  level (1, 15, 30, 50, 70, 85); every other level gives the skill's small
  bonus. Gathering is paced in ticks (50 ms): an item takes 250 ticks at
  level 1 and 50 at level 100, about two fewer per level, a fifth longer
  per node tier past the first and a fifth shorter per tool tier past the
  first, never under 25; slow at first, quick by the end. The making skills
  work 1% faster per level (half the time from level 51), except Cooking,
  which burns 1% less per level. +1% damage for Hand Weapons and Bows, +1
  max HP for Vitality and +1 max mana for Spirit with faster return every
  ten levels, +1 spell power for Magic, +1% potion strength for Witchcraft.
  The skills panel lists all hundred.
- **The character's numbers**: hit points (10 + Vitality + gear), mana (5 +
  Spirit + gear), armor (gear; shields count), attack (1 + the weapon's
  attack scaled by its skill, + gear), spell power (Magic − 1 + staffs and
  tomes). A point of HP and of mana comes back every twelve action ticks at
  level 1, one tick fewer every ten levels.
- **Nine gear slots**: head, torso, legs, hands, feet, main hand, off hand
  (shield or tome), two trinkets. Every piece adds its numbers. Wearing needs
  the tier's level in the skill it belongs to: Hand Weapons, Bows or Magic
  for weapons and tomes, Vitality for armor and shields. What you take off
  goes to the first free bag slot; what you put on sends the old piece to the
  slot the new one came from. Hatchets and pickaxes can be wielded and still
  count as tools.
- The six material tiers stay as the content ladder (bronze → iron → steel →
  mithril → adamant → rune, and the same for wood, fish, crops, herbs, hides).
  A tier is a **level band**, which is literally the RuneScape metal ladder.
- **Tools replace perks.** Gather speed comes from the pickaxe or hatchet in
  your bag or hand, by tier, so speed is crafted and can be lost. Without one
  you cannot gather at all. Hatchets and pickaxes run stone → iron → steel
  → mithril → adamant → rune, the metal ones forged at an anvil from a bar
  and a log; fishing rods run oak → elder, carved at a sawbench from a log.
  Tools hang on a tool belt (one hatchet, one pickaxe, one rod), never in a
  bag slot. A new
  character starts with nothing: Rowan the lumberjack hands a stone hatchet
  to anyone who talks to him without one, Greta the stonemason a stone
  pickaxe, Tobb the angler an oak rod, straight onto the belt; the village
  store sells all three. Harvesting needs no tool.
- **Making happens at stations.** Stand by one and it lists what your bag
  has the makings for, one or all: the campfire cooks, the furnace smelts,
  the anvil forges, the sawbench carves, the tannery tans. Nothing is made
  from the inventory alone.
- **Cooking happens at campfires.** Every settlement has one that never
  goes out. A player builds one anywhere from two stones (broken from the
  loose rock by the village outcrop with a pickaxe) and a log; it burns a
  minute per tier of the log, anyone can cook on it, and a log fed to it
  keeps it going, up to ten minutes. Building and feeding give Crafting xp.
  A cook takes a couple of seconds and two thirds come out right at the
  level the food opens at, a percent more per level after, never all.
- **Food heals when it is down.** Eating takes 35 ticks and then heals (a
  shrimp 6), one thing at a time, never past the maximum.
- **The progression tree goes.** Zones open by walking, with danger and quests
  as the gates. Features it granted (dual wield, auto-eat, the market) become
  quest rewards or plain features.

## 5. Items, bag, bank, ground

- `ItemStack { itemId, qty }` stays as the storage shape; `stackable` becomes
  an item flag that is false for almost everything.
- The bag has 28 slots. The bank has many, with deposit-all and withdraw-x.
  Every town has a bank; the tutorial island has one.
- Coins are a purse on the character, shown in the inventory, never a bag
  item: quests and sales pay into it, shops and the market draw from it.
- Ground items live in the zone state with an owner id and two timers.
- Per-instance data (enchantments, charges) is not needed yet.

## 6. Combat

- Auto-attack on the tick, both sides. Hand Weapons and Bows are trained by
  hitting, Vitality by being hit, Magic by casting.
- Monsters are entities in the zone with shared hit points, a spawn point, a
  respawn timer and the single-combat lock. Combat targets an entity id, never
  a monster type.
- Aggressive monsters attack low-level players who come near.
- Hit splats, an hp bar over the fight, food heals on click.
- Death: keep the three most valuable items, drop the rest at the spot,
  respawn in the starting town. PvE only.

## 7. World

- A zone is a map and a room: one simulation, everyone in it sees everyone.
  Zones are joined by edge exits; the transition is a fade while walking, not
  a loading screen. No fast travel; the world map only shows where you are.
- Positions, facing and paths are server state. The map format (rows and a
  legend) stays, and the registry keeps refusing a map that forgets something
  its zone lists.
- The tutorial island is one zone; the starting town is the next.

## 8. Social and safety

Chat over heads plus a docked chatbox (zone, later global and whisper). Unique
character names. Mute, ban, report, and a rate limit on every message type.
These ship with the first town, not later: the first abusive player arrives
with the first handful of real ones.

## 9. Economy

- Shops: fixed prices, finite stock, restock timers. Whether stock is shared
  and contested or per-player is decided with the first town; default shared.
- No simulated market. Player trading starts with the trade window. An
  exchange or market board comes much later, if ever.
- Gold needs sinks from the start: shop prices, repairs or death.

## 10. UI and art

- **Chrome:** a menu bar fixed along the bottom that opens windows for the
  inventory (gear laid out as a body, hit points and mana as coloured
  sliders with the number on the left and the percentage on the right, the
  purse and the bag in one panel), the journal (horizontal tabs: quests, the
  adventure log, the bestiary, the item database; each tab a list on the
  left and the page on the right, the quest page with one button to
  accept), the skills and the settings; every window drags, resizes and
  closes with its X, and the layout is remembered per browser; menus open
  above every window. A bag slot drags onto another to swap, or onto the
  world to throw the thing away after a yes-or-no. Active quests sit top
  left with their objectives red until done, then green. People speak in a
  balloon above the menu bar, with their role under their name on the map.
  The bestiary tells only creatures you have fought; the item database
  tells how to come by everything, one fact to a line, with links between
  pages. A minimap in the top right. A docked chatbox. Right-click menus.
  The bank, the stations and shops are windows too. Space stops you.
- **One look for every panel**, the way MMO interfaces have looked since the
  first ones: dark wood and worn brass, a gold title line on every window,
  small gold section labels with a rule, sunken slots, serifs for titles and
  levels, and item names in the colour of their tier (white, green, blue,
  purple, orange, gold). The menu bar carries a line icon per window. The
  least text possible: a fact is a line, never a sentence.
- **Art:** simple shapes for now: flat tiles, discs for people, boxes and
  circles for what stands on the map. The renderer is one file, so pixel art
  can replace it once the mechanics are in. When it does: 16-pixel tiles,
  integer scaling, player sprites taller than a tile so gear reads, equipment
  drawn in layers (body, legs, torso, head, weapon, shield) with one drawing
  per item kind and a tint per tier.

## 11. Tutorial island, first pass

One map. A path loops the island with a guide at each stop and a gate that
opens for you alone once the stop is done; others see you walk through what
looks closed to them. Shared, not instanced: seeing other newcomers is the
first proof it is an MMO, and with no trade or PvP there is nothing to grief.
Target 15 to 20 minutes, skippable on later characters.

| Stop | Teaches | Already in the content |
|---|---|---|
| Guide | Walk, click, right-click, examine, talk | yes |
| Survival expert | Chop a tree, light a fire, fish shrimp, cook them | all but firemaking |
| Quest guide | The journal and a one-step quest | yes (missions) |
| Mining instructor | Mine copper and tin, smelt bronze, smith a dagger | yes |
| Combat instructor | Equip the dagger, kill a rat, eat when hurt | yes |
| Banker and shopkeeper | Deposit, withdraw, buy a thing | bank is new |
| Boat | Lands you in the starting town | – |

Every verb in the game appears exactly once, and nothing is taught that the
town does not need right away. The starting town after it: a bank, a general
store, a mine, a forest, a fishing spot, a few monsters, one real quest.

## 12. What goes and what stays

**Deleted (done):** the single-player game: its systems, save and offline
catch-up, the progression tree, the simulated market, fast travel, the
panels and windows, client-side movement and monsters, the pixel-art
sprites and icons. The content tables (items, recipes, monsters, quests…)
still exist as data and are reshaped slice by slice; millisecond durations
in them become tick counts as each system is ported.

**Kept:** the content tables and their boot-time validation; typed ids; the
seeded RNG; the map format, grid and pathfinding; the tests and the layer
boundaries.

## 13. Build order

Each step is playable or demonstrable on its own. Status in the last column.

| # | Slice | Proves | Status |
|---|---|---|---|
| 0 | This document | The design does not drift | done |
| 1 | **Walk together**: one zone room on the tick, join with a name, click to walk, see each other move, chat over heads, reconnect; the idle game removed, the world drawn with simple shapes, the Pages client pointed at a hosted server | The tick feels right, one-tick-behind rendering is acceptable, the protocol shape, hosting | done |
| 1b | **Characters that last**: saved by name (zone, cell, facing, pace, and a document that grows with the slices), every zone as a room on one server with the maps' exits walking you between them, a secret the browser makes once as the stand-in for accounts, Postgres through `DATABASE_URL` with a JSON file for a machine without one | Persistence, zone transitions, identity | done |
| 2 | **One skill end to end**: woodcutting on the server, a bag of slots, logs on the ground with the visibility rule, a bank, all of it in the character's document | Durations as ticks, shared nodes, item replication | done |
| 2b | **Skills, numbers, gear and windows**: the thirteen skills to level 100 with an unlock on every level, hit points, mana, armor, attack and spell power from levels and gear, nine gear slots with wear and remove, Space to stop, and the UI as a draggable menu bar, draggable and resizable windows and a minimap | Stats and gear replicate, the chrome the rest of the game will live in | done |
| 2c | **Quests, campfires, the village's tools**: quests taken from a journal of tabs with a list and a page, tracked top left, finished by events and paid in coins, xp and items; no starting kit, Rowan and Greta handing out stone tools; stones from loose rock; campfires that are built, burn down and are fed, and cooking on any fire; fishing spots in the water; one inventory panel with gear, numbers, purse and bag; the menu bar along the bottom | Objectives from events, timed objects shared by a zone, a session like the bank's | done |
| 3 | **Every station, and the pace**: the furnace, the anvil, the sawbench and the tannery the way the campfire works, gathering timed in ticks by level with a bar over your head, eating, the talk balloon, the hidden bestiary, item pages that say how to get everything, sliders for HP and mana, dragging bag slots | Nothing new, breadth | done |
| 4 | Monsters as entities, combat, single-combat lock, death and drops | Shared combat | |
| 5 | Accounts (replacing the browser secret), names, chat channels, mute and ban, rate limits | Safety | |
| 6 | Tutorial island map and guides, the starting town, the first quest | Onboarding | |
| 7 | Trade window, shops, gold sinks | Economy | |
| 8 | Version handshake, metrics, backups, deploy pipeline | Operations | |

Port each system onto the server once, in the order above, so nothing is
written twice. The single-player game is gone; `main` deploys the online
client.

## 14. Not now

Classes, free movement, physics, magic and prayer, PvP, guilds, an exchange,
instancing, zone sharding, binary protocol, mobile layout.

## 15. Technical foundations (summary)

- **Server:** Node, TypeScript, one process, one room per zone, a drift-corrected
  tick loop. The room is a pure simulation with the socket layer as a thin
  adapter, so it runs headless in tests.
- **Protocol:** JSON over WebSocket, typed as discriminated unions shared by
  client and server. The client sends intents; the server sends a full
  snapshot on join and a delta every tick. Every inbound message is parsed
  against the schema and rate limited; nothing from the client is trusted.
- **Client:** a replica of the zone: your own character predicted from
  your inputs and reconciled against the server, everyone else interpolated
  a little behind it. The same canvas renderer draws it.
- **Persistence:** one JSON document per character, keyed by name, behind a
  small store interface: Postgres (`DATABASE_URL`, one `jsonb` row each) in
  production, a JSON file on a machine without a database, memory in tests.
  Written on leaving, on changing zone, every thirty seconds and at
  shutdown. Relational tables only for what must be queried across players,
  when that day comes.
- **Hosting:** the client stays static (GitHub Pages, which bakes the
  server's address in from the `SERVER_URL` repository variable); the server
  is one Node process on any host (`render.yaml` for Render's free tier, a
  `Dockerfile` for everything else) with a managed Postgres (Neon's free
  tier) for the characters. The protocol version travels in the handshake
  so stale clients are told to reload.
