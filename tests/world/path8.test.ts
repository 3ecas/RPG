import { describe, expect, it } from 'vitest';
import type { ZoneMapDef } from '@/types/content';
import { dirOf, parseMap } from '@/world/grid';
import { canStep8, findPath, findPath8, nearestReachable } from '@/world/path';

const map: ZoneMapDef = {
  biome: 'meadow',
  rows: [
    '^^^^^^^^^^',
    '^S.......^',
    '^..A.....^',
    '^...HH...^',
    '^...HH..~^',
    '^.......~^',
    '^^^^^^^^^^',
  ],
  legend: {
    S: { kind: 'spawn' },
    A: { kind: 'node', id: 'oak_tree' },
    H: { kind: 'shop', id: 'hollow_goods' },
  },
};

describe('eight-way paths', () => {
  const grid = parseMap(map);

  it('walks diagonally and counts a diagonal as one step', () => {
    // Open ground: two diagonal steps where four-way needs four.
    expect(findPath8(grid, { x: 6, y: 1 }, { x: 8, y: 3 })).toEqual([{ x: 7, y: 2 }, { x: 8, y: 3 }]);
    expect(findPath(grid, { x: 6, y: 1 }, { x: 8, y: 3 })!.length).toBe(4);
    // Across the map the tree and the shop block the straight diagonal, so it takes eight steps instead of six, still beating four-way.
    const path = findPath8(grid, { x: 1, y: 1 }, { x: 7, y: 5 })!;
    expect(path.at(-1)).toEqual({ x: 7, y: 5 });
    expect(path.length).toBe(8);
    expect(findPath(grid, { x: 1, y: 1 }, { x: 7, y: 5 })!.length).toBe(10);
  });

  it('never cuts a corner past something solid', () => {
    // The tree stands at (3,2). Diagonals that would brush past it are refused even when the destination is open.
    expect(canStep8(grid, { x: 2, y: 2 }, 1, 1)).toBe(false); // to (3,3): open, but (3,2) is the tree
    expect(canStep8(grid, { x: 2, y: 2 }, 1, -1)).toBe(false); // to (3,1): open, but (3,2) is the tree
    expect(canStep8(grid, { x: 2, y: 3 }, 1, -1)).toBe(false); // to (3,2): the tree itself
    expect(canStep8(grid, { x: 1, y: 1 }, 1, 1)).toBe(true); // to (2,2): both sides open
    expect(canStep8(grid, { x: 2, y: 2 }, 1, 0)).toBe(false); // straight into the tree
    expect(canStep8(grid, { x: 2, y: 2 }, 0, 1)).toBe(true); // straight down
  });

  it('refuses the diagonal when either side is blocked, allows it when both are open', () => {
    // Shop fills (4..5, 3..4). From (3,5) going (+1,-1) to (4,4) is the shop: blocked outright.
    expect(canStep8(grid, { x: 3, y: 5 }, 1, -1)).toBe(false);
    // From (3,2) going (+1,+1) lands on (4,3), the shop: blocked.
    expect(canStep8(grid, { x: 3, y: 2 }, 1, 1)).toBe(false);
    // From (6,2) going (-1,+1) lands on (5,3), the shop: blocked.
    expect(canStep8(grid, { x: 6, y: 2 }, -1, 1)).toBe(false);
    // Open ground: fine.
    expect(canStep8(grid, { x: 1, y: 1 }, 1, 1)).toBe(true);
    // Corner of the shop: from (3,2) to (4,2)... straight is fine; from (6,5) going (-1,-1) to (5,4) is the shop.
    expect(canStep8(grid, { x: 6, y: 5 }, -1, -1)).toBe(false);
    // Squeeze between the shop (5,4) and the water (8,4)? From (7,5) going (+1,-1) to (8,4): water, blocked.
    expect(canStep8(grid, { x: 7, y: 5 }, 1, -1)).toBe(false);
    // From (6,3) going (+1,+1) to (7,4): sides (7,3) and (6,4) both open.
    expect(canStep8(grid, { x: 6, y: 3 }, 1, 1)).toBe(true);
    // From (3,4) going (+1,+1) to (4,5): sides (4,4) is the shop -> blocked even though (3,5) is open.
    expect(canStep8(grid, { x: 3, y: 4 }, 1, 1)).toBe(false);
  });

  it('routes around the shop without touching its corners diagonally', () => {
    const path = findPath8(grid, { x: 3, y: 2 }, { x: 6, y: 5 })!;
    for (let i = 0; i < path.length; i++) {
      const prev = i === 0 ? { x: 3, y: 2 } : path[i - 1]!;
      const next = path[i]!;
      expect(canStep8(grid, prev, next.x - prev.x, next.y - prev.y)).toBe(true);
    }
    expect(path.at(-1)).toEqual({ x: 6, y: 5 });
  });

  it('walks up to an obstacle when the click lands on it', () => {
    const from = { x: 1, y: 1 };
    expect([{ x: 7, y: 4 }, { x: 8, y: 3 }]).toContainEqual(nearestReachable(grid, from, { x: 8, y: 4 })); // water: a shore cell beside it
    expect(nearestReachable(grid, from, { x: 4, y: 3 })).toEqual({ x: 4, y: 2 }); // the shop: the open cell squarely beside the clicked one
    expect(nearestReachable(grid, from, { x: 1, y: 1 })).toEqual(from); // your own cell
    expect(nearestReachable(grid, from, { x: 2, y: 5 })).toEqual({ x: 2, y: 5 }); // open ground: itself
    expect(nearestReachable(grid, from, { x: 0, y: 0 })).toEqual({ x: 1, y: 1 }); // the forest corner: the nearest open cell
    expect(nearestReachable(grid, from, { x: 20, y: 20 })).toBeNull(); // far off the map
  });

  it('faces the way it steps, horizontal winning on diagonals', () => {
    expect(dirOf(0, 1)).toBe(0);
    expect(dirOf(-1, 0)).toBe(1);
    expect(dirOf(1, 0)).toBe(2);
    expect(dirOf(0, -1)).toBe(3);
    expect(dirOf(1, -1)).toBe(2);
    expect(dirOf(-1, 1)).toBe(1);
  });
});

describe('eight-way paths: shape', () => {
  const open: ZoneMapDef = {
    biome: 'meadow',
    rows: ['^^^^^^^^^^', '^S.......^', '^........^', '^........^', '^........^', '^^^^^^^^^^'],
    legend: { S: { kind: 'spawn' } },
  };
  const grid = parseMap(open);

  it('walks straight to a target that is straight ahead', () => {
    expect(findPath8(grid, { x: 1, y: 1 }, { x: 5, y: 1 })).toEqual([{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 }]);
    expect(findPath8(grid, { x: 1, y: 1 }, { x: 1, y: 4 })).toEqual([{ x: 1, y: 2 }, { x: 1, y: 3 }, { x: 1, y: 4 }]);
  });

  it('takes exactly as many diagonals as it needs, and takes them first', () => {
    const path = findPath8(grid, { x: 1, y: 1 }, { x: 6, y: 3 })!;
    expect(path.length).toBe(5);
    const kinds = path.map((c, i) => {
      const prev = i === 0 ? { x: 1, y: 1 } : path[i - 1]!;
      return c.x !== prev.x && c.y !== prev.y ? 'diag' : 'straight';
    });
    expect(kinds).toEqual(['diag', 'diag', 'straight', 'straight', 'straight']);
  });
});
