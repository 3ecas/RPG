/**
 * Starts one zone server from the environment:
 *   PORT (8080), TICK_MS (300), ZONE (greenhollow), GRACE_MS (30000).
 * Run in development with `npm run server`; in production build with
 * `npm run build:server` and run `node dist-server/main.js`.
 */
import type { ZoneId } from '@/types/ids';
import { startServer } from './server';

const port = Number(process.env.PORT ?? 8080);
const tickMs = Number(process.env.TICK_MS ?? 300);
const zone = (process.env.ZONE ?? 'greenhollow') as ZoneId;
const graceMs = Number(process.env.GRACE_MS ?? 30_000);

const server = await startServer({ port, tickMs, zone, graceMs, log: (line) => console.log(`${new Date().toISOString()} ${line}`) });

const stop = (): void => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
