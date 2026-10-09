import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type CharacterRecord, hashSecret, keyOf, newCharacter, parseRecord } from '@/server/character';
import { type CharacterStore, FileStore, MemoryStore, openStore, PostgresStore } from '@/server/store';

const ada: CharacterRecord = { name: 'Ada', secretHash: hashSecret('s3cret-of-ada-0001'), createdAt: 1000, dir: 2, running: true, state: { tutorial: 'done' }, zone: 'copper_hills', x: 10, y: 12, lastSeenAt: 2000 };
const bob: CharacterRecord = { name: 'Bob', secretHash: 'h', createdAt: 1, dir: 0, running: false, state: {}, zone: 'greenhollow', x: 20, y: 13, lastSeenAt: 3 };

/** What every store must do, whatever it is backed by. */
function behavesLikeAStore(open: () => Promise<CharacterStore>, reopen?: () => Promise<CharacterStore>) {
  it('has nothing for an unknown name', async () => {
    const store = await open();
    expect(await store.load('nobody')).toBeNull();
    await store.close();
  });

  it('keeps a record by its key and hands back a copy, newest write winning', async () => {
    const store = await open();
    await store.save(ada);
    const loaded = await store.load(keyOf('ADA'));
    expect(loaded).toEqual(ada);
    expect(loaded).not.toBe(ada);
    loaded!.state.tutorial = 'changed';
    expect((await store.load('ada'))!.state.tutorial).toBe('done');
    await store.save({ ...ada, x: 11, lastSeenAt: 2500 });
    expect(await store.load('ada')).toMatchObject({ x: 11, lastSeenAt: 2500 });
    await store.close();
  });

  it('saves several at once', async () => {
    const store = await open();
    await store.saveMany([ada, bob]);
    await store.saveMany([]);
    expect((await store.load('ada'))?.name).toBe('Ada');
    expect((await store.load('bob'))?.name).toBe('Bob');
    await store.close();
  });

  if (reopen) {
    it('survives being closed and opened again', async () => {
      const store = await open();
      await store.saveMany([ada, bob]);
      await store.close();
      const again = await reopen();
      expect(await again.load('ada')).toEqual(ada);
      expect(await again.load('bob')).toEqual(bob);
      await again.close();
    });
  }
}

describe('store: memory', () => {
  behavesLikeAStore(async () => new MemoryStore());

  it('counts what it holds', async () => {
    const store = new MemoryStore();
    await store.saveMany([ada, bob]);
    expect(store.size).toBe(2);
    expect(store.kind).toBe('memory');
  });
});

describe('store: file', () => {
  let dir = '';
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'rpg-store-'));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));
  let path = '';
  let n = 0;
  afterEach(() => {
    path = '';
  });
  const open = async () => {
    if (!path) path = join(dir, `nested/${n++}/characters.json`);
    return new FileStore(path);
  };
  behavesLikeAStore(open, open);

  it('writes one readable JSON file, whole, with nothing half-written left beside it', async () => {
    const store = new FileStore(join(dir, 'whole.json'));
    await Promise.all([store.save(ada), store.save(bob), store.save({ ...ada, x: 12 })]);
    await store.close();
    const text = await readFile(join(dir, 'whole.json'), 'utf8');
    const parsed = JSON.parse(text) as { version: number; characters: CharacterRecord[] };
    expect(parsed.version).toBe(1);
    expect(parsed.characters.map((c) => c.name).sort()).toEqual(['Ada', 'Bob']);
    expect(parsed.characters.find((c) => c.name === 'Ada')?.x).toBe(12);
    expect((await readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    expect(store.kind).toBe(`file ${join(dir, 'whole.json')}`);
  });

  it('refuses to start on a file it cannot trust rather than overwrite it', async () => {
    const broken = join(dir, 'broken.json');
    await writeFile(broken, '{"version": 1, "characters": [');
    await expect(new FileStore(broken).load('ada')).rejects.toThrow(/not valid JSON/);
    await writeFile(broken, '{"version": 2, "characters": []}');
    await expect(new FileStore(broken).load('ada')).rejects.toThrow(/not a character file/);
    await writeFile(broken, '{"version": 1, "characters": [{"name": "Ada"}]}');
    await expect(new FileStore(broken).save(bob)).rejects.toThrow(/character 0 is malformed/);
    expect(await readFile(broken, 'utf8')).toBe('{"version": 1, "characters": [{"name": "Ada"}]}');
  });
});

