/**
 * Where characters live between sessions: one JSON document per name. Three
 * stores share one interface and the server talks to the interface only:
 * memory for tests, a JSON file for a machine without a database, and
 * Postgres (DATABASE_URL) for production, where the server's disk does not
 * survive a restart.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import postgres from 'postgres';
import { type CharacterRecord, keyOf, parseRecord } from './character';

export interface CharacterStore {
  /** What this store is, for the boot log and the health check. */
  readonly kind: string;
  /** Makes sure the store can be used (the file reads, the table exists). The server calls it before it listens, so a bad setup fails at boot. */
  open(): Promise<void>;
  load(key: string): Promise<CharacterRecord | null>;
  save(record: CharacterRecord): Promise<void>;
  /** Several at once: one write for a file, one transaction for a database. */
  saveMany(records: CharacterRecord[]): Promise<void>;
  close(): Promise<void>;
}

export interface StoreConfig {
  /** A Postgres connection string; when set, the database is the store. */
  databaseUrl?: string | undefined;
  /** The JSON file used when there is no database. */
  dataFile?: string | undefined;
}

export const DEFAULT_DATA_FILE = 'data/characters.json';

/** The store the environment asks for: Postgres when there is a DATABASE_URL, else the JSON file. */
export function openStore(config: StoreConfig): CharacterStore {
  if (config.databaseUrl) return new PostgresStore(config.databaseUrl);
  return new FileStore(config.dataFile || DEFAULT_DATA_FILE);
}

export class MemoryStore implements CharacterStore {
  readonly kind = 'memory';
  private readonly records = new Map<string, CharacterRecord>();

  get size(): number {
    return this.records.size;
  }

  async open(): Promise<void> {}

  async load(key: string): Promise<CharacterRecord | null> {
    const record = this.records.get(key);
    return record ? structuredClone(record) : null;
  }

  async save(record: CharacterRecord): Promise<void> {
    this.records.set(keyOf(record.name), structuredClone(record));
  }

  async saveMany(records: CharacterRecord[]): Promise<void> {
    for (const record of records) await this.save(record);
  }

  async close(): Promise<void> {}
}

interface CharacterFile {
  version: 1;
  characters: CharacterRecord[];
}

/**
 * Every character in one JSON file, read once and rewritten whole on each
 * save (written beside the file and renamed into place, so a crash mid-write
 * leaves the old file intact). A missing file is an empty world; a file that
 * cannot be read refuses to start rather than being overwritten.
 */
export class FileStore implements CharacterStore {
  readonly kind: string;
  /** The one read of the file, shared by every caller, so two saves racing at startup see the same map. */
  private records: Promise<Map<string, CharacterRecord>> | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(readonly path: string) {
    this.kind = `file ${path}`;
  }

  async open(): Promise<void> {
    await this.ready();
  }

  async load(key: string): Promise<CharacterRecord | null> {
    const record = (await this.ready()).get(key);
    return record ? structuredClone(record) : null;
  }

  save(record: CharacterRecord): Promise<void> {
    return this.saveMany([record]);
  }

  async saveMany(records: CharacterRecord[]): Promise<void> {
    const all = await this.ready();
    for (const record of records) all.set(keyOf(record.name), structuredClone(record));
    // Writes queue behind one another; each writes everything known at its turn.
    const run = this.writing.then(() => this.flush(all));
    this.writing = run.catch(() => {});
    return run;
  }

  async close(): Promise<void> {
    await this.writing;
  }

  private ready(): Promise<Map<string, CharacterRecord>> {
    if (!this.records) {
      this.records = this.read().catch((error: unknown) => {
        this.records = null;
        throw error;
      });
    }
    return this.records;
  }

  private async read(): Promise<Map<string, CharacterRecord>> {
    const records = new Map<string, CharacterRecord>();
    let text: string | null = null;
    try {
      text = await readFile(this.path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (text !== null) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error(`${this.path} is not valid JSON. Fix it or move it away before starting the server.`);
      }
      if (typeof parsed !== 'object' || parsed === null || (parsed as CharacterFile).version !== 1 || !Array.isArray((parsed as CharacterFile).characters)) {
        throw new Error(`${this.path} is not a character file (expected {"version": 1, "characters": [...]}).`);
      }
      (parsed as CharacterFile).characters.forEach((raw, i) => {
        const record = parseRecord(raw);
        if (!record) throw new Error(`${this.path}: character ${i} is malformed.`);
        records.set(keyOf(record.name), record);
      });
    }
    return records;
  }

  private async flush(all: Map<string, CharacterRecord>): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    const file: CharacterFile = { version: 1, characters: [...all.values()] };
    const tmp = `${this.path}.tmp`;
    await writeFile(tmp, JSON.stringify(file, null, 2) + '\n', 'utf8');
    await rename(tmp, this.path);
  }
}

/**
 * One row per character in a `characters` table: the key, the document as
 * jsonb and when it was last written. Nothing is connected until open() or
 * the first use, which creates the table. Works with any Postgres, Neon's
 * free tier included; prepared statements are off so pooled connection
 * strings work too.
 */
export class PostgresStore implements CharacterStore {
  readonly kind = 'postgres';
  private readonly sql: postgres.Sql;
  private ready: Promise<void> | null = null;

  constructor(url: string) {
    this.sql = postgres(url, { max: 4, idle_timeout: 60, connect_timeout: 15, prepare: false, onnotice: () => {} });
  }

  open(): Promise<void> {
    if (!this.ready) {
      this.ready = this.sql`
        create table if not exists characters (
          key text primary key,
          doc jsonb not null,
          updated_at timestamptz not null default now()
        )`.then(
        () => undefined,
        (error: unknown) => {
          this.ready = null; // so the next use tries again
          throw error;
        },
      );
    }
    return this.ready;
  }

  async load(key: string): Promise<CharacterRecord | null> {
    await this.open();
    const rows = await this.sql<{ doc: unknown }[]>`select doc from characters where key = ${key}`;
    const row = rows[0];
    if (!row) return null;
    const record = parseRecord(row.doc);
    if (!record) throw new Error(`The stored character '${key}' is malformed.`);
    return record;
  }

  async save(record: CharacterRecord): Promise<void> {
    await this.open();
    await upsert(this.sql, record);
  }

  async saveMany(records: CharacterRecord[]): Promise<void> {
    if (records.length === 0) return;
    await this.open();
    await this.sql.begin(async (sql) => {
      for (const record of records) await upsert(sql, record);
    });
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}

function upsert(sql: postgres.Sql | postgres.TransactionSql, record: CharacterRecord): Promise<unknown> {
  // sql.json() sends the document as a JSON object; a JSON string passed through a cast would be stored as a string.
  return sql`
    insert into characters (key, doc, updated_at)
    values (${keyOf(record.name)}, ${sql.json(record as unknown as postgres.JSONValue)}, now())
    on conflict (key) do update set doc = excluded.doc, updated_at = now()`;
}
