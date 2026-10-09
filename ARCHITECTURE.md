# Greenhollow Online – Architecture

How the code is put together, as it stands. What the game is and the order
it is being built in live in [DESIGN.md](DESIGN.md).

---

## 1. Decisions in one screen

| Topic     | Decision                                                      | Why |
|-----------|---------------------------------------------------------------|-----|
| Language  | TypeScript, `strict: true`, one tsconfig for browser and server | A content-heavy game dies from typos in ids. The compiler catches them for free; sharing one config keeps the protocol one set of types. |
| Build     | Vite for the client (one self-contained `dist/index.html`); Vite's SSR build for the server bundle; `tsx` for development | Zero-config, one toolchain, native ES modules. |
| Server    | Node 22, `ws`, one process, every zone as a room on one fixed 50 ms step, a world that moves characters between rooms | A room is a pure simulation; the socket layer is a thin adapter. One process holds every zone until one zone needs its own. |
| Protocol  | JSON over WebSocket, discriminated unions shared by both sides, a strict parser | Readable on the wire while the shape settles. Nothing a client sends is trusted. |
| Client    | A replica of the zone: your own character predicted from your inputs and reconciled against the server, everyone else interpolated a little behind it, drawn on a canvas | Your movement never waits for the network; the server stays the authority. Simple shapes for now; art is a renderer swap. |
| Content   | Data files under `src/content/`, validated on boot            | Adding a zone or a thing on a map is adding an object literal. |
| Characters | One JSON document per name behind a small store interface: Postgres (`DATABASE_URL`, one `jsonb` row each) in production, a JSON file without a database, memory in tests | The document grows with the slices without migrations; the server never knows which store it has. |
| Identity  | A name plus a secret the browser makes once and keeps; the server stores its hash | A stand-in for accounts that costs nothing and lets a tester come back to their character. Accounts replace it (DESIGN.md §13, slice 5). |
| World     | Tile maps as text rows plus a legend; a grid with footprints; eight-way paths with the corner rule; one motion model (cell to cell, path-following) shared by server and client; the xp curve and the bag rules as pure functions | The server and the browser simulate the same code from the same inputs, so prediction is exact; the panels compute levels the way the server does. |
| Actions   | An action tick every 12 steps (600 ms) on top of the 50 ms step; each is one roll by level and tool at a gather node, or one thing cooked at a fire; items, gear, the bank, quests and fires change on commands, not predicted | Walking must feel immediate, gathering need not: a roll every 600 ms reads as a swing, and nothing the client cannot predict is predicted. |
| Chrome    | Floating windows over the canvas (drag, resize, close, remembered per browser) opened from a menu bar fixed along the bottom, a quest tracker top left, a minimap top right, a docked chat | The game will keep growing panels; one window manager and one way to open them keeps the shell from growing a layout per feature. |
| Tests     | Vitest: the room, the protocol, the replica, paths, content, and the server with real sockets | Everything that decides something is a pure function or a headless class. |
| Not used  | A framework, ECS, Phaser, an ORM, physics | Not yet needed: a circle sliding on a grid is all the movement needs, and one table with one `jsonb` column is all the data needs. |

---

## 2. The layering rule

```
main.ts ──► ui ──► client ──► net ──► world ──► types
                                 ▲        ▲        ▲
server ──────────────────────────┴────────┴────────┤
   └──► content ──► types              core ──────┘
```

| Layer      | May import                        | Must never                                   |
|------------|-----------------------------------|----------------------------------------------|
| `types/`   | nothing (type-only imports of content tables, to derive the id unions) | contain logic |
| `content/` | `types/`                          | contain logic, touch the DOM                 |
| `core/`    | `types/`                          | know a rule (the registry and the RNG are plumbing) |
| `world/`   | `types/`                          | touch the DOM (pure geometry over map content) |
| `net/`     | `types/`, `world/`                | touch the DOM; trust anything a client sent   |
| `client/`  | `types/`, `world/`, `net/`        | touch the DOM beyond `WebSocket`; import `ui/` |
| `server/`  | everything except `ui/`, `client/` | touch the browser                           |
| `ui/`      | `client/`, `net/`, `world/`, `types/` | import `content/` or `core/` (content reaches it through an injected interface); decide a rule |
| `main.ts`  | everything                        |                                              |

