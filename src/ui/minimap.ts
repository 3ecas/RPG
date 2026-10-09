/**
 * The zone in miniature: every cell a few pixels, what stands on the map as
 * dots, everyone as a dot in their colour, you with a ring, and the edge of
 * what the main view shows. Redrawn every frame from the replica.
 */
import type { Replica } from '@/client/replica';
import type { Biome } from '@/types/content';
import type { Grid } from '@/world/grid';
import { colorFor, SELF_COLOR, terrainColor } from './scene';

export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private grid: Grid | null = null;
  private ground: HTMLCanvasElement | null = null;

  constructor(private readonly host: HTMLElement, private readonly replica: Replica, private readonly viewCells: () => { w: number; h: number }) {
    host.innerHTML = '<canvas class="minimap"></canvas>';
    this.canvas = host.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
  }

  setMap(grid: Grid, biome: Biome): void {
    this.grid = grid;
    // The ground once, one pixel per cell; frames scale it up without smoothing.
    const ground = document.createElement('canvas');
    ground.width = grid.width;
    ground.height = grid.height;
    const g = ground.getContext('2d')!;
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        g.fillStyle = terrainColor(biome, grid.terrain[y * grid.width + x]!);
        g.fillRect(x, y, 1, 1);
      }
    }
    this.ground = ground;
  }

  frame(now: number): void {
    const grid = this.grid;
    const ground = this.ground;
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (!grid || !ground || width === 0 || height === 0) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0a0d';
    ctx.fillRect(0, 0, width, height);
    const scale = Math.max(1, Math.floor(Math.min(width / grid.width, height / grid.height)));
    const ox = Math.floor((width - grid.width * scale) / 2);
    const oy = Math.floor((height - grid.height * scale) / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(ground, ox, oy, grid.width * scale, grid.height * scale);
    const at = (x: number, y: number) => ({ x: ox + x * scale, y: oy + y * scale });
    for (const obj of grid.objects) {
      const kind = obj.def.kind;
      if (kind === 'spawn' || kind === 'monster') continue;
      const color = kind === 'node' ? '#5fd05a' : kind === 'bank' ? '#f0c674' : kind === 'exit' ? '#ffffff' : kind === 'npc' ? '#e4e6ea' : kind === 'station' ? '#f08a2a' : '#c86a5a';
      const p = at(obj.x, obj.y);
      ctx.fillStyle = color;
      ctx.fillRect(p.x, p.y, Math.max(scale, 2) * obj.w, Math.max(scale, 2) * obj.h);
    }
    const self = this.replica.selfEntity;
    for (const e of this.replica.entities.values()) {
      const pos = this.replica.positionAt(e, now);
      const p = at(pos.x, pos.y);
      const r = Math.max(2, scale * 0.6);
      ctx.fillStyle = e === self ? SELF_COLOR : colorFor(e.name);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (e === self) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    if (self) {
      const pos = this.replica.positionAt(self, now);
      const view = this.viewCells();
      const p = at(pos.x - view.w / 2, pos.y - view.h / 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x + 0.5, p.y + 0.5, view.w * scale, view.h * scale);
    }
  }
}
