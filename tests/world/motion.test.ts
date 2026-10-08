import { describe, expect, it } from 'vitest';
import type { ZoneMapDef } from '@/types/content';
import { parseMap } from '@/world/grid';
import { centre, type Mover, nextCell, planWalk, positionOf, RUN_SPEED, step, STEP_MS, WALK_SPEED } from '@/world/motion';

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

function mover(x: number, y: number, running = false): Mover {
  return { cell: { x, y }, t: 0, dir: 0, running, path: [] };
}

const ONE_SECOND = 1000 / STEP_MS;
const PER_STEP = WALK_SPEED / ONE_SECOND;

/** Walks until the path is done; returns the number of steps taken. */
function walk(m: Mover): number {
  let steps = 0;
  while (m.path.length > 0 && steps < 500) {
    step(grid, m);
    steps++;
  }
  return steps;
}

describe('motion: standing and being drawn', () => {
  it('stands in the middle of its cell and is drawn between cells while walking', () => {
    const m = mover(1, 1);
    expect(positionOf(m)).toEqual({ x: 1.5, y: 1.5 });
    expect(centre({ x: 3, y: 4 })).toEqual({ x: 3.5, y: 4.5 });
    m.path = [{ x: 2, y: 1 }];
    m.t = 0.25;
    expect(positionOf(m)).toEqual({ x: 1.75, y: 1.5 });
    expect(nextCell(m)).toEqual({ x: 2, y: 1 });
    m.t = 0;
    expect(nextCell(m)).toEqual({ x: 1, y: 1 }); // not yet under way: still here
  });
});

describe('motion: walking a path', () => {
  it('walks to the clicked cell at walking speed and rests in it', () => {
    const m = mover(1, 1);
    expect(planWalk(grid, m, { x: 6, y: 1 })).toBe(true);
    expect(m.path).toHaveLength(5);
    expect(walk(m)).toBe(Math.ceil(5 / PER_STEP));
    expect(m.cell).toEqual({ x: 6, y: 1 });
    expect(m.t).toBe(0);
    expect(m.dir).toBe(2);
    expect(step(grid, m)).toBe(false); // arrived: nothing more to do
  });

  it('runs faster', () => {
    const m = mover(1, 1, true);
    planWalk(grid, m, { x: 6, y: 1 });
    expect(walk(m)).toBe(Math.ceil(5 / (RUN_SPEED / ONE_SECOND)));
    expect(m.cell).toEqual({ x: 6, y: 1 });
  });

  it('crosses cells at a steady pace, a diagonal taking longer because it is longer', () => {
    const m = mover(1, 1);
    planWalk(grid, m, { x: 1, y: 5 });
    step(grid, m);
    expect(m.cell).toEqual({ x: 1, y: 1 });
    expect(m.t).toBeCloseTo(PER_STEP, 9);
    for (let i = 0; i < 4; i++) step(grid, m);
    expect(m.cell).toEqual({ x: 1, y: 2 }); // five steps: exactly one cell
    expect(m.t).toBeCloseTo(0, 9);
    const d = mover(5, 1);
    planWalk(grid, d, { x: 7, y: 3 });
    expect(d.path[0]).toEqual({ x: 6, y: 2 });
    step(grid, d);
    expect(d.t).toBeCloseTo(PER_STEP / Math.SQRT2, 9);
  });

  it('carries leftover distance across a cell boundary instead of pausing', () => {
    const m = mover(1, 1, true);
    planWalk(grid, m, { x: 6, y: 1 });
    step(grid, m);
    step(grid, m);
    step(grid, m); // 3 × 0.35 = 1.05 cells
    expect(m.cell).toEqual({ x: 2, y: 1 });
    expect(m.t).toBeCloseTo(0.05, 9);
  });

  it('finishes the cell it is walking into before a new click changes course, and still rests on a cell', () => {
    const m = mover(1, 1);
    planWalk(grid, m, { x: 7, y: 1 });
    step(grid, m);
    step(grid, m); // under way towards (2, 1)
    expect(planWalk(grid, m, { x: 2, y: 4 })).toBe(true);
    expect(m.path[0]).toEqual({ x: 2, y: 1 });
    expect(m.path[m.path.length - 1]).toEqual({ x: 2, y: 4 });
    walk(m);
    expect(m.cell).toEqual({ x: 2, y: 4 });
    expect(m.t).toBe(0);
    // Clicking the very cell it is walking into just finishes that cell.
    const n = mover(1, 1);
    planWalk(grid, n, { x: 7, y: 1 });
    step(grid, n);
    expect(planWalk(grid, n, { x: 2, y: 1 })).toBe(true);
    expect(n.path).toEqual([{ x: 2, y: 1 }]);
    walk(n);
    expect(n.cell).toEqual({ x: 2, y: 1 });
  });

  it('walks up to water and refuses the unreachable', () => {
    const m = mover(1, 1);
    expect(planWalk(grid, m, { x: 8, y: 4 })).toBe(true);
    const last = m.path[m.path.length - 1]!;
    expect([[7, 4], [8, 3]]).toContainEqual([last.x, last.y]);
    expect(planWalk(grid, m, { x: 40, y: 40 })).toBe(false);
    expect(m.path.length).toBeGreaterThan(0); // the earlier walk stands
  });

  it('clicking a thing walks to the cell beside it, which is where it will be used from', () => {
    const m = mover(1, 1);
    expect(planWalk(grid, m, { x: 3, y: 2 })).toBe(true); // the tree
    walk(m);
    expect(Math.max(Math.abs(m.cell.x - 3), Math.abs(m.cell.y - 2))).toBe(1);
    expect(m.t).toBe(0);
  });

  it('stops where it stands when the next cell is not a walkable neighbour', () => {
    const m = mover(1, 1);
    m.path = [{ x: 0, y: 1 }]; // the forest
    expect(step(grid, m)).toBe(false);
    expect(m.path).toEqual([]);
    m.path = [{ x: 3, y: 1 }]; // two cells away: not a step
    expect(step(grid, m)).toBe(false);
    expect(m.cell).toEqual({ x: 1, y: 1 });
  });
});
