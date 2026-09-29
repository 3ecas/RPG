/** Turns pixel art into cached canvases and pre-renders a zone's ground. */
import type { Biome, Terrain } from '@/types/content';
import type { Grid } from '@/world/grid';
import { type PixelArt, TILE_ROWS } from './art';
import { BIOME_PALETTES } from './palettes';

export const TILE = 16;

const cache = new Map<string, HTMLCanvasElement>();

export function rasterize(art: PixelArt): HTMLCanvasElement {
  const width = art.rows[0]?.length ?? 0;
  const height = art.rows.length;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d')!;
  art.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]!;
      if (ch === '.') continue;
      const color = art.palette[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  return canvas;
}

/** Rasterizes once per distinct key; the key must change when the art or palette does. */
export function sprite(key: string, art: () => PixelArt): HTMLCanvasElement {
  let out = cache.get(key);
  if (!out) {
    out = rasterize(art());
    cache.set(key, out);
  }
  return out;
}

function tileArt(terrain: Terrain, biome: Biome, variant: number): PixelArt {
  const name = terrain === 'grass' && variant === 1 ? 'grass2' : terrain === 'water' && variant === 1 ? 'water2' : terrain;
  return { rows: TILE_ROWS[name] ?? TILE_ROWS.void!, palette: BIOME_PALETTES[biome] };
}

function tile(terrain: Terrain, biome: Biome, variant: number): HTMLCanvasElement {
  return sprite(`tile:${biome}:${terrain}:${variant}`, () => tileArt(terrain, biome, variant));
}

/** The whole ground of a zone as one image; two frames so water can shimmer. */
export function renderGround(grid: Grid, biome: Biome, frame: 0 | 1): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = grid.width * TILE;
  canvas.height = grid.height * TILE;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const terrain = grid.terrain[y * grid.width + x]!;
      const variant = terrain === 'water' ? frame : (x * 7 + y * 13) % 3 === 0 ? 1 : 0;
      ctx.drawImage(tile(terrain, biome, variant), x * TILE, y * TILE);
      if (terrain === 'rock' || terrain === 'trees') shade(ctx, grid, x, y, terrain);
    }
  }
  return canvas;
}

/** A darker line under walls and canopies where open ground meets them, for a little depth. */
function shade(ctx: CanvasRenderingContext2D, grid: Grid, x: number, y: number, terrain: Terrain): void {
  const below = grid.terrain[(y + 1) * grid.width + x];
  if (y + 1 < grid.height && below !== terrain && below !== 'void') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(x * TILE, y * TILE + TILE - 2, TILE, 2);
  }
}
