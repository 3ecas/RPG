/**
 * Continuous movement over the grid, shared by the server (the authority)
 * and the client (its prediction) so both simulate identically from the same
 * inputs. A mover is a small circle in cell coordinates. Under direct control
 * it moves in eight directions and slides along walls; after a click it
 * follows the centres of the cells on the eight-way path. One step is one
 * fixed slice of time.
 */
import { type Cell, type Dir, dirOf, type Grid, isWalkable } from './grid';
import { findPath8, nearestReachable } from './path';

/** The simulation step, in milliseconds: the server ticks at this rate and the client predicts at it. */
export const STEP_MS = 50;
/** Cells per second. */
export const WALK_SPEED = 4;
export const RUN_SPEED = 7;
/** Half the width of a mover, in cells. */
export const RADIUS = 0.3;
const EPS = 1e-4;

export interface Mover {
  /** The centre, in cells: a mover standing in cell (3, 4) is at (3.5, 4.5). */
  x: number;
  y: number;
  dir: Dir;
  running: boolean;
  /** Cells still to walk through, nearest first; the mover aims for their centres. */
  path: Cell[];
}

export interface Input {
  dx: -1 | 0 | 1;
  dy: -1 | 0 | 1;
}

/** The cell a mover stands in. */
export function cellOf(m: { x: number; y: number }): Cell {
  return { x: Math.floor(m.x), y: Math.floor(m.y) };
}

/** Whether a mover centred here fits: the cells under its four corners are all walkable. */
export function canStand(grid: Grid, x: number, y: number): boolean {
  const x0 = Math.floor(x - RADIUS + EPS);
  const x1 = Math.floor(x + RADIUS - EPS);
  const y0 = Math.floor(y - RADIUS + EPS);
  const y1 = Math.floor(y + RADIUS - EPS);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (!isWalkable(grid, cx, cy)) return false;
  return true;
}

/** Plan a walk to a clicked cell, or as near to it as the map allows. False when nothing near can be reached. */
export function planWalk(grid: Grid, m: Mover, target: Cell): boolean {
  const here = cellOf(m);
  const goal = nearestReachable(grid, here, target);
  if (!goal) return false;
  const path = findPath8(grid, here, goal);
  if (!path) return false;
  // A diagonal first step from off-centre could clip the corner it cuts: pass through the centre of this cell first.
  const first = path[0];
  const diagonal = first !== undefined && first.x !== here.x && first.y !== here.y;
  const offCentre = Math.abs(here.x + 0.5 - m.x) > EPS || Math.abs(here.y + 0.5 - m.y) > EPS;
  m.path = diagonal && offCentre ? [here, ...path] : path;
  return true;
}

/** One step of movement. Direct control wins over the path and cancels it. Returns whether the mover moved. */
export function step(grid: Grid, m: Mover, input: Input): boolean {
  const budget = ((m.running ? RUN_SPEED : WALK_SPEED) * STEP_MS) / 1000;
  if (input.dx !== 0 || input.dy !== 0) {
    m.path = [];
    const length = Math.hypot(input.dx, input.dy);
    m.dir = dirOf(input.dx, input.dy);
    return slide(grid, m, (input.dx / length) * budget, (input.dy / length) * budget);
  }
  let remaining = budget;
  let moved = false;
  while (remaining > EPS && m.path.length > 0) {
    const waypoint = m.path[0]!;
    const tx = waypoint.x + 0.5;
    const ty = waypoint.y + 0.5;
    const dx = tx - m.x;
    const dy = ty - m.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= EPS) {
      m.path.shift();
      continue;
    }
    const take = Math.min(distance, remaining);
    m.dir = dirOf(Math.abs(dx) > EPS ? Math.sign(dx) : 0, Math.abs(dy) > EPS ? Math.sign(dy) : 0);
    const fromX = m.x;
    const fromY = m.y;
    slide(grid, m, (dx / distance) * take, (dy / distance) * take);
    if (Math.hypot(m.x - fromX, m.y - fromY) <= EPS) {
      // Stuck against something that was not on the map when the path was planned: give the walk up.
      m.path = [];
      break;
    }
    moved = true;
    remaining -= take;
    if (Math.hypot(tx - m.x, ty - m.y) <= EPS) {
      m.x = tx;
      m.y = ty;
      m.path.shift();
    }
  }
  return moved;
}

/** Move by (dx, dy) one axis at a time, each stopping at the first wall. Returns whether the position changed. */
function slide(grid: Grid, m: Mover, dx: number, dy: number): boolean {
  const x0 = m.x;
  const y0 = m.y;
  m.x = moveAlong(grid, m.x, m.y, dx, true);
  m.y = moveAlong(grid, m.y, m.x, dy, false);
  return m.x !== x0 || m.y !== y0;
}

/**
 * The coordinate along one axis after moving `delta`, stopped just short of
 * the first blocked column (or row) the mover's leading edge would enter.
 * `across` is the other coordinate, which decides which rows (or columns)
 * the mover spans.
 */
function moveAlong(grid: Grid, along: number, across: number, delta: number, horizontal: boolean): number {
  if (delta === 0) return along;
  const sign = delta > 0 ? 1 : -1;
  const a0 = Math.floor(across - RADIUS + EPS);
  const a1 = Math.floor(across + RADIUS - EPS);
  const lead = along + sign * RADIUS;
  const from = Math.floor(lead - sign * EPS);
  const to = Math.floor(lead + delta - sign * EPS);
  for (let c = from + sign; sign > 0 ? c <= to : c >= to; c += sign) {
    for (let a = a0; a <= a1; a++) {
      const blocked = horizontal ? !isWalkable(grid, c, a) : !isWalkable(grid, a, c);
      if (!blocked) continue;
      const wall = sign > 0 ? c : c + 1;
      const stop = wall - sign * (RADIUS + EPS);
      return sign > 0 ? Math.max(along, stop) : Math.min(along, stop);
    }
  }
  return along + delta;
}