`eslint.config.js` enforces this with `no-restricted-imports` and
`no-restricted-globals`, so an import in the wrong direction or a `document`
in server code fails `npm run lint`.

---

## 3. Folders

```
rpg/
├─ index.html · styles/main.css
├─ package.json · tsconfig.json · vite.config.ts · vite.server.config.ts · eslint.config.js
├─ Dockerfile · render.yaml · .github/workflows/static.yml
├─ src/
│  ├─ main.ts                 # the entry point: content → where the server is → shell
│  ├─ types/{ids,content,result}.ts
│  ├─ content/                # zones, maps, and the tables the maps' legends refer to
│  ├─ core/{registry,rng}.ts  # typed content lookup + validate(); seeded PRNG
│  ├─ world/{grid,path,motion}.ts  # parseMap, walkability, footprints; BFS paths, eight-way with the corner rule; the motion model
│  ├─ world/{skills,bag,stats,fire,food}.ts  # the xp curve, tier bands, the gather pace and the cook roll; bag slots and bank stacks; hit points, mana, armor, attack, spell power from levels and gear; what a campfire takes and how long it burns; eating
│  ├─ net/protocol.ts         # message types, limits, parseClientMessage
│  ├─ server/
│  │  ├─ room.ts              # one zone: enter, path, step, use what you clicked, gather, items, bank, talk, quests, stations and campfires, eating, chat, grace, exits
│  │  ├─ quests.ts            # objectives as counted or live, progress, the quest view
│  │  ├─ world.ts             # every zone as rooms on one tick; carries characters between them
│  │  ├─ character.ts         # the character record, the secret hash, the record parser
│  │  ├─ state.ts             # skills, bag, bank, gear, points, quests and coins as stored and as read back
│  │  ├─ store.ts             # where characters live: memory, a JSON file, Postgres
│  │  ├─ server.ts            # the ws adapter: sessions, identity, loads and saves, limits, tick loop, /health
│  │  └─ main.ts              # reads the environment and starts the server
│  ├─ client/
│  │  ├─ replica.ts           # the zone as the client knows it, one tick behind, interpolated
│  │  └─ socket.ts            # hello, reconnect with backoff, the session token
│  └─ ui/
│     ├─ shell.ts             # top bar, join card, menu bar, the windows' contents, the quest tracker, menus, chat dock; wires socket → replica → scene
│     ├─ windows.ts           # draggable, resizable, closable windows that remember their layout, kept above the menu bar
│     ├─ minimap.ts           # the zone small: ground, things, everyone, the view's edge
│     ├─ scene.ts             # the canvas: flat tiles, shapes, items, players, swings, labels, bubbles, xp drops
│     └─ html.ts              # escaping
└─ tests/
   ├─ net/protocol.test.ts · server/{room,gather,quests,cooking,world,store,server}.test.ts · client/replica.test.ts
   └─ world/{grid,path8,motion,skills,bag}.test.ts · content.test.ts
```

---

## 4. Movement (`world/motion.ts`), the room (`server/room.ts`) and the world (`server/world.ts`)

**The motion model** is one module shared by the server and the browser, so
both simulate the same thing from the same inputs. A mover always stands in
a cell or is on its way to the next one: its state is the cell it stands in
or is leaving, the path of cells still to walk, and how far along it is to
the next one. One `step` is 50 ms of walking or running along that way (a
diagonal is a longer way, so it takes longer); when a step reaches the next
cell the leftover carries into the one after, so nothing pauses at cell
boundaries. `positionOf` is where it is drawn, between the two cell centres.
`planWalk` turns a clicked cell into a path (`nearestReachable` picks the
cell or the reachable one nearest to it, so clicking a tree or a person walks
you to the cell beside it; `findPath8` finds the way); a click mid-walk takes
effect once the cell under way is reached. There is no free position, no
collision and nothing half on a cell: the game reasons in whole cells, which
is what lets every interaction be "from the cell next to it".

**The room** is one zone as a pure simulation. It holds the players (id,
the character record's fields, position, facing, running, path, the queue
of inputs not yet applied, the number of the last input applied, connected
or not and since when), three buffers for the next delta (`joined`, `left`,
`said`), and the exits: which zone each exit cell leads to.

