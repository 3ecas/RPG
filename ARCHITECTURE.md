# Greenhollow Online – Architecture

How the code is put together, as it stands. What the game is and the order
it is being built in live in [DESIGN.md](DESIGN.md).

---

## 1. Decisions in one screen

| Topic     | Decision                                                      | Why |
|-----------|---------------------------------------------------------------|-----|
| Language  | TypeScript, `strict: true`, one tsconfig for browser and server | A content-heavy game dies from typos in ids. The compiler catches them for free; sharing one config keeps the protocol one set of types. |
| Build     | Vite for the client (one self-contained `dist/index.html`); Vite's SSR build for the server bundle; `tsx` for development | Zero-config, one toolchain, native ES modules. |
| Server    | Node 22, `ws`, one process, one room per zone, a fixed tick   | A room is a pure simulation; the socket layer is a thin adapter. One process holds every zone until one zone needs its own. |
| Protocol  | JSON over WebSocket, discriminated unions shared by both sides, a strict parser | Readable on the wire while the shape settles. Nothing a client sends is trusted. |
| Client    | A replica of the zone, replayed one tick behind on the client's clock, interpolated, drawn on a canvas | No prediction, as in RuneScape. Simple shapes for now; art is a renderer swap. |
| Content   | Data files under `src/content/`, validated on boot            | Adding a zone or a thing on a map is adding an object literal. |
| World     | Tile maps as text rows plus a legend; a grid with footprints; eight-way paths with the corner rule | The map format is testable and the server paths over the same model the client draws. |
| Tests     | Vitest: the room, the protocol, the replica, paths, content, and the server with real sockets | Everything that decides something is a pure function or a headless class. |
| Not used  | A framework, ECS, Phaser, a database (next slice), client prediction | Not yet needed. |

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
│  ├─ world/{grid,path}.ts    # parseMap, walkability, footprints; BFS paths, eight-way with the corner rule
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
   └─ world/{grid,path8}.test.ts · content.test.ts
```

---

## 4. The room (`server/room.ts`)

One zone as a pure simulation. It holds the players (id, name, cell, facing,
running, the remaining path, connected or not and since when) and three
buffers for the next delta (`joined`, `left`, `said`).

- `join(name)` places a character on the map's spawn, or lets a dropped
  connection take its own character back under the same name. A name in use
  by a connected player, or a full room, is refused with a reason.
- `move(id, x, y)` turns a clicked cell into a path: `nearestReachable` picks
  the clicked cell or the reachable cell nearest to it (clicking a tree or the
  water walks you up to it), `findPath8` finds the way.
- `advance()` is one tick: every path advances one cell, two when running;
  facing follows the last step; dropped characters leave once the grace
  period is over; the delta comes back and the buffers clear. Chat is one
  line per player per tick.

Players never block one another; only the static map decides where one can
stand. Monsters, items and skills are not in the room yet (DESIGN.md §13).

## 5. The protocol (`net/protocol.ts`)

Client → server: `hello` (name, protocol version, session token or null),
`move` (a cell), `run` (on or off), `chat` (text), `ping`.
Server → client: `welcome` (your id, a session token, the tick length, the
zone and a full snapshot of the entities), `tick` (the delta: `joined`,
`left`, `moves` with the cells each entity stepped through and its facing,
`chat`), `reject` (a reason, then the socket closes), `pong`.

`parseClientMessage` accepts exactly these shapes and nothing else: integers
within bounds, booleans, names normalized (trimmed, single spaces, a letter
first, 3 to 12 characters), chat with control and invisible characters
removed and cut to 80. `PROTOCOL_VERSION` is bumped when a shape changes and
the server turns other versions away.

## 6. The server (`server/server.ts`, `server/main.ts`)

A `ws` endpoint over a Node `http` server in front of one room.

- **Tick loop**: a fixed schedule from the start time (`startedAt + n ×
  tickMs`), so a slow tick never delays the next. Every tick: `advance()`,
  forget the sessions of characters that left, broadcast the delta to every
  connection that has said hello.
- **Sessions**: `welcome` carries a random token; a `hello` with a known
  token resumes that character and closes its previous socket. A dropped
  socket marks the character disconnected; the room removes it after
  `GRACE_MS`. Joining under the name of a dropped character takes it over
  and invalidates the old token.
- **Limits**: a token bucket per connection, a strike count for off-schema,
  binary or over-rate messages that closes the socket at ten, a hello
  timeout, a payload cap, keepalive pings every 30 s.
- `GET /health` reports the zone, the tick, the player count and the
  protocol version. `main.ts` reads `PORT`, `TICK_MS`, `ZONE`, `GRACE_MS`.

## 7. The client

- **`client/socket.ts`**: opens the socket, sends `hello`, hands every
  message up with a timestamp, reconnects with backoff (1 s to 10 s) unless
  rejected, keeps the token.
- **`client/replica.ts`**: applies `welcome` and `tick`. Each delta is
  scheduled on the client's own clock, one tick apart, starting half a tick
  behind arrival; a delta that arrives too late shifts the clock, a burst
  that arrives early pulls it back, so the replica never trails the server by
  more than a tick and a half. `positionAt(entity, now)` interpolates through
  the cells stepped in the current tick. Chat lines carry the time they show
  so bubbles and the log agree.
- **`ui/scene.ts`**: pre-renders the ground once per map (a flat colour per
  terrain with a little texture), then each frame draws exits, the click
  marker, every placed object as a shape, every player as a coloured disc
  with a facing dot (your own with a ring), all y-sorted, and in screen space
  the names, bubbles and the labels of what is near you. Click → cell →
  `onWalk`.
- **`ui/shell.ts`**: the join card (name, server address, the hint when the
  page was built without one), the top bar (zone, connection, players, tick,
  ping), the chat dock, the run toggle; Enter talks, Escape leaves the box,
  R runs. The name is remembered per browser, the session token per tab.
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

- `tests/server/room.test.ts`: joining, refusing, grace and takeover,
  walking and running, diagonals, clicks on the unreachable, chat.
- `tests/server/server.test.ts`: a real server on a free port and real
  WebSocket clients: two players see each other walk and talk, version and
  name refusals, junk closes a socket, reconnect by token replaces the old
  socket, a dropped character lapses, the health check.
- `tests/net/protocol.test.ts`: names, chat, every message, every rejection.
- `tests/client/replica.test.ts`: snapshot, joins and leaves, interpolation,
  late and early ticks, bubbles.
- `tests/world/*`: parsing, footprints, both path searches, path shape,
  every zone reachable and connected.
- `tests/content.test.ts`: the registry's validation of every table.

## 10. Conventions

- Ids are `snake_case`; files `kebab-case.ts`; types `PascalCase`; no default
  exports; no `console.log` outside `server/main.ts`.
- Every duration the server owns is a count of ticks or `TICK_MS`; the
  client's clock is `performance.now()`.
- Randomness on the server comes from `core/rng.ts` when it arrives;
  never `Math.random()` in anything that decides an outcome.
- Adding something to a map must never require touching `server/` or `ui/`:
  if it does, the content model is missing a field.

## 11. Status

Slice 1 of DESIGN.md §13 is done and the idle single-player game it grew out
of has been removed. Next: slice 2, woodcutting end to end.
