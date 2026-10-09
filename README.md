# Greenhollow Online

A small RuneScape-like MMO for the browser, built slice by slice. Top-down,
point and click, one shared world on a server that runs on a fixed tick. The
world is drawn with simple shapes for now; art comes once the mechanics are
in. [DESIGN.md](DESIGN.md) is the design and the build order;
[ARCHITECTURE.md](ARCHITECTURE.md) is how the code is put together.

## What works today (slices 1 to 2b: walk together, characters that last, woodcutting end to end, skills and gear and windows)

- Pick a name, enter Greenhollow Village, see everyone else who is there.
- **Chop trees.** Click an oak (or right-click it for Chop, Examine, Walk
  here) and you walk up beside it and swing. Every action tick (600 ms) rolls
  for a log, better with your level and your hatchet's tier. Logs go into a
  bag of 28 slots, one each; xp floats up and the Skills tab shows the
  level. A tree sometimes falls, for everyone, and grows back a few seconds
  later. You start with a bronze hatchet; without one you cannot chop.
- **Drop and take.** Click a bag slot for Drop or Examine. A dropped item
  lies where you stood: yours alone to see for a minute, then anyone's to
  take, gone after three. Click it (or Take from the right-click menu) to
  pick it up.
- **Bank.** The chest east of the village square: Use Bank from beside it,
  deposit a slot or everything, withdraw one, five or all of a kind. The
  bank stacks everything; the bag does not.
- **Thirteen skills to level 100.** Lumberjack, Mining, Fishing, Harvesting,
  Smithing, Crafting, Cooking, Hand Weapons, Bows, Vitality, Spirit, Magic,
  Witchcraft. Every level gives something, and the Skills window lists all
  hundred for each: the trees, rocks, recipes and gear a tier opens, and the
  small bonus every other level adds (gathering gets 2% likelier per level,
  so it is slow at first and quick late).
- **Numbers and gear.** Hit points, mana, armor, attack and spell power come
  from Vitality, Spirit, Magic and what you wear in nine slots: head, torso,
  legs, hands, feet, main hand, off hand, two trinkets. Wear and wield from
  the inventory, remove from the Gear window; too high a tier and the game
  says which level you need. Hatchets and pickaxes can be wielded.
- **Windows.** A draggable menu bar opens the Inventory, Gear, Journal
  (quests, your adventure log, a bestiary, the item database), Skills, Map
  and Settings. Every window drags by its title, resizes by its corner, and
  closes with its X; the layout is remembered per browser. The map sits top
  right. Keys: I, G, J, K, M, O for the windows, R to run, Space to stop,
  Enter to talk.
- Skills, bag, bank, gear, hit points and mana are saved with the character.
- Your character is saved under its name: leave and come back, on the same
  day or after the server restarted, and you stand where you left off, in
  the zone you were in. Every zone runs on the one server; walk onto an
  exit at a map's edge and you are in the next zone, where only the people
  there can see you.
- Until there are accounts, a name belongs to the browser that made it: the
  page makes up a secret once, keeps it in the browser, and sends it with
  the name. Another browser asking for that name is turned away.
- Click a cell and the pathfinder walks you there, cell to cell, gliding at
  a steady speed. A new click takes effect once you reach the next cell.
  Hold Shift to run, or press R to keep running.
- Everything happens on cells: you are always in a cell or on your way to
  the next one, and you use things from the cell beside them. Clicking a
  tree or a person walks you to the cell next to it.
- Your own character moves the instant you click, whatever the ping: the
  browser predicts it and the server confirms. Other players are drawn a
  tenth of a second behind the server and glide between the positions it
  sends. The camera stays on you.
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

1. **Get a database for the characters.** The server's own disk on a free
   host is wiped on every deploy and restart, so characters go in Postgres.
   Neon's free tier is enough: sign up at https://neon.tech, create a
   project, and copy its connection string (it looks like
   `postgresql://user:password@ep-….neon.tech/neondb?sslmode=require`). The
   server creates the one table it needs by itself.
2. **Host the server.** Render's free tier works in one click: in Render,
   New → Blueprint, pick this repository; `render.yaml` describes the
   service and asks for `DATABASE_URL`: paste the Neon string (it can also
   be set later under the service's Environment tab). Any host that runs
   `npm ci && npm run build:server` and `npm start` on Node 22 works too,
   and there is a `Dockerfile`. Free tiers sleep when idle; the first
   visitor waits a minute while it wakes.
3. **Tell the page where it is.** In the repository: Settings → Secrets and
   variables → Actions → Variables → New repository variable, name
   `SERVER_URL`, value the server's `wss://` address (Render shows it on the
   service page). The next push to `main`, or a manual run of the Pages
   workflow from the Actions tab, bakes it into the page.
4. **Share** https://3ecas.github.io/RPG/. Until the variable is set the page
   asks for a server address; `?server=wss://…` in the URL also works.

Server settings are environment variables: `PORT` (8080), `TICK_MS` (50),
`START_ZONE` (greenhollow, where new characters begin), `GRACE_MS` (30000,
how long a dropped connection can come back for), `SAVE_MS` (30000, how
often everyone online is written to the store), `DATABASE_URL` (Postgres;
without it characters are kept in the JSON file `DATA_FILE`, default
`data/characters.json`, which is git-ignored). `GET /health` on the server
port reports the tick, who is in which zone, and which store is in use.

### Characters

A character is one JSON document keyed by its lower-cased name: the zone,
the cell, the facing, walking or running, when it was made and last seen,
and a `state` object holding the skills (total xp each), the bag (28 slots),
the bank, the gear by slot, and the current hit points and mana, which the
next slices extend (flags such as "finished the tutorial"). It is written when you leave, when you change zone, every
`SAVE_MS` while you play, and when the server shuts down. On Postgres it is
the `characters` table, one `jsonb` row per name; on a machine without a
database it is the file. An item or skill the content no longer has is
dropped when the record is read.

The name is tied to the browser that made it: the page makes up a random
secret once, keeps it in `localStorage`, and sends it with the name; the
server stores a hash and refuses the name to any other secret. So clearing
the site's data, or opening the game in another browser or phone, means
another name (or deleting the character's row). Real accounts, which will
replace the secret, are slice 5 in DESIGN.md.

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
| `src/world/`    | Tile map model: grid, footprints, four- and eight-way paths, the motion model shared by server and client, the xp curve, the bag rules, the character's numbers | types |
| `src/net/`      | The wire protocol: message types and the strict parser      | types, world            |
| `src/server/`   | The game server: the room simulation (walking, gathering, items, the bank), the world of rooms, the character record, state and store, the WebSocket adapter | everything but ui, client |
| `src/client/`   | The browser's replica of the zone and the socket to the server | types, world, net    |
| `src/ui/`       | The page: the shapes renderer, the minimap, the window manager, the shell with its windows and menus, the join card, chat | client, net, world, types |
| `src/main.ts`   | The entry point                                             | everything              |
| `tests/`        | Vitest: protocol, room, gathering, gear and the bank, world, store (Postgres too when `TEST_DATABASE_URL` is set), server (real sockets), replica, motion, paths, skills and stats, bag, content |         |

ESLint fails the build if a layer imports something it should not.

## Next

Slice 3 of the build order in DESIGN.md: mining, smelting, smithing,
fishing, cooking and firemaking the same way woodcutting works, so every
gathering and production skill runs on the server.
