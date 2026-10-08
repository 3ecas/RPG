# Greenhollow Online – Architecture

How the code is put together, as it stands. What the game is and the order
it is being built in live in [DESIGN.md](DESIGN.md).

---

## 1. Decisions in one screen

| Topic     | Decision                                                      | Why |
|-----------|---------------------------------------------------------------|-----|
| Language  | TypeScript, `strict: true`, one tsconfig for browser and server | A content-heavy game dies from typos in ids. The compiler catches them for free; sharing one config keeps the protocol one set of types. |
| Build     | Vite for the client (one self-contained `dist/index.html`); Vite's SSR build for the server bundle; `tsx` for development | Zero-config, one toolchain, native ES modules. |
| Server    | Node 22, `ws`, one process, one room per zone, a fixed 50 ms step | A room is a pure simulation; the socket layer is a thin adapter. One process holds every zone until one zone needs its own. |
| Protocol  | JSON over WebSocket, discriminated unions shared by both sides, a strict parser | Readable on the wire while the shape settles. Nothing a client sends is trusted. |
| Client    | A replica of the zone: your own character predicted from your inputs and reconciled against the server, everyone else interpolated a little behind it, drawn on a canvas | Your movement never waits for the network; the server stays the authority. Simple shapes for now; art is a renderer swap. |
| Content   | Data files under `src/content/`, validated on boot            | Adding a zone or a thing on a map is adding an object literal. |
| World     | Tile maps as text rows plus a legend; a grid with footprints; eight-way paths with the corner rule; one motion model (continuous, sliding, path-following) shared by server and client | The server and the browser simulate the same code from the same inputs, so prediction is exact. |
| Tests     | Vitest: the room, the protocol, the replica, paths, content, and the server with real sockets | Everything that decides something is a pure function or a headless class. |
| Not used  | A framework, ECS, Phaser, a database (next slice), physics | Not yet needed: a circle sliding on a grid is all the movement needs. |

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
│  │  ├─ room.ts              # the simulation: join, path, step, chat, reconnect grace
│  │  ├─ server.ts            # the ws adapter: sessions, limits, tick loop, /health
│  │  └─ main.ts              # reads the environment and starts one zone
│  ├─ client/
│  │  ├─ replica.ts           # the zone as the client knows it, one tick behind, interpolated
│  │  └─ socket.ts            # hello, reconnect with backoff, the session token
│  └─ ui/
│     ├─ shell.ts             # top bar, join card, chat dock; wires socket → replica → scene
│     ├─ scene.ts             # the canvas: flat tiles, shapes, players, labels, bubbles
│     └─ html.ts              # escaping
└─ tests/
   ├─ net/protocol.test.ts · server/{room,server}.test.ts · client/replica.test.ts
   └─ world/{grid,path8,motion}.test.ts · content.test.ts
```

---

## 4. Movement (`world/motion.ts`) and the room (`server/room.ts`)

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
name, position, facing, running, path, the queue of inputs not yet applied,
the number of the last input applied, connected or not and since when) and
three buffers for the next delta (`joined`, `left`, `said`).

- `join(name)` places a character on the map's spawn, or lets a dropped
  connection take its own character back under the same name. A name in use
  by a connected player, or a full room, is refused with a reason.
- `queueInput(id, input)` takes one step: a sequence number and, when there
  was a click, the cell to walk to. Stale, duplicate and out-of-order inputs
  are refused, and the queue holds eight.
- `advance()` is one tick: each player's queued inputs are applied, one in
  the steady state and up to three to catch up after a hiccup, each as one
  `step` of the motion model; dropped characters leave once the grace period
  is over; the delta comes back with the placement of everyone who moved or
  just stopped (`[id, cell, next cell or -1, progress, facing, moving, seq]`)
  and the buffers clear. A dropped player stands in the nearer of the two
  cells it was between. Chat is one line per player per tick.

Because the server only moves a character when its client sends an input,
and at most a few per tick, nobody can move faster than the model allows.
Players never block one another; only the static map decides where one can
stand. Monsters, items and skills are not in the room yet (DESIGN.md §13).

## 5. The protocol (`net/protocol.ts`)

Client → server: `hello` (name, protocol version, session token or null),
`input` (one step: a sequence number, and the clicked cell to walk to when
there is one), `run` (on or off), `chat` (text), `ping`.
Server → client: `welcome` (your id, a session token, the step length, the
zone, a full snapshot of the entities and the number of your last input it
knows), `tick` (the delta: `joined`, `left`, `moves` as `[id, cell x, cell
y, next x, next y, progress, facing, moving, seq]` for everyone who moved or
just stopped, `chat`), `reject` (a reason, then the socket closes), `pong`.
A placement is whole cells plus one fraction, never a free position.

`parseClientMessage` accepts exactly these shapes and nothing else: integers
within bounds, booleans, names normalized (trimmed, single spaces, a letter
first, 3 to 12 characters), chat with control and invisible characters
removed and cut to 80. `PROTOCOL_VERSION` is bumped when a shape changes and
the server turns other versions away.

## 6. The server (`server/server.ts`, `server/main.ts`)

A `ws` endpoint over a Node `http` server in front of one room.

- **Tick loop**: a fixed schedule from the start time (`startedAt + n ×
  tickMs`, 50 ms by default), so a slow tick never delays the next. Every
  tick: `advance()`, forget the sessions of characters that left, broadcast
  the delta to every connection that has said hello.
- **Sessions**: `welcome` carries a random token; a `hello` with a known
  token resumes that character and closes its previous socket. A dropped
  socket marks the character disconnected; the room removes it after
  `GRACE_MS`. Joining under the name of a dropped character takes it over
  and invalidates the old token.
- **Limits**: a token bucket per connection (thirty messages a second,
  enough for one input per step and a little more), a strike count for
  off-schema, binary or over-rate messages that closes the socket at ten, a
  hello timeout, a payload cap, keepalive pings every 30 s.
- `GET /health` reports the zone, the tick, the player count and the
  protocol version. `main.ts` reads `PORT`, `TICK_MS`, `ZONE`, `GRACE_MS`.

## 7. The client

- **`client/socket.ts`**: opens the socket, sends `hello`, hands every
  message up with a timestamp, reconnects with backoff (1 s to 10 s) unless
  rejected, keeps the token.
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
  time they arrived so bubbles and the log agree.
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
  per browser, the session token per tab.
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
- `tests/server/room.test.ts`: joining, refusing, grace and takeover, inputs
  applied and echoed, stale and surplus inputs refused, walks from clicks,
  running, chat.
- `tests/server/server.test.ts`: a real server on a free port and real
  WebSocket clients: two players see each other walk and talk, version and
  name refusals, junk closes a socket, reconnect by token replaces the old
  socket, a dropped character lapses, the health check.
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

Slice 1 of DESIGN.md §13 is done and the idle single-player game it grew out
of has been removed. Next: slice 2, woodcutting end to end.
