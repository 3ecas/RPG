import { describe, expect, it } from 'vitest';
import { CONTENT } from '@/content';
import { Registry } from '@/core/registry';
import type { ContentTables, ZoneMapDef } from '@/types/content';
import type { ZoneId } from '@/types/ids';
import { cellsAround, isAdjacent, isWalkable, objectAt, parseMap, terrainAt } from '@/world/grid';
import { findPath, findPathTo, reachable } from '@/world/path';

const tiny: ZoneMapDef = {
  biome: 'meadow',
  rows: [
    '^^^^^^^^',
    '^S..A..^',
    '^..HH..^',
    '^..HH..1',
    '^.....~^',
    '^^^^^^^^',
  ],
  legend: {
    S: { kind: 'spawn' },
    A: { kind: 'node', id: 'oak_tree' },
    H: { kind: 'shop', id: 'hollow_goods' },
    1: { kind: 'exit', zone: 'copper_hills' },
  },
};

describe('grid', () => {
  it('parses terrain, objects and footprints', () => {
    const grid = parseMap(tiny);
    expect(grid.width).toBe(8);
    expect(grid.height).toBe(6);
    expect(grid.spawn).toEqual({ x: 1, y: 1 });
    expect(terrainAt(grid, 0, 0)).toBe('trees');
    expect(terrainAt(grid, 6, 4)).toBe('water');
    expect(terrainAt(grid, 7, 3)).toBe('path'); // the exit is road
    const shop = grid.objects.find((o) => o.def.kind === 'shop')!;
    expect([shop.x, shop.y, shop.w, shop.h]).toEqual([3, 2, 2, 2]);
    expect(grid.objects.filter((o) => o.def.kind === 'shop')).toHaveLength(1);
    expect(objectAt(grid, 4, 3)).toBe(shop);
    expect(isWalkable(grid, 4, 3)).toBe(false);
    expect(isWalkable(grid, 4, 1)).toBe(false); // the tree
    expect(isWalkable(grid, 7, 3)).toBe(true); // exits can be stepped on
    expect(isWalkable(grid, 2, 2)).toBe(true);
  });

  it('knows which cells touch a footprint', () => {
    const grid = parseMap(tiny);
    const shop = grid.objects.find((o) => o.def.kind === 'shop')!;
    expect(cellsAround(shop)).toHaveLength(8);
    expect(isAdjacent(shop, { x: 2, y: 2 })).toBe(true);
    expect(isAdjacent(shop, { x: 3, y: 4 })).toBe(true);
    expect(isAdjacent(shop, { x: 2, y: 4 })).toBe(false); // diagonal
  });

  it('finds shortest paths around obstacles and to the side of an object', () => {
    const grid = parseMap(tiny);
    const path = findPath(grid, { x: 1, y: 1 }, { x: 6, y: 1 })!;
    expect(path.at(-1)).toEqual({ x: 6, y: 1 });
    expect(path).toHaveLength(11); // around the tree and the shop, along the bottom row
    const shop = grid.objects.find((o) => o.def.kind === 'shop')!;
    const toShop = findPathTo(grid, { x: 1, y: 1 }, (c) => isAdjacent(shop, c))!;
    expect(toShop).toHaveLength(2);
    expect(findPath(grid, { x: 1, y: 1 }, { x: 6, y: 4 })).toBeNull(); // water
    expect(findPath(grid, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([]);
  });

  it('routes around creatures that block a cell', () => {
    const grid = parseMap(tiny);
    const path = findPath(grid, { x: 1, y: 1 }, { x: 1, y: 4 }, { blocked: (x, y) => x === 1 && y === 2 })!;
    expect(path[0]).toEqual({ x: 2, y: 1 });
    expect(path.at(-1)).toEqual({ x: 1, y: 4 });
  });
});

describe('zone maps', () => {
  const registry = new Registry(CONTENT);

  it('every placed thing can be reached on foot from the spawn', () => {
    const unreachable: string[] = [];
    for (const zoneId of registry.zoneIds) {
      const grid = parseMap(registry.map(zoneId));
      const seen = reachable(grid, grid.spawn);
      for (const obj of grid.objects) {
        const touchable = obj.def.kind === 'exit' || obj.def.kind === 'spawn' || obj.def.kind === 'monster'
          ? seen.has(obj.y * grid.width + obj.x)
          : cellsAround(obj).some((c) => seen.has(c.y * grid.width + c.x));
        if (!touchable) unreachable.push(`${zoneId}: ${obj.def.kind} '${obj.key}' at ${obj.x},${obj.y}`);
      }
    }
    expect(unreachable).toEqual([]);
  });

  it('exits form a connected world with a route between any two zones', () => {
    for (const from of registry.zoneIds) {
      for (const to of registry.zoneIds) {
        const route = registry.route(from, to);
        expect(route, `${from} -> ${to}`).not.toBeNull();
        expect(route![0]).toBe(from);
        expect(route!.at(-1)).toBe(to);
      }
    }
    expect(registry.route('greenhollow', 'dragons_reach')).toEqual(['greenhollow', 'whispering_woods', 'grey_peaks', 'dragons_reach']);
  });

  it('validation catches a map that forgets something the zone lists', () => {
    const broken: ContentTables = {
      ...CONTENT,
      maps: { ...CONTENT.maps, greenhollow: { ...CONTENT.maps.greenhollow, legend: { ...CONTENT.maps.greenhollow.legend, D: { kind: 'node', id: 'oak_tree' } } } },
    };
    const errors = new Registry(broken).validate();
    expect(errors).toContain("map greenhollow: node 'nettle_patch' is not on the map");
  });

  it('validation catches an exit without a way back and a broken building block', () => {
    const rows = [...CONTENT.maps.kingsport.rows];
    rows[8] = rows[8]!.replace('XX', 'X=');
    const broken: ContentTables = {
      ...CONTENT,
      maps: {
        ...CONTENT.maps,
        kingsport: { ...CONTENT.maps.kingsport, rows, legend: { ...CONTENT.maps.kingsport.legend, 9: { kind: 'exit', zone: 'dragons_reach' as ZoneId } } },
      },
    };
    rows[1] = rows[1]!.replace('#..', '#9.');
    const errors = new Registry(broken).validate();
    expect(errors).toContain("map kingsport: exit to 'dragons_reach' has no exit back");
    expect(errors).toContain("map kingsport: 'X' must fill 2×2 blocks");
  });
});
