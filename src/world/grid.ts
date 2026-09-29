/**
 * The walkable model of a zone map: terrain per cell, placed objects with
 * their footprints, and the queries movement needs. Pure data and functions;
 * the renderer and input live in ui/world.
 */
import { BIG_KINDS, TERRAIN_CHARS, type MapObjectDef, type MapObjectKind, type Terrain, type ZoneMapDef } from '@/types/content';

export interface Cell {
  x: number;
  y: number;
}

export interface PlacedObject {
  /** Position in `Grid.objects`; stable for a map. */
  index: number;
  key: string;
  def: MapObjectDef;
  /** Top-left cell of the footprint. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Grid {
  width: number;
  height: number;
  /** Row-major terrain. */
  terrain: Terrain[];
  objects: PlacedObject[];
  /** Index into `objects` of the blocking object on each cell, or -1. */
  occupant: number[];
  spawn: Cell;
}

export const WALKABLE: ReadonlySet<Terrain> = new Set<Terrain>(['grass', 'path', 'tallgrass', 'flowers', 'dirt', 'floor', 'bridge']);

/** Kinds you cannot walk through. Monsters are spawn spots (the creature itself moves), exits and spawns are ground. */
export function blocks(kind: MapObjectKind): boolean {
  return kind !== 'exit' && kind !== 'spawn' && kind !== 'monster';
}

export function parseMap(def: ZoneMapDef): Grid {
  const height = def.rows.length;
  const width = def.rows[0]?.length ?? 0;
  const terrain: Terrain[] = new Array<Terrain>(width * height).fill('void');
  const occupant: number[] = new Array<number>(width * height).fill(-1);
  const objects: PlacedObject[] = [];
  let spawn: Cell = { x: 0, y: 0 };
  const seen = new Set<number>();
  def.rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? ' ';
      const ground = TERRAIN_CHARS[ch];
      if (ground) { terrain[y * width + x] = ground; continue; }
      const obj = def.legend[ch];
      if (!obj) continue;
      // Objects stand on the biome's ground; exits and spawns are part of the road.
      terrain[y * width + x] = obj.kind === 'exit' || obj.kind === 'spawn' ? 'path' : 'grass';
      if (obj.kind === 'spawn') spawn = { x, y };
      if (seen.has(y * width + x)) continue;
      const big = BIG_KINDS.includes(obj.kind);
      const placed: PlacedObject = { index: objects.length, key: ch, def: obj, x, y, w: big ? 2 : 1, h: big ? 2 : 1 };
      objects.push(placed);
      for (let dy = 0; dy < placed.h; dy++) {
        for (let dx = 0; dx < placed.w; dx++) {
          const i = (y + dy) * width + (x + dx);
          seen.add(i);
          if (big) terrain[i] = 'grass';
          if (blocks(obj.kind)) occupant[i] = placed.index;
        }
      }
    }
  });
  return { width, height, terrain, objects, occupant, spawn };
}

export function inBounds(grid: Grid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < grid.width && y < grid.height;
}

export function terrainAt(grid: Grid, x: number, y: number): Terrain {
  return inBounds(grid, x, y) ? grid.terrain[y * grid.width + x]! : 'void';
}

/** The blocking object on a cell, if any. */
export function objectAt(grid: Grid, x: number, y: number): PlacedObject | null {
  if (!inBounds(grid, x, y)) return null;
  const index = grid.occupant[y * grid.width + x]!;
  return index >= 0 ? grid.objects[index]! : null;
}

/** Objects of a passable kind (exits, spawn, monster spots) whose cell this is. */
export function markersAt(grid: Grid, x: number, y: number): PlacedObject[] {
  return grid.objects.filter((o) => !blocks(o.def.kind) && o.x === x && o.y === y);
}

/** Terrain and static objects allow standing here. Moving creatures are checked by the scene. */
export function isWalkable(grid: Grid, x: number, y: number): boolean {
  return inBounds(grid, x, y) && WALKABLE.has(terrainAt(grid, x, y)) && grid.occupant[y * grid.width + x] === -1;
}

export const DIRS: readonly Cell[] = [{ x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }];

export function neighbors(cell: Cell): Cell[] {
  return DIRS.map((d) => ({ x: cell.x + d.x, y: cell.y + d.y }));
}

/** Cells that touch the footprint on one of its four sides. */
export function cellsAround(obj: { x: number; y: number; w: number; h: number }): Cell[] {
  const out: Cell[] = [];
  for (let dx = 0; dx < obj.w; dx++) { out.push({ x: obj.x + dx, y: obj.y - 1 }); out.push({ x: obj.x + dx, y: obj.y + obj.h }); }
  for (let dy = 0; dy < obj.h; dy++) { out.push({ x: obj.x - 1, y: obj.y + dy }); out.push({ x: obj.x + obj.w, y: obj.y + dy }); }
  return out;
}

export function isAdjacent(obj: { x: number; y: number; w: number; h: number }, cell: Cell): boolean {
  return cellsAround(obj).some((c) => c.x === cell.x && c.y === cell.y);
}

export function covers(obj: { x: number; y: number; w: number; h: number }, cell: Cell): boolean {
  return cell.x >= obj.x && cell.x < obj.x + obj.w && cell.y >= obj.y && cell.y < obj.y + obj.h;
}

export function manhattan(a: Cell, b: Cell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