describe('store: picking one from the environment', () => {
  it('uses Postgres when there is a DATABASE_URL, else the JSON file', async () => {
    const file = openStore({ dataFile: 'somewhere/chars.json' });
    expect(file).toBeInstanceOf(FileStore);
    expect(file.kind).toBe('file somewhere/chars.json');
    expect(openStore({}).kind).toBe('file data/characters.json');
    const pg = openStore({ databaseUrl: 'postgres://user:pw@127.0.0.1:1/db', dataFile: 'ignored.json' });
    expect(pg).toBeInstanceOf(PostgresStore);
    expect(pg.kind).toBe('postgres');
    await expect(pg.open()).rejects.toThrow(/ECONNREFUSED/); // nothing is connected until then
    await pg.close();
  });

  it('opens a file store by reading the file, so a broken one is found before the server listens', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rpg-open-'));
    try {
      await expect(new FileStore(join(dir, 'missing/characters.json')).open()).resolves.toBeUndefined();
      await writeFile(join(dir, 'bad.json'), 'nope');
      await expect(new FileStore(join(dir, 'bad.json')).open()).rejects.toThrow(/not valid JSON/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('store: records', () => {
  it('parses a stored document only when it has the whole shape', () => {
    expect(parseRecord(ada)).toEqual(ada);
    expect(parseRecord(JSON.parse(JSON.stringify(bob)))).toEqual(bob);
    expect(parseRecord(null)).toBeNull();
    expect(parseRecord({ ...ada, dir: 4 })).toBeNull();
    expect(parseRecord({ ...ada, x: 1.5 })).toBeNull();
    expect(parseRecord({ ...ada, running: 'yes' })).toBeNull();
    expect(parseRecord({ ...ada, state: [] })).toBeNull();
    expect(parseRecord({ ...ada, name: '' })).toBeNull();
    const noSecret: Record<string, unknown> = { ...ada };
    delete noSecret.secretHash;
    expect(parseRecord(noSecret)).toBeNull();
  });

  it('starts a new character on the spawn with nothing in its state, and hashes secrets the same way every time', () => {
    const fresh = newCharacter('Cyd', hashSecret('abc'), 'greenhollow', { x: 3, y: 4 }, 42);
    expect(fresh).toEqual({ name: 'Cyd', secretHash: hashSecret('abc'), createdAt: 42, dir: 0, running: false, state: {}, zone: 'greenhollow', x: 3, y: 4, lastSeenAt: 42 });
    expect(hashSecret('abc')).toBe(hashSecret('abc'));
    expect(hashSecret('abc')).not.toBe(hashSecret('abd'));
    expect(hashSecret('abc')).toMatch(/^[0-9a-f]{64}$/);
    expect(keyOf('Ada Lovelace')).toBe('ada lovelace');
  });
});

// A real database when one is offered: TEST_DATABASE_URL=postgres://... npm test
const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)('store: postgres', () => {
  const table = `characters`;
  const open = async () => new PostgresStore(url!);
  beforeAll(async () => {
    const store = new PostgresStore(url!);
    await store.load('warm up'); // creates the table
    await store.close();
  });
  afterEach(async () => {
    // Each test starts with an empty table.
    const { default: postgres } = await import('postgres');
    const sql = postgres(url!, { max: 1 });
    await sql.unsafe(`delete from ${table}`);
    await sql.end();
  });
  behavesLikeAStore(open, open);

  it('stores one jsonb row per character, keyed by the lower-cased name', async () => {
    const store = await open();
    await store.save(ada);
    await store.close();
    const { default: postgres } = await import('postgres');
    const sql = postgres(url!, { max: 1 });
    const rows = await sql<{ key: string; doc: CharacterRecord; updated_at: Date }[]>`select key, doc, updated_at from characters`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.key).toBe('ada');
    expect(rows[0]!.doc).toEqual(ada);
    expect(rows[0]!.updated_at).toBeInstanceOf(Date);
    await sql.end();
  });
});
