/**
 * Breadth-first paths over a grid. Short maps: BFS is plenty. Four-way paths
 * serve the single-player scene; eight-way paths with the corner rule serve
 * the server, where a diagonal step costs the same as a straight one.
 */
import { type Cell, type Grid, inBounds, isWalkable, neighbors } from './grid';

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

// ---- eight directions ----------------------------------------------------------

/** Diagonals first, so a path cuts its corner early and then runs straight, the way RuneScape walks. */
export const STEPS8: readonly Cell[] = [
  { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
  { x: 0, y: -1 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 },
];

function open(grid: Grid, x: number, y: number, blocked?: PathOptions['blocked']): boolean {
  return isWalkable(grid, x, y) && !blocked?.(x, y);
}

/**
 * Whether one step of (dx, dy) from `from` is allowed. A diagonal step may not
 * cut a corner: both cells it squeezes between must be open as well.
 */
export function canStep8(grid: Grid, from: Cell, dx: number, dy: number, blocked?: PathOptions['blocked']): boolean {
  if (!open(grid, from.x + dx, from.y + dy, blocked)) return false;
  if (dx === 0 || dy === 0) return true;
  return open(grid, from.x + dx, from.y, blocked) && open(grid, from.x, from.y + dy, blocked);
}

/**
 * Eight-way breadth-first search, layer by layer: the parent of every cell
 * reached, keyed by cell index, and the first goal found. Among paths of the
 * same length it keeps the one with the fewest diagonal steps, so a straight
 * target is reached in a straight line rather than a zigzag, and among those
 * the one that takes its diagonals earliest, so a path cuts its corner first
 * and then runs straight, the way RuneScape walks. Both preferences are one
 * additive cost: a diagonal at depth d costs DIAGONAL + d, a straight step 0.
 */
const DIAGONAL = 1_000_000;

function search8(grid: Grid, from: Cell, isGoal: ((cell: Cell) => boolean) | null, options: PathOptions): { previous: Map<number, number>; goal: number | null } {
  const key = (c: Cell) => c.y * grid.width + c.x;
  const previous = new Map<number, number>();
  const diagonals = new Map<number, number>();
  previous.set(key(from), -1);
  diagonals.set(key(from), 0);
  let layer: Cell[] = [from];
  for (let depth = 1; layer.length > 0; depth++) {
    const next: Cell[] = [];
    const fresh = new Set<number>();
    for (const cell of layer) {
      const soFar = diagonals.get(key(cell))!;
      for (const step of STEPS8) {
        const to = { x: cell.x + step.x, y: cell.y + step.y };
        const k = key(to);
        const cost = soFar + (step.x !== 0 && step.y !== 0 ? DIAGONAL + depth : 0);
        if (previous.has(k) && !(fresh.has(k) && cost < diagonals.get(k)!)) continue;
        if (!canStep8(grid, cell, step.x, step.y, options.blocked)) continue;
        if (!previous.has(k)) {
          next.push(to);
          fresh.add(k);
        }
        previous.set(k, key(cell));
        diagonals.set(k, cost);
      }
    }
    for (const cell of next) if (isGoal?.(cell)) return { previous, goal: key(cell) };
    layer = next;
  }
  return { previous, goal: null };
}

function unwind(grid: Grid, previous: Map<number, number>, from: Cell, goal: number): Cell[] {
  const path: Cell[] = [];
  const start = from.y * grid.width + from.x;
  for (let at = goal; at !== start; at = previous.get(at)!) path.unshift({ x: at % grid.width, y: Math.floor(at / grid.width) });
  return path;
}

/** Shortest eight-way path from `from` to `to`, excluding `from`: [] when already there, null when unreachable. */
export function findPath8(grid: Grid, from: Cell, to: Cell, options: PathOptions = {}): Cell[] | null {
  if (from.x === to.x && from.y === to.y) return [];
  const { previous, goal } = search8(grid, from, (c) => c.x === to.x && c.y === to.y, options);
  if (goal === null) return null;
  const path = unwind(grid, previous, from, goal);
  return options.maxSteps !== undefined && path.length > options.maxSteps ? null : path;
}

/**
 * Where a click on `target` should take you: the target itself when you can
 * stand there, otherwise the reachable cell nearest to it within `radius`, so
 * clicking a tree or the water walks you up to it. Null when nothing near the
 * target can be reached.
 */
export function nearestReachable(grid: Grid, from: Cell, target: Cell, options: PathOptions = {}, radius = 3): Cell | null {
  const { previous } = search8(grid, from, null, options);
  let best: Cell | null = null;
  let bestScore = Infinity;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const cell = { x: target.x + dx, y: target.y + dy };
      if (!inBounds(grid, cell.x, cell.y) || !previous.has(cell.y * grid.width + cell.x)) continue;
      // Nearest to the click first (as the crow flies, then by city blocks), then nearest to the walker.
      const score = Math.max(Math.abs(dx), Math.abs(dy)) * 1_000_000 + (Math.abs(dx) + Math.abs(dy)) * 1_000 + Math.abs(cell.x - from.x) + Math.abs(cell.y - from.y);
      if (score < bestScore) { best = cell; bestScore = score; }
    }
  }
  return best;
}
