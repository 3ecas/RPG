# Greenhollow Online

A small RuneScape-like MMO for the browser, built slice by slice. Top-down,
point and click, one shared world on a server that runs on a fixed tick. The
world is drawn with simple shapes for now; art comes once the mechanics are
in. [DESIGN.md](DESIGN.md) is the design and the build order;
[ARCHITECTURE.md](ARCHITECTURE.md) is how the code is put together.

## What works today (slice 1: walk together)

- Pick a name, enter Greenhollow Village, see everyone else who is there.
- Click to walk. The server paths you eight ways and moves you one cell a
  tick, two when running (R).
- Talk: Enter, type, Enter. Lines show over heads and in the chat dock.
- Drop the connection and get your character back within 30 seconds.

## Play

The client is a static page; the server is a small Node process. GitHub
Pages hosts the client at https://3ecas.github.io/RPG/ but cannot run the
server, so a server has to run somewhere the page can reach.

### On your machine, two tabs

```bash
npm install
npm run server    # the zone server on ws://localhost:8080
npm run dev       # the client on http://localhost:5173; open it twice
```

### From the GitHub Pages site, with friends

1. **Host the server.** Render's free tier works in one click: in Render,
   New → Blueprint, pick this repository; `render.yaml` describes the
   service. Any host that runs `npm ci && npm run build:server` and
   `npm start` on Node 22 works too, and there is a `Dockerfile`. Free tiers
   sleep when idle; the first visitor waits a minute while it wakes.
2. **Tell the page where it is.** In the repository: Settings → Secrets and
   variables → Actions → Variables → New repository variable, name
   `SERVER_URL`, value the server's `wss://` address (Render shows it on the
   service page). The next push to `main`, or a manual run of the Pages
   workflow from the Actions tab, bakes it into the page.
3. **Share** https://3ecas.github.io/RPG/. Until the variable is set the page
   asks for a server address; `?server=wss://…` in the URL also works.

Server settings are environment variables: `PORT` (8080), `TICK_MS` (300),
`ZONE` (greenhollow), `GRACE_MS` (30000). `GET /health` on the server port
reports the tick and the player count.

## Develop

```bash
npm run check          # typecheck + lint (enforces layer boundaries) + tests
npm run build          # the client: ONE self-contained dist/index.html
npm run build:server   # the server: dist-server/main.js
npm start              # runs the built server
```

| Folder          | Contains                                                    | May import              |
|-----------------|-------------------------------------------------------------|-------------------------|
| `src/types/`    | Shared types, typed content ids                             | content, type-only      |
| `src/content/`  | The world's data: zones, tile maps, and the tables they list | types                  |
| `src/core/`     | The content registry with its validation, the seeded RNG    | types                   |
| `src/world/`    | Tile map model: grid, footprints, four- and eight-way paths | types                   |
| `src/net/`      | The wire protocol: message types and the strict parser      | types, world            |
| `src/server/`   | The zone server: the room simulation on a tick, the WebSocket adapter | everything but ui, client |
| `src/client/`   | The browser's replica of the zone and the socket to the server | types, world, net    |
| `src/ui/`       | The page: the shapes renderer, the shell, the join card, chat | client, net, world, types |
| `src/main.ts`   | The entry point                                             | everything              |
| `tests/`        | Vitest: protocol, room, server (real sockets), replica, paths, content |              |

ESLint fails the build if a layer imports something it should not.

## Next

Slice 2 of the build order in DESIGN.md: woodcutting end to end. A tree you
can chop, a bag of slots, logs on the ground with the owner-first visibility
rule, a bank, and the first character row in a database.