- `enter(character, at)` stands a character at `at` when one can stand
  there (its saved cell), else on the spawn; a full room refuses. `admit`
  takes a player arriving from another room, same id and connection, and
  stands it on `entrance(from)`: the exit cell that leads back to `from`.
- `queueInput(id, input)` takes one step: a sequence number and, when there
  was a click, the cell to walk to. Stale, duplicate and out-of-order inputs
  are refused, and the queue holds eight.
- `advance()` is one tick: each player's queued inputs are applied, one in
  the steady state and up to three to catch up after a hiccup, each as one
  `step` of the motion model; dropped characters leave once the grace period
  is over; a player whose step landed on an exit cell leaves at once
  (`takeDepartures()` says who and for where); the delta comes back with the
  placement of everyone who moved or just stopped (`[id, cell, next cell or
  -1, progress, facing, moving, seq]`) and the buffers clear. A dropped
  player stands in the nearer of the two cells it was between. Chat is one
  line per player per tick.

Because the server only moves a character when its client sends an input,
and at most a few per tick, nobody can move faster than the model allows.
Players never block one another; only the static map decides where one can
stand.

**Using things.** A click can carry `use`: the walk is planned as usual
(`nearestReachable` already stops beside a thing one cannot stand on) and
the room keeps the clicked cell as the player's *intent*. The tick the walk
ends with the player on a whole cell, `arrive` looks at that cell: a gather
node, the bank chest, a person, the village campfire or a fire someone built
beside the player (eight neighbours count) is used, an item the player can
see on or beside the cell is taken, anything else is nothing. Any new click
first stops whatever was being done.

- **Talking** (`talk`): the person's lines go to the player as `talk` in
  its `you` message (the greeting, then what they handed over), which the
  client shows in a balloon; one with a `handout` (Rowan's stone hatchet,
  Greta's stone pickaxe, Tobb's oak rod) gives it to a player with no tool
  of that skill on the belt, in the bag or in hand, and it hangs on the
  belt; a quest waiting on the talk hears of it. There is no starting kit:
  tools come from people.
- **The tool belt** (`belt`): one tool per tool skill (a hatchet, a pickaxe,
  a fishing rod), worn rather than carried. `belt on` hangs the tool in a
  bag slot there (what hung there takes the bag slot), `belt off` puts it
  back in the bag; anything given to a player that is a tool with a free
  belt slot goes straight on the belt. `bestTool` looks on the belt, in the
  bag and in the main hand.
- **Gathering** (`startGather`, `work`): the node must have something left,
  the skill must be at the tier's level (`levelForTier`), the skill's tool
  (a hatchet for woodcutting, a pickaxe for mining, a rod for fishing;
  harvesting needs none) must hang on the belt or be in the bag or in hand,
  and the bag must have a slot.
  Each item is timed: `gatherTicks` (`world/skills.ts`) gives 250 ticks at
  level 1 down to 50 at level 100, a fifth more per node tier past the
  first, a fifth less per tool tier past the first, never under 25. The
  room swings every `actionSteps` ticks (12, so 600 ms), re-checking the
  tool and the bag, and when the item's tick comes it goes in the bag with
  its xp (a level-up is a note), the next one is timed by the level and
  tool as they now are, and the node's `deplete` chance may empty it for
  everyone, with every worker stopped and a `nodes` event; it comes back
  after `respawnMs`. The player faces the node and the room tells everyone
  with an `acts` event that carries the ticks per item, sent again as each
  item lands so a progress bar can follow.
- **Eating** (`eat`, `swallow`): food leaves the bag at once and heals 35
  ticks later (`world/food.ts`), one thing at a time, never past the
  maximum.
- **Items on the ground** (`drop`, `take`): a dropped slot lies on the
  player's cell with its owner's key and two ticks: public at
  `itemPublicSteps` (60 s), gone at `itemGoneSteps` (180 s). Visibility is
  per player (owner, or anyone once public), so the owner learns of it
  through its private `you` events and everyone through the room's `drops`
  once it is public; `taken` is public. Taking is all or nothing and needs
  room in the bag.
- **The bank** (`bank`): opens on arrival beside a chest and shuts on the
  next click that moves you, on `close`, or on a drop of the connection.
  Deposit moves a slot (or everything) into the stacks; withdraw hands out
  as many as the bag can hold.
