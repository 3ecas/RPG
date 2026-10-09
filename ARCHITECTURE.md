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
| World     | Tile maps as text rows plus a legend; a grid with footprints; eight-way paths with the corner rule; one motion model (continuous, sliding, path-following) shared by server and client | The server and the browser simulate the same code from the same inputs, so prediction is exact. |
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
│  ├─ net/protocol.ts         # message types, limits, parseClientMessage
│  ├─ server/
│  │  ├─ room.ts              # one zone: enter, path, step, chat, reconnect grace, exits
│  │  ├─ world.ts             # every zone as rooms on one tick; carries characters between them
│  │  ├─ character.ts         # the character record, the secret hash, the record parser
│  │  ├─ store.ts             # where characters live: memory, a JSON file, Postgres
│  │  ├─ server.ts            # the ws adapter: sessions, identity, loads and saves, limits, tick loop, /health
│  │  └─ main.ts              # reads the environment and starts the server
│  ├─ client/
│  │  ├─ replica.ts           # the zone as the client knows it, one tick behind, interpolated
│  │  └─ socket.ts            # hello, reconnect with backoff, the session token
│  └─ ui/
│     ├─ shell.ts             # top bar, join card, chat dock; wires socket → replica → scene
│     ├─ scene.ts             # the canvas: flat tiles, shapes, players, labels, bubbles
│     └─ html.ts              # escaping
└─ tests/
   ├─ net/protocol.test.ts · server/{room,world,store,server}.test.ts · client/replica.test.ts
   └─ world/{grid,path8,motion}.test.ts · content.test.ts
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
stand. Monsters, items and skills are not in the room yet (DESIGN.md §13).

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
session token or null), `input` (one step: a sequence number, and the
clicked cell to walk to when there is one), `run` (on or off), `chat`
(text), `ping`.
Server → client: `welcome` (your id, a session token, the step length,
whether this is a saved character coming back, and the zone: its id, the
server tick, a full snapshot of the entities and the number of your last
input it knows), `zone` (the same zone snapshot for the zone you just walked
into; id and token stay), `tick` (the delta: `joined`, `left`, `moves` as
`[id, cell x, cell y, next x, next y, progress, facing, moving, seq]` for
everyone who moved or just stopped, `chat`), `reject` (a reason, then the
socket closes), `pong`. A placement is whole cells plus one fraction, never
a free position.

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
  room's delta (encoded once) to the connections standing in it, save the
  characters that changed zone.
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
  chat log and the input numbering the server gives.
- **`ui/scene.ts`**: pre-renders the ground once per map (a flat colour per
  terrain with a little texture), then each frame draws exits, the click
  marker, every placed object as a shape, every player as a coloured disc
  with a facing dot (your own with a ring), all y-sorted, and in screen space
  the names, bubbles and the labels of what is near you. The camera is locked
  on you, so the void shows past the map's edge. Click → cell → `onWalk`.
- **`ui/shell.ts`**: the join card (name, server address, the hint when the
  page was built without one), the top bar (zone, connection, players, tick,
  ping), the chat dock, the run toggle. A click plans a walk, Shift held or
  R toggled runs, Enter talks, Escape leaves the box. The name is remembered
  per browser, the session token per tab, and the secret per browser
  (`localStorage`, made once from `crypto.getRandomValues`). On `welcome`
  and `zone` it swaps the map on the scene and in the prediction and writes
  a line in the chat log ("Welcome back, Ada. You are in Copper Hills,
  where you left off."; "You enter Blackfen Marsh.").
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
  the same store, the health check.
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
- Randomness on the server comes from `core/rng.ts` when it arrives;
  never `Math.random()` in anything that decides an outcome.
- Adding something to a map must never require touching `server/` or `ui/`:
  if it does, the content model is missing a field.

## 11. Status

Slices 1 and 1b of DESIGN.md §13 are done: walking together, and characters
that last, across every zone, on one server. Next: slice 2, woodcutting end
to end, saved in the character's document.
