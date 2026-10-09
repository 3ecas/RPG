/**
 * Starts the game server from the environment:
 *   PORT (8080), TICK_MS (50), START_ZONE (greenhollow), GRACE_MS (30000),
 *   SAVE_MS (30000), and where characters are kept: DATABASE_URL for
 *   Postgres, else DATA_FILE (data/characters.json).
 * Run in development with `npm run server`; in production build with
 * `npm run build:server` and run `node dist-server/main.js`.
 */
import type { ZoneId } from '@/types/ids';
import { startServer } from './server';
import { openStore } from './store';

const port = Number(process.env.PORT ?? 8080);
const tickMs = Number(process.env.TICK_MS ?? 50);
const startZone = (process.env.START_ZONE ?? process.env.ZONE ?? 'greenhollow') as ZoneId;
const graceMs = Number(process.env.GRACE_MS ?? 30_000);
const saveMs = Number(process.env.SAVE_MS ?? 30_000);
const log = (line: string): void => console.log(`${new Date().toISOString()} ${line}`);

const store = openStore({ databaseUrl: process.env.DATABASE_URL, dataFile: process.env.DATA_FILE });
const server = await startServer({ port, tickMs, startZone, graceMs, saveMs, store, log });

let stopping = false;
const stop = (signal: string): void => {
  if (stopping) return;
  stopping = true;
  log(`${signal}: saving everyone and shutting down`);
  server.close().then(
    () => process.exit(0),
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
};
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