- **Stations** (`make`, `makeOnce`, `leaveStation`): arriving beside any
  station on the map (the campfire, the furnace, the anvil, the sawbench,
  the tannery) or beside a campfire someone built opens a session like the
  bank's (`StationSession`: which station; for a fire, which one and how
  long it burns), shut by any walk or stop or by `station close`. `make`
  starts a make action for so many of one of that station's recipes the
  level allows and the bag has the makings for; every `makeSteps` (the
  recipe's time in action ticks, a percent less per level of the skill
  down to half, except cooking) one set of makings is used up and the
  output lands with its xp. At a fire the cook comes out right or burnt by
  `cookChance` (two thirds at the tier's level, a percent more per level,
  never certain); everywhere else it always comes out. A `craft` quest
  event is raised for each thing made.
- **Campfires** (`fire`): the village fires are `campfire` stations on the
  map and never go out; `fire build` makes one on the player's cell from
  two stones and the lowest log in the bag (`world/fire.ts`: a minute of
  fuel per log tier, ten minutes at most, 15 Crafting xp) and steps the
  player off it (a move the client takes as the server's word), `feed` adds
  a log to the fire being stood by, and fires burn down on the tick and go
  out for everyone (`fires` and `doused` in the delta; whoever was using
  one is told). Both sides plan walks around the fires they know of
  (`blocked` in `planWalk`), so a clicked fire is used from beside it; a
  walk under way crosses one lit in its path.
- **The bestiary** (`meet`): the creatures a character has fought, by id,
  kept with the character and sent as `bestiary`; the journal tells only
  those. Nothing calls `meet` until combat lands.
- **Quests** (`acceptQuest`, `abandonQuest`, `questEvent`, `refreshQuests`,
  `checkQuests`, with `server/quests.ts`): a quest is taken from the
  journal once its prerequisites hold (another quest done, a tier reached,
  an item held). Counted objectives (kill, gather, craft, talk, visit,
  trade) advance from events the room raises as things happen; live ones
  (have an item, reach a tier, wear a kind) are read off the character
  whenever the bag, gear or xp change. A quest whose objectives are all met
  is done at once: coins go to the purse, xp to the skill, items to the bag
  (or the ground when it is full), and the journal and the tracker learn
  of it through `quests` in the `you` message.
- **Private events**: everything only one player learns (bag, xp, bank,
  coins, the station being used, quests, the creatures met, words said to
  it, own drops, notes) accumulates on the player and `takeYou()` drains it
  after each tick, so the server sends one `you` message per changed player
  per tick while the room's delta stays one encoding per zone.

**Gear and numbers** (`equip`, `unequip`, `statsOf`): a bag slot with an
`equip` goes to the slot its kind names (a weapon to the main hand, a shield
or tome to the off hand, a trinket to the first free trinket slot) once the
item's requirements hold (a tier's level in Hand Weapons, Bows, Magic or
Vitality); what was worn takes the bag slot the new piece came from; what
is removed goes to the first free bag slot. `deriveStats` (`world/stats.ts`)
turns levels and worn gear into max hit points, max mana, armor, attack and
spell power; the room keeps the current hit points and mana within the
maximums and brings a point of each back every `regenInterval` action ticks
(twelve at level 1 of Vitality or Spirit, one fewer every ten levels). The
best tool for a skill is looked for in the bag and the main hand.

**Stopping**: an input with `stop` cuts the path to the cell under way,
clears the intent and the action, and shuts the bank and the station; the
client predicts the same cut, so the two agree. `swap` moves a bag slot
onto another.

A character's skills, bag, bank, gear, belt, hit points, mana, quests,
coins and bestiary are the typed `PlayerState` (`state.ts`), read from the record's
`state` document when it enters (unknown items and skills dropped, a
renamed item read under its new name, hit points and mana full when
unknown) and written back by `stateOf`. Monsters are not in the room yet
(DESIGN.md §13).

**The world** owns one room per zone and the one id counter they share. It
finds a player by name wherever it stands, `enter(record)` puts a saved or
new character in its zone at its cell (the spawn of that zone when the cell
is not walkable, the starting zone when the zone no longer exists),
`recordOf(player)` is the document to save, and `advance()` ticks every
room, then stands each departing player on the entrance of the zone it
walked into and reports the deltas per zone, who moved and who left the
world for good. A character that changes zone has its input number jumped
by 1000, so steps its client had already sent for the old zone are refused
as stale instead of walking it somewhere in the new one. Standing on an
entrance does nothing; stepping onto an exit does.

