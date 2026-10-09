/**
 * Cell-to-cell movement over the grid, shared by the server (the authority)
 * and the client (its prediction) so both simulate identically from the same
 * inputs. A mover always stands in a cell or is on its way to the next one
 * along the eight-way path from a click. The walk between two cells is
 * continuous at a steady speed, so it looks fluid, but the game only ever
 * reasons in whole cells: you rest in a cell and use things from the cell
 * beside them. One step is one fixed slice of time.
 */
import { type Cell, type Dir, dirOf, type Grid, isWalkable } from './grid';
import { findPath8, nearestReachable, type PathOptions } from './path';

/** The simulation step, in milliseconds: the server ticks at this rate and the client predicts at it. */
export const STEP_MS = 50;
/** Cells per second, along the way walked; a diagonal is a longer way. */
export const WALK_SPEED = 4;
export const RUN_SPEED = 7;
const EPS = 1e-9;

export interface Mover {
  /** The cell it stands in, or is leaving. */
  cell: Cell;
  /** How far along it is from `cell` to the next cell of the path, 0 to 1; 0 when standing. */
  t: number;
  dir: Dir;
  running: boolean;
  /** Cells still to walk through, the next one first. */
  path: Cell[];
}

export interface Point {
  x: number;
  y: number;
}

/** The centre of a cell, where a mover standing in it is drawn. */
export function centre(cell: Cell): Point {
  return { x: cell.x + 0.5, y: cell.y + 0.5 };
}

/** Where a mover is drawn: between its cell and the next, by `t`. */
export function positionOf(m: Pick<Mover, 'cell' | 't' | 'path'>): Point {
  const next = m.path[0];
  if (!next || m.t <= 0) return centre(m.cell);
  return { x: m.cell.x + 0.5 + (next.x - m.cell.x) * m.t, y: m.cell.y + 0.5 + (next.y - m.cell.y) * m.t };
}

/** The cell a mover will stand in next: where it is, or the cell it is walking into. */
export function nextCell(m: Pick<Mover, 'cell' | 't' | 'path'>): Cell {
  const next = m.path[0];
  return next && m.t > 0 ? next : m.cell;
}

/**
 * Plan a walk to a clicked cell, or as near to it as the map allows: the
 * cell itself, or the reachable cell nearest to it (clicking a tree or a
 * person walks you to the cell beside it). `options.blocked` names cells the
 * map does not know are taken (a campfire someone built): the walk goes
 * around them and stops beside one that was clicked. A walk already under
 * way finishes its current cell first. False when nothing near the click can
 * be reached.
 */
export function planWalk(grid: Grid, m: Mover, target: Cell, options: PathOptions = {}): boolean {
  const from = nextCell(m);
  const goal = nearestReachable(grid, from, target, options);
  if (!goal) return false;
  const path = findPath8(grid, from, goal, options);
  if (!path) return false;
  const underway = m.path[0];
  m.path = underway && m.t > 0 ? [underway, ...path] : path;
  return true;
}

/** One step along the path, crossing into the next cell when the step reaches it and carrying the rest on. Returns whether the mover moved. */
export function step(grid: Grid, m: Mover): boolean {
  let budget = ((m.running ? RUN_SPEED : WALK_SPEED) * STEP_MS) / 1000;
  let moved = false;
  while (budget > EPS && m.path.length > 0) {
    const next = m.path[0]!;
    const dx = next.x - m.cell.x;
    const dy = next.y - m.cell.y;
    const length = Math.hypot(dx, dy);
    if (length === 0 || length > Math.SQRT2 + 1e-6 || !isWalkable(grid, next.x, next.y)) {
      // Not a neighbour, or no longer walkable: the walk ends where it stands.
      m.path = [];
      break;
    }
    m.dir = dirOf(dx, dy);
    const left = (1 - m.t) * length;
    if (budget >= left - EPS) {
      budget -= left;
      m.cell = next;
      m.path.shift();
      m.t = 0;
    } else {
      m.t += budget / length;
      budget = 0;
    }
    moved = true;
  }
  if (m.path.length === 0) m.t = 0;
  return moved;
}
