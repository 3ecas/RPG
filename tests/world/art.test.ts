import { describe, expect, it } from 'vitest';
import { ALL_ART, TILE_ROWS, validateArt } from '@/ui/world/art';
import { BIOME_PALETTES, humanColorsFor, MONSTER_ART, NODE_STYLE } from '@/ui/world/palettes';
import { CONTENT } from '@/content';

describe('pixel art', () => {
  it('every sprite has rectangular rows and a colour for every letter', () => {
    const errors = Object.entries(ALL_ART).flatMap(([name, art]) => validateArt(name, art));
    expect(errors).toEqual([]);
  });

  it('every ground tile is 16×16 and every biome colours every letter it uses', () => {
    const errors: string[] = [];
    for (const [name, rows] of Object.entries(TILE_ROWS)) {
      if (rows.length !== 16) errors.push(`${name}: ${rows.length} rows`);
      rows.forEach((row, y) => { if (row.length !== 16) errors.push(`${name}: row ${y} has ${row.length} pixels`); });
      for (const [biome, palette] of Object.entries(BIOME_PALETTES)) {
        for (const row of rows) for (const ch of row) if (!(ch in palette)) errors.push(`${biome}: no colour for '${ch}' used by ${name}`);
      }
    }
    expect(errors).toEqual([]);
  });

  it('every monster, node material and person resolves to art', () => {
    for (const id of Object.keys(CONTENT.monsters)) expect(MONSTER_ART[id as never], id).toBeDefined();
    for (const node of Object.values(CONTENT.nodes)) expect(NODE_STYLE(node.id as never, node.skill), node.id).toBeDefined();
    for (const id of Object.keys(CONTENT.npcs)) expect(humanColorsFor(id).tunic).toMatch(/^#/);
  });
});