## 5. The protocol (`net/protocol.ts`)

Client → server: `hello` (name, protocol version, the browser's secret,
session token or null), `input` (one step: a sequence number, the clicked
cell to walk to when there is one, `use` when the click was on something to
use once there, `stop` to halt at the next cell), `run` (on or off), `chat`
(text), `drop` (a bag slot), `equip` (a bag slot), `unequip` (a gear slot),
`eat` (a bag slot), `swap` (two bag slots), `belt` (`on` with a bag slot,
`off` with a skill), `quest` (`accept` or `abandon` an id), `fire` (`build`
one where you stand, `feed` the one you stand by),
`station` (`close`: step away from the one you use), `make` (a recipe and
how many), `bank` (`deposit` a slot and quantity, `withdraw` an item and
quantity, `all`, `close`), `ping`.
Server → client: `welcome` (your id, a session token, the step length,
whether this is a saved character coming back, your bag, skills, gear,
belt, numbers, quests, coins and bestiary, and the zone: its id, the server tick,
a full snapshot of the entities, the items you can see, the empty nodes,
the fires burning, and the number of your last input it knows),
`zone` (the same zone snapshot for the zone you just walked into; id, token,
bag and skills stay), `tick` (the delta: `joined`, `left`, `moves` as `[id,
cell x, cell y, next x, next y, progress, facing, moving, seq]` for everyone
who moved or just stopped, `acts` as `[id, x, y, facing, ticks]` for
whoever started working on the thing at a cell (with the ticks each item
takes, sent again as each lands) or stopped (x = -1), `nodes` as
`[object index, 1 or 0]` for nodes emptied or back, `drops` and `taken` for
items that appeared for everyone or are gone, `fires` as `[id, x, y]` for
campfires lit and `doused` for ones gone out, `chat`), `you` (what only you
learn: your bag after a change, xp per skill, your gear, belt and numbers
after a change, your quests with their progress, your coins, the bank while it is
open or null when it shuts, the station you stand by or null when you step
away, what someone said to you (`talk`), the creatures you have met, your
own drops, notes), `reject` (a reason, then the socket closes), `pong`. A
placement is whole cells plus one fraction, never a free position.

`parseClientMessage` accepts exactly these shapes and nothing else: integers
within bounds, booleans, names normalized (trimmed, single spaces, a letter
first, 3 to 12 characters), secrets of 16 to 64 letters, digits, dashes and
underscores, chat with control and invisible characters removed and cut to
80. `PROTOCOL_VERSION` is bumped when a shape changes and the server turns
other versions away.

## 6. The server (`server/server.ts`, `server/main.ts`, `server/character.ts`, `server/store.ts`)

A `ws` endpoint over a Node `http` server in front of the world, with a
character store behind it.

- **Tick loop**: a fixed schedule from the start time (`startedAt + n ×
  tickMs`, 50 ms by default), so a slow tick never delays the next. Every
  tick: `world.advance()`, forget the sessions of characters that left for
  good, send `zone` to everyone who walked into another zone, send each
  room's delta (encoded once) to the connections standing in it, send a
  `you` to each player whose own state changed, save the characters that
  changed zone. `drop` and `bank` commands go to the world as they arrive
  and their effects ride the next tick's `you`.
- **Who you are**: a `hello` carries a name and the browser's secret. A
  known session token resumes the character in the world and closes its
  previous socket. Otherwise, one hello at a time per name: if the
  character is in the world (connected, or dropped and within its grace)
  the secret has to match its hash, and a connected one is "already in the
  world"; if not, the record is loaded from the store, the secret has to
  match, and the character is stood where it was (`world.enter`); a name
  the store has never seen becomes a new character on the starting zone's
  spawn and is written at once, so the name is this browser's from then
  on. A refusal is a `reject` with the reason, then the socket closes.
- **Saves**: when a socket drops (the character is marked disconnected,
  stands on a whole cell, and leaves after `GRACE_MS`), on every zone
  change, every `SAVE_MS` for everyone in the world, and at `close()`,
  which the entry point calls on SIGINT and SIGTERM and awaits before
  exiting. A failing save is logged, never fatal; the store is opened
  before the server listens, so a file that cannot be read or a database
  that cannot be reached stops the boot with a clear message.
