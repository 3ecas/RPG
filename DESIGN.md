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
| Skill levels | 1 to 99 |
| Tier bands start at level | 1, 15, 30, 50, 70, 85 |
| Dropped item visible to others after | 60 s; gone after 180 s |
| Reconnect grace after a dropped connection | 30 s |
| Zone map size | 40 × 24 today; mainland maps may grow |

## 4. Skills and progression

- Fifteen skills stay. Each has a level from 1 to 99 on a steep xp curve.
- The six material tiers stay as the content ladder (bronze → iron → steel →
  mithril → adamant → rune, and the same for wood, fish, crops, herbs, hides).
  A tier is a **level band**, which is literally the RuneScape metal ladder.
  Content keeps its tier numbers; only the xp formula and the skills panel
  change.
- **Tools replace perks.** Gather speed comes from the pickaxe or hatchet in
  your bag, by tier, so speed is crafted and can be lost. Without one you
  cannot gather at all; a new character starts with a bronze hatchet.
- **The progression tree goes.** Zones open by walking, with danger and quests
  as the gates. Features it granted (dual wield, auto-eat, the market) become
  quest rewards or plain features.

## 5. Items, bag, bank, ground

- `ItemStack { itemId, qty }` stays as the storage shape; `stackable` becomes
  an item flag that is false for almost everything.
- The bag has 28 slots. The bank has many, with deposit-all and withdraw-x.
  Every town has a bank; the tutorial island has one.
- Ground items live in the zone state with an owner id and two timers.
- Per-instance data (enchantments, charges) is not needed yet.

## 6. Combat

- Auto-attack on the tick, both sides, as today. Weapon skills, Armor, Shields
  and Vitality keep being trained by use.
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

- **Chrome:** a fixed right panel with tabs for bag, gear, skills and quests, a
  docked chatbox, right-click menus. The bag is always visible. Draggable
  windows remain for bank, shop and crafting dialogs.
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
| 3 | Mining, smelting, smithing, fishing, cooking, firemaking the same way | Nothing new, breadth | |
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
