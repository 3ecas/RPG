/** Save format versioning. migrations[n] upgrades a version-n save to n+1. Each gets a test with a fixture. */
export const SAVE_VERSION = 3;

type RawSave = Record<string, unknown>;
type Migration = (raw: RawSave) => RawSave;

export const migrations: Record<number, Migration> = {
  // 0: saves written before versioning existed. Same shape as v1.
  0: (raw) => raw,
  // 1 → 2: shops, market and traders were added under world. Missing sections
  // get fresh defaults from the sanitizer, so nothing needs rewriting.
  1: (raw) => raw,
  // 2 → 3: levels became tiers and the skill list changed. Carry xp over to the
  // closest new skill; anything without a counterpart is dropped by the sanitizer.
  2: (raw) => {
    const player = raw.player as Record<string, unknown> | undefined;
    const skills = player?.skills as Record<string, unknown> | undefined;
    if (skills) {
      const renames: Record<string, string> = {
        attack: 'swords', strength: 'axes', defence: 'armor', hitpoints: 'vitality',
        smithing: 'blacksmithing', crafting: 'leatherworking',
      };
      for (const [from, to] of Object.entries(renames)) {
        if (from in skills && !(to in skills)) skills[to] = skills[from];
        delete skills[from];
      }
      delete player?.combatStyle;
    }
    const itemRenames: Record<string, string> = { wooden_shield: 'oak_shield' };
    const inventory = raw.inventory as { itemId?: string }[] | undefined;
    for (const stack of inventory ?? []) if (stack.itemId && itemRenames[stack.itemId]) stack.itemId = itemRenames[stack.itemId];
    const equipment = player?.equipment as Record<string, string | null> | undefined;
    for (const [slot, itemId] of Object.entries(equipment ?? {})) if (itemId && itemRenames[itemId]) equipment![slot] = itemRenames[itemId]!;
    return raw;
  },
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
