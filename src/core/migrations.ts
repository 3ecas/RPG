/** Save format versioning. migrations[n] upgrades a version-n save to n+1. Each gets a test with a fixture. */
export const SAVE_VERSION = 1;

type RawSave = Record<string, unknown>;
type Migration = (raw: RawSave) => RawSave;

export const migrations: Record<number, Migration> = {
  // 0: saves written before versioning existed. Same shape as v1.
  0: (raw) => raw,
};

export function migrate(raw: RawSave): RawSave {
  let version = typeof raw.version === 'number' ? raw.version : 0;
  if (version > SAVE_VERSION) {
    throw new Error(`This save is from a newer version of the game (v${version}, this build is v${SAVE_VERSION}).`);
  }
  let out = raw;
  while (version < SAVE_VERSION) {
    const step = migrations[version];
    if (!step) throw new Error(`No migration path from save version ${version}.`);
    out = step(out);
    version += 1;
    out.version = version;
  }
  return out;
}