- **The record** (`character.ts`): name, the SHA-256 of the secret, created
  and last seen, zone, cell, facing, running, and `state`, a free object for
  the coming slices. `parseRecord` checks a stored document's shape.
- **The store** (`store.ts`): `open`, `load(key)`, `save`, `saveMany`,
  `close`. `MemoryStore` for tests; `FileStore` reads the file once, keeps
  the map, and rewrites the whole file on every save (to a temporary file,
  renamed into place), refusing to start on a file it cannot parse rather
  than overwrite it; `PostgresStore` (postgres.js) keeps one `jsonb` row per
  key in a `characters` table it creates on first use, with prepared
  statements off so pooled connection strings work. `openStore` picks by
  `DATABASE_URL`, else `DATA_FILE`.
- **Limits**: a token bucket per connection (thirty messages a second,
  enough for one input per step and a little more), a strike count for
  off-schema, binary or over-rate messages that closes the socket at ten, a
  hello timeout, a payload cap, keepalive pings every 30 s.
- `GET /health` reports the tick, how many are in which zone, the protocol
  version and the store in use. `main.ts` reads `PORT`, `TICK_MS`,
  `START_ZONE`, `GRACE_MS`, `SAVE_MS`, `DATABASE_URL`, `DATA_FILE`.

## 7. The client

- **`client/socket.ts`**: opens the socket, sends `hello` with the name,
  the browser's secret and the token, hands every message up with a
  timestamp, reconnects with backoff (1 s to 10 s) unless rejected, keeps
  the token.
- **`client/replica.ts`**: two jobs. *Yourself, predicted*: `update(now)`
  runs the motion model in 50 ms steps; every step while a path is being
  walked or a click is pending becomes a numbered `input`,
  applied at once and handed to the socket, and the predicted state after it
  is remembered. When the server's state for that input number comes back it
  is compared with the prediction: equal (the normal case) means nothing to
  do; different means the server's placement is taken (with the rest of the
  predicted path when it runs through the cell the server names), the newer
  inputs are replayed on top, and the visual difference is faded out over a
  few frames instead of snapped. A hidden tab does not burst a backlog of
  inputs.
  *Everyone else, interpolated*: each `tick` adds a timestamped state to the
  entity's history; `positionAt(entity, now)` draws two ticks behind the
  newest server tick on a clock that follows the earliest arrivals, so a
  late packet shows as a brief hold rather than a jump. Chat lines carry the
  time they arrived so bubbles and the log agree. A `zone` message starts
  the replica over with the new zone's snapshot, keeping who you are, the
  chat log and the input numbering the server gives. It also keeps the
  items on the ground you can see, the empty nodes, the fires burning, what
  each entity is working on (and for yourself how long each item takes, for
  the progress bar), and your own bag, skills (with xp drops to show for a
  moment), gear, numbers, quests, coins, the creatures met, the bank while
  it is open and the station you stand by; `use(cell)` is a click whose
  input carries the intent and `stop()` an input that halts; a `version`
  counter tells the panels when to redraw.
- **`ui/scene.ts`**: pre-renders the ground once per map (a flat colour per
  terrain with a little texture), then each frame draws exits, the click
  marker, items on the ground (a tilted square in the colour of the item's
  kind), every placed object as a shape (a stump or a hollow for an empty
  node, a chest for the bank), every player as a coloured disc with a facing
  dot (your own with a ring) and a swinging tool when it works on something,
  all y-sorted, and in screen space the names (people with their role under
  them), bubbles, the labels of what is near you, a bar over your own head
  for the item under way, your xp gains floating up, and what the pointer
  is over. The
  camera is locked on you, so the void shows past the map's edge. Clicks go
  up as `onClick(cell, button, screen)`; `labelAt(cell)` asks the shell what
  to say about a cell.
- **`ui/windows.ts`**: the window manager. A window is a title bar to drag
  by (`makeDraggable`), a close button, a native resize grip, a body; it is
  placed where it was last left and opened or not as it was, from
  `localStorage`, kept inside the stage and above the menu bar along its
  bottom, and brought to the front when touched, always below the menus,
  the balloon and the dialogs. `reset()` restores the defaults.
