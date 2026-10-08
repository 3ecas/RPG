import { describe, expect, it } from 'vitest';
import type { ZoneMapDef } from '@/types/content';
import { parseMap } from '@/world/grid';
import { canStand, cellOf, type Mover, planWalk, RADIUS, RUN_SPEED, step, STEP_MS, WALK_SPEED } from '@/world/motion';

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
const grid = parseMap(map);
/** Twelve open cells each way, for speed tests that must not touch anything. */
const field = parseMap({ biome: 'meadow', rows: ['^^^^^^^^^^^^^^', ...Array.from({ length: 12 }, () => '^............^'), '^^^^^^^^^^^^^^'], legend: {} });

function mover(x: number, y: number, running = false): Mover {
  return { x, y, dir: 0, running, path: [] };
}

const ONE_SECOND = 1000 / STEP_MS;

describe('motion: direct control', () => {
  it('walks at walking speed and runs at running speed, straight and diagonally', () => {
    const walker = mover(1.5, 1.5);
    for (let i = 0; i < ONE_SECOND; i++) expect(step(grid, walker, { dx: 1, dy: 0 })).toBe(true);
    expect(walker.x).toBeCloseTo(1.5 + WALK_SPEED, 6);
    expect(walker.dir).toBe(2);
    const runner = mover(1.5, 1.5, true);
    for (let i = 0; i < ONE_SECOND; i++) step(grid, runner, { dx: 1, dy: 0 });
    expect(runner.x).toBeCloseTo(1.5 + RUN_SPEED, 6);
    const diagonal = mover(1.5, 1.5);
    for (let i = 0; i < ONE_SECOND; i++) step(field, diagonal, { dx: 1, dy: 1 });
    expect(Math.hypot(diagonal.x - 1.5, diagonal.y - 1.5)).toBeCloseTo(WALK_SPEED, 6);
    expect(diagonal.dir).toBe(2); // diagonals face their horizontal side
  });

  it('stops at walls and slides along them', () => {
    const m = mover(7.5, 1.5);
    for (let i = 0; i < ONE_SECOND; i++) step(grid, m, { dx: 1, dy: 0 });
    expect(m.x).toBeLessThanOrEqual(9 - RADIUS); // the forest at x = 9
    expect(m.x).toBeGreaterThan(9 - RADIUS - 0.01);
    expect(step(grid, m, { dx: 1, dy: 0 })).toBe(false); // pressed against it, nothing moves
    expect(canStand(grid, m.x, m.y)).toBe(true);
    // Pushing diagonally into the wall still moves along it.
    const before = m.y;
    expect(step(grid, m, { dx: 1, dy: 1 })).toBe(true);
    expect(m.y).toBeGreaterThan(before);
    expect(m.x).toBeLessThanOrEqual(9 - RADIUS);
  });

  it('cannot squeeze into the tree or the shop', () => {
    const m = mover(2.5, 2.5);
    for (let i = 0; i < ONE_SECOND; i++) step(grid, m, { dx: 1, dy: 0 });
    expect(m.x).toBeLessThanOrEqual(3 - RADIUS); // the tree at (3, 2)
    const n = mover(4.5, 5.5);
    for (let i = 0; i < ONE_SECOND; i++) step(grid, n, { dx: 0, dy: -1 });
    expect(n.y).toBeGreaterThanOrEqual(5 + RADIUS - 1e-3); // the shop's bottom edge is y = 5
    expect(n.y).toBeLessThan(5.5);
  });
});

describe('motion: walking a path', () => {
  it('follows the path to the clicked cell at walking speed and arrives at its centre', () => {
    const m = mover(1.5, 1.5);
    expect(planWalk(grid, m, { x: 6, y: 1 })).toBe(true);
    expect(m.path).toHaveLength(5);
    let steps = 0;
    while (m.path.length > 0 && steps < 200) {
      step(grid, m, { dx: 0, dy: 0 });
      steps++;
    }
    expect([m.x, m.y]).toEqual([6.5, 1.5]);
    expect(steps).toBe(Math.ceil((5 / WALK_SPEED) * ONE_SECOND));
    expect(step(grid, m, { dx: 0, dy: 0 })).toBe(false); // arrived: nothing more to do
  });

  it('keeps its speed around corners instead of pausing at each cell', () => {
    const m = mover(1.5, 1.5);
    planWalk(grid, m, { x: 1, y: 5 });
    const positions: number[] = [];
    for (let i = 0; i < 10; i++) {
      step(grid, m, { dx: 0, dy: 0 });
      positions.push(m.y);
    }
    for (let i = 1; i < positions.length; i++) expect(positions[i]! - positions[i - 1]!).toBeCloseTo(WALK_SPEED / ONE_SECOND, 6);
  });

  it('passes through the centre of its cell before a diagonal first step from off-centre', () => {
    const offCentre = mover(1.8, 1.5);
    planWalk(grid, offCentre, { x: 3, y: 3 });
    expect(offCentre.path[0]).toEqual({ x: 1, y: 1 });
    const centred = mover(1.5, 1.5);
    planWalk(grid, centred, { x: 3, y: 3 });
    expect(centred.path[0]).toEqual({ x: 2, y: 2 });
    const straight = mover(1.8, 1.5);
    planWalk(grid, straight, { x: 5, y: 1 });
    expect(straight.path[0]).toEqual({ x: 2, y: 1 }); // a straight first step needs no detour
  });

  it('walks up to water and refuses the unreachable', () => {
    const m = mover(1.5, 1.5);
    expect(planWalk(grid, m, { x: 8, y: 4 })).toBe(true);
    const last = m.path[m.path.length - 1]!;
    expect([[7, 4], [8, 3]]).toContainEqual([last.x, last.y]);
    expect(planWalk(grid, m, { x: 40, y: 40 })).toBe(false);
    expect(cellOf(m)).toEqual({ x: 1, y: 1 });
  });

  it('drops the path when a key is pressed', () => {
    const m = mover(1.5, 1.5);
    planWalk(grid, m, { x: 6, y: 1 });
    step(grid, m, { dx: 0, dy: 1 });
    expect(m.path).toEqual([]);
    expect(m.y).toBeGreaterThan(1.5);
  });
});
