/** Breadth-first paths over a grid. Short maps, four directions: BFS is plenty. */
import { type Cell, type Grid, isWalkable, neighbors } from './grid';

export interface PathOptions {
  /** Extra cells to treat as blocked (creatures). */
  blocked?: (x: number, y: number) => boolean;
  /** Allow the destination to be blocked (moving next to something). */
  maxSteps?: number;
}

/**
 * Shortest path from `from` to the first cell where `isGoal` holds, excluding
 * `from`. Returns [] when already there and null when unreachable.
 */
export function findPathTo(grid: Grid, from: Cell, isGoal: (cell: Cell) => boolean, options: PathOptions = {}): Cell[] | null {
  if (isGoal(from)) return [];
  const key = (c: Cell) => c.y * grid.width + c.x;
  const previous = new Map<number, number>();
  const queue: Cell[] = [from];
  previous.set(key(from), -1);
  const limit = options.maxSteps ?? grid.width * grid.height;
  while (queue.length) {
    const cell = queue.shift()!;
    for (const next of neighbors(cell)) {
      const k = key(next);
      if (previous.has(k)) continue;
      if (!isWalkable(grid, next.x, next.y) || options.blocked?.(next.x, next.y)) continue;
      previous.set(k, key(cell));
      if (isGoal(next)) {
        const path: Cell[] = [];
        for (let at = k; at !== key(from); at = previous.get(at)!) path.unshift({ x: at % grid.width, y: Math.floor(at / grid.width) });
        return path.length > limit ? null : path;
      }
      queue.push(next);
    }
  }
  return null;
}

export function findPath(grid: Grid, from: Cell, to: Cell, options: PathOptions = {}): Cell[] | null {
  return findPathTo(grid, from, (c) => c.x === to.x && c.y === to.y, options);
}

/** Every cell reachable from `from` on foot (creatures ignored). */
export function reachable(grid: Grid, from: Cell): Set<number> {
  const seen = new Set<number>([from.y * grid.width + from.x]);
  const queue: Cell[] = [from];
  while (queue.length) {
    const cell = queue.shift()!;
    for (const next of neighbors(cell)) {
      const k = next.y * grid.width + next.x;
      if (seen.has(k) || !isWalkable(grid, next.x, next.y)) continue;
      seen.add(k);
      queue.push(next);
    }
  }
  return seen;
}