- **`ui/minimap.ts`**: the zone's ground once at a pixel per cell, scaled up
  without smoothing each frame, with what stands on the map as dots,
  everyone as a dot in their colour, you with a ring, and the edge of what
  the main view shows.
- **`ui/shell.ts`**: the join card (name, server address, the hint when the
  page was built without one), the top bar (zone, connection, players, tick,
  ping), the menu bar along the bottom (Inventory, Journal, Skills, Map,
  Settings, with I, J, K, M, O as keys), the windows' contents (the
  inventory as the tool belt (hatchet, pickaxe, fishing rod) down the left,
  the nine gear slots laid out as a body, hit points and mana
  as sliders with the numbers on the left and the percentage on the right,
  the other numbers, the purse, and the bag as 28 slots with coloured
  initials for icons; the journal as tabs across the top, each a list on
  the left and a page on the right: quests with their giver, task,
  objectives, rewards and the one button to accept or abandon, the
  adventure log, the bestiary that tells only the creatures met and ???
  for the rest, and a filterable item database whose pages say how to come
  by each thing and what it is good for; the skills as levels with a bar,
  and each skill's hundred unlocks with the current one marked; the settings
  with run, hover labels, chat, a layout reset and a way out; the bank with
  stacks, 1 / 5 / All and deposit all; the station with what the bag has the
  makings for, one or all, and for a fire how long it burns and a log for
  it), the quest tracker top left (every active quest with its objectives,
  red until done and green after), the balloon above the menu bar for what
  people say, the yes-or-no dialog, the chat dock, the run toggle. A click
  on the world does the first thing worth doing there (take an item, chop a
  tree, talk to someone, use the bank or a station) or walks; a right click
  lists the choices (`optionsAt`: Take, Chop/Mine/Fish/Harvest, Talk to, Use
  Bank, Use Furnace, Use Campfire, Examine, Walk here); a press on a bag
  slot offers Eat, Put on the belt (a tool), Wear or Wield, Build a campfire
  here (with two stones and a log in the bag), Add to the fire (a log, by a
  built fire), Deposit (while the bank is open), Drop and Examine, and a
  drag of it onto another slot swaps them, onto the belt hangs it there, or
  onto the world asks whether to throw it away; a click on a gear slot
  offers Remove and Examine, on a belt slot Take off and Examine. Menus sit
  above every window.
  Shift held or R toggled runs, Space stops, Enter talks, Escape closes a
  dialog, a menu, the balloon, the bank, the station, or the chat box. The
  tick in the top bar goes round every thousand; the server's own counter
  never does. Notes from the game and examine
  texts are lines in the chat log and in the journal. The name is remembered
  per browser, the session token per tab, the secret per browser
  (`localStorage`, made once from `crypto.getRandomValues`), and the window
  layout per browser. On `welcome` and `zone` it swaps the map on the scene,
  the minimap and the prediction and writes a line in the chat log.
- **`main.ts`**: validates content, decides the server address (`?server=`,
  then `VITE_SERVER_URL`, then `ws://localhost:8080` when running locally,
  else nothing), mounts the shell.

## 8. Content and the world model

Content stays the data layer it was: `as const` tables with typed ids, a
`Registry` that wraps them and whose `validate()` runs at boot on both sides.
The slice uses the zones, the maps, and the names and skills of what the maps
place; the rest (items, recipes, monsters, quests…) is carried along for the
coming slices and will be reshaped as they land (DESIGN.md §4 to §9).

A map is rows of characters plus a legend (`content/maps.ts`): terrain
characters and letters for placed objects, shops and the market filling 2×2
blocks. `world/grid.ts` turns it into terrain, placed objects with footprints
and walkability; `world/path.ts` has the four-way BFS and the eight-way
search: diagonals cost one step, a diagonal never cuts past something solid,
among equally short paths the one with the fewest diagonals wins and takes
them first.

## 9. Tests

- `tests/world/motion.test.ts`: standing and being drawn between cells,
  walking and running at a steady pace, diagonals, carrying over cell
  boundaries, a click mid-walk, clicks on the unreachable and on things, a
  path that is no longer walkable.
- `tests/server/room.test.ts`: entering at a saved cell or the spawn,
  refusing a full room, grace, inputs applied and echoed, stale and surplus
  inputs refused, walks from clicks, running, chat, exits and entrances,
  departures, every real map's entrances.
- `tests/server/gather.test.ts`: walking up to a clicked tree and chopping
  on action ticks with scripted dice, swings announced and stopped by a
  click, refusals (no hatchet, level, full bag, unreachable), a full bag
  stops the work, a tree falling for everyone and growing back, level-ups,
  drops that are the owner's then anyone's then gone, taking from the cell
  or beside it, the bank opening beside the chest and shutting on a walk,
  deposits and withdrawals within the bag's room, saved state read back.
- `tests/world/skills.test.ts`, `tests/world/bag.test.ts`: the curve's
  known values to level 100, levels and tier bands, the gather roll; the
  numbers from levels and gear, the weapon's skill, regeneration intervals,
  which slot takes what; slots, stacking, room, taking, bank stacks.
- `tests/server/gather.test.ts` also covers gear: wearing from the bag and
  the swap back, refusals by level and kind and a full bag, tomes and
  trinkets and a wielded hatchet, hit points held within the maximum and
  mana coming back, and a stop input halting at the next cell.
- `tests/server/quests.test.ts`: the objective helpers, taking a quest and
  finishing it through talk and gather events with its rewards paid,
  refusals and giving up, live objectives read off the character, a visit
  counted on a zone change, and the saved state read back.
- `tests/server/cooking.test.ts`: Rowan's and Greta's handouts once and
  not twice, building a fire and stepping off it, a fire burning down and
  going out under whoever uses it, feeding it the lowest log first up to
  the cap, cooking at the village fire with xp or a burn, smelting at the
  furnace and forging at the anvil by level and quicker with levels, a walk
  that stops the work, eating and its 35 ticks, the creatures met, coins
  and renamed tools read back.
- `tests/server/world.test.ts`: one room per zone with shared ids, placing
  from a record, the record of where one stands, lapsing, walking through
  an exit into the matching entrance and back, the input-number jump.
- `tests/server/store.test.ts`: the same contract for every store; the file
  store's whole-file atomic writes and refusals; parsing records; the
  Postgres store against a real database when `TEST_DATABASE_URL` is set.
- `tests/server/server.test.ts`: a real server on a free port and real
  WebSocket clients: two players see each other walk and talk, version and
  name refusals, junk closes a socket, reconnect by token replaces the old
  socket, a lapsed character comes back from the store where it stood, a
  name refuses another browser's secret, a walk through an exit sends
  `zone` and leaves the old room, everyone is back after a restart with
  the same store, chopping a tree then dropping the log for the other player
  to find once it shows and the whole lot in the store, the health check.
- `tests/net/protocol.test.ts`: names, chat, every message, every rejection.
- `tests/client/replica.test.ts`: prediction and the inputs it sends, a
  click as a walk, agreement and replay on disagreement, resuming input
  numbers, no bursts after a pause, interpolation of others, early and late
  ticks, bubbles.
- `tests/world/*`: parsing, footprints, both path searches, path shape,
  every zone reachable and connected.
- `tests/content.test.ts`: the registry's validation of every table.

## 10. Conventions

- Ids are `snake_case`; files `kebab-case.ts`; types `PascalCase`; no default
  exports; no `console.log` outside `server/main.ts`.
- Movement happens only inside `world/motion.ts`, in whole steps of
  `STEP_MS`, from cell to cell; the server and the client never move anything
  any other way. The client's clock is `performance.now()`.
- Anything that rolls dice happens in the room on an action tick, from the
  room's `Rng` (seeded in tests); never `Math.random()` in anything that
  decides an outcome. The client predicts walking and nothing else.
- Levels, bag room and stacking are pure functions in `world/`; the server
  and the panels call the same ones.
- Adding something to a map must never require touching `server/` or `ui/`:
  if it does, the content model is missing a field.

## 11. Status

Slices 1 to 3 of DESIGN.md §13 are done: walking together, characters that
last across every zone on one server, gathering end to end (nodes that
empty for everyone, timed by level, a bag, items on the ground with the
owner-first rule, a bank), the thirteen skills to level 100 with the
character's numbers, nine gear slots and the windowed chrome, quests with a
journal and a tracker, tools handed out by the village, campfires, and
every station (cooking, smelting, forging, carving, tanning) with eating,
all saved in the character's document. Next: slice 4, monsters and combat.
