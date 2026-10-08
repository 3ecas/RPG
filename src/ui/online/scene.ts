/**
 * The zone as the server tells it: the ground and everything standing on the
 * map, every player in the room where the replica says they are, name tags,
 * chat bubbles and the click marker. Click to walk. Draws only; nothing here
 * decides anything.
 */
import type { Replica, ReplicaEntity } from '@/client/replica';
import type { ZoneMapDef } from '@/types/content';
import type { NpcId, ZoneId } from '@/types/ids';
import { type Cell, type Grid, inBounds, parseMap } from '@/world/grid';
import { human } from '../world/art';
import { drawExitMarkers, type ObjectContent, objectSprite, outlinedText } from '../world/objects';
import { BIOME_PALETTES, humanColorsFor } from '../world/palettes';
import { renderGround, sprite, TILE } from '../world/sprites';

export interface SceneContent extends ObjectContent {
  zone(id: ZoneId): { name: string };
  npc(id: NpcId): { name: string };
}

const MARKER_MS = 700;
const SELF_COLOR = '#7cc4ff';

export class OnlineScene {
  /** Called with the cell the player clicked. */
  onWalk: ((cell: Cell) => void) | null = null;
  private host!: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private grid: Grid | null = null;
  private map: ZoneMapDef | null = null;
  private ground: [HTMLCanvasElement, HTMLCanvasElement] | null = null;
  private marker: { x: number; y: number; at: number } | null = null;
  private pointer: { x: number; y: number } | null = null;
  private scale = 3;
  private dpr = 1;
  private now = 0;

  constructor(private readonly content: SceneContent, private readonly replica: Replica) {}

  mount(host: HTMLElement): void {
    this.host = host;
    host.innerHTML = '<canvas class="world-canvas"></canvas>';
    this.canvas = host.querySelector('.world-canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.canvas.addEventListener('pointerdown', (event) => {
      this.pointer = { x: event.clientX, y: event.clientY };
    });
    this.canvas.addEventListener('pointerup', (event) => {
      const down = this.pointer;
      this.pointer = null;
      if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 8) return;
      const cell = this.cellAt(event.clientX, event.clientY);
      if (!cell) return;
      this.marker = { x: cell.x, y: cell.y, at: this.now };
      this.onWalk?.(cell);
    });
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
  }

  /** The zone to show; the replica's entities are drawn on it. */
  setMap(map: ZoneMapDef): void {
    this.map = map;
    this.grid = parseMap(map);
    this.ground = [renderGround(this.grid, map.biome, 0), renderGround(this.grid, map.biome, 1)];
    this.marker = null;
  }

  frame(now: number): void {
    this.now = now;
    if (!this.grid || !this.map || !this.ground) return;
    if (this.canvas.width === 0) this.resize();
    this.draw(this.grid, this.map, this.ground);
  }

  private resize(): void {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    if (width === 0 || height === 0) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.scale = width >= 1000 ? 3 : 2;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  private cellAt(clientX: number, clientY: number): Cell | null {
    if (!this.grid) return null;
    const rect = this.canvas.getBoundingClientRect();
    const cam = this.camera(this.grid);
    const x = Math.floor(((clientX - rect.left) / this.scale + cam.x) / TILE);
    const y = Math.floor(((clientY - rect.top) / this.scale + cam.y) / TILE);
    return inBounds(this.grid, x, y) ? { x, y } : null;
  }

  /** Follows your own character; shows the whole map when it fits. */
  private camera(grid: Grid): { x: number; y: number } {
    const viewW = this.canvas.clientWidth / this.scale;
    const viewH = this.canvas.clientHeight / this.scale;
    const mapW = grid.width * TILE;
    const mapH = grid.height * TILE;
    const self = this.replica.self;
    const at = self ? this.replica.positionAt(self, this.now) : grid.spawn;
    const px = at.x * TILE;
    const py = at.y * TILE;
    const x = mapW <= viewW ? -(viewW - mapW) / 2 : Math.max(0, Math.min(mapW - viewW, px + TILE / 2 - viewW / 2));
    const y = mapH <= viewH ? -(viewH - mapH) / 2 : Math.max(0, Math.min(mapH - viewH, py + TILE / 2 - viewH / 2));
    return { x: Math.round(x * this.scale) / this.scale, y: Math.round(y * this.scale) / this.scale };
  }

  private draw(grid: Grid, map: ZoneMapDef, ground: [HTMLCanvasElement, HTMLCanvasElement]): void {
    const ctx = this.ctx;
    const cam = this.camera(grid);
    const k = this.dpr * this.scale;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = BIOME_PALETTES[map.biome].z;
    ctx.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    ctx.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(ground[Math.floor(this.now / 700) % 2]!, 0, 0);
    drawExitMarkers(ctx, grid);
    this.drawMarker();

    const self = this.replica.self;
    const selfAt = self ? this.replica.positionAt(self, this.now) : null;
    const drawables: { y: number; draw: () => void }[] = [];
    for (const obj of grid.objects) {
      const img = objectSprite(this.content, obj, this.now);
      if (!img) continue;
      // A tall sprite (a tree) whose canopy would hide you turns see-through.
      const overhang = img.height - obj.h * TILE;
      const hides = !!selfAt && overhang > 0 && selfAt.x + 0.5 >= obj.x && selfAt.x + 0.5 < obj.x + obj.w && selfAt.y < obj.y && selfAt.y * TILE + TILE > obj.y * TILE - overhang;
      drawables.push({
        y: (obj.y + obj.h) * TILE,
        draw: () => {
          ctx.globalAlpha = hides ? 0.45 : 1;
          ctx.drawImage(img, obj.x * TILE, (obj.y + obj.h) * TILE - img.height);
          ctx.globalAlpha = 1;
        },
      });
    }
    for (const e of this.replica.entities.values()) {
      const at = this.replica.positionAt(e, this.now);
      const facing = e.dir === 3 ? 'up' : e.dir === 0 ? 'down' : 'side';
      const frame = at.moving ? (Math.floor(this.now / 130) % 2 as 0 | 1) : 0;
      const img = sprite(`human:${e.name}:${facing}:${frame}`, () => human(facing, frame, humanColorsFor(e.name)));
      const px = at.x * TILE;
      const py = at.y * TILE - (frame === 1 && at.moving ? 1 : 0);
      const flip = e.dir === 2;
      drawables.push({
        y: at.y * TILE + TILE + (e.id === this.replica.selfId ? 0.5 : 0),
        draw: () => {
          if (flip) {
            ctx.save();
            ctx.translate(px + TILE, py);
            ctx.scale(-1, 1);
            ctx.drawImage(img, 0, 0, TILE, TILE);
            ctx.restore();
          } else {
            ctx.drawImage(img, px, py, TILE, TILE);
          }
        },
      });
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawOverlays(grid, cam);
  }

  /** The yellow cross where you clicked, fading out. */
  private drawMarker(): void {
    const m = this.marker;
    if (!m) return;
    const age = (this.now - m.at) / MARKER_MS;
    if (age >= 1) {
      this.marker = null;
      return;
    }
    const ctx = this.ctx;
    const cx = m.x * TILE + TILE / 2;
    const cy = m.y * TILE + TILE / 2;
    const r = 3 + age * 2;
    ctx.save();
    ctx.globalAlpha = 1 - age;
    ctx.strokeStyle = '#f0c674';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy - r);
    ctx.lineTo(cx + r, cy + r);
    ctx.moveTo(cx + r, cy - r);
    ctx.lineTo(cx - r, cy + r);
    ctx.stroke();
    ctx.restore();
  }

  /** Names, bubbles and labels in screen space, so text stays crisp at any scale. */
  private drawOverlays(grid: Grid, cam: { x: number; y: number }): void {
    const ctx = this.ctx;
    const s = this.scale;
    const sx = (wx: number) => (wx - cam.x) * s;
    const sy = (wy: number) => (wy - cam.y) * s;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';

    for (const obj of grid.objects) {
      const cx = sx((obj.x + obj.w / 2) * TILE);
      if (obj.def.kind === 'exit') {
        const label = this.content.zone(obj.def.zone).name;
        const above = obj.y === grid.height - 1;
        ctx.font = '600 11px system-ui, sans-serif';
        const half = ctx.measureText(label).width / 2 + 6;
        const lx = Math.max(half, Math.min(this.canvas.clientWidth - half, cx));
        outlinedText(ctx, label, lx, above ? sy(obj.y * TILE) - 4 : sy((obj.y + 1) * TILE) + 12, '#e4e6ea', 11);
      } else if (obj.def.kind === 'npc') {
        outlinedText(ctx, this.content.npc(obj.def.id).name, cx, sy(obj.y * TILE) - 6, '#c9ccd3', 10);
      }
    }

    const bubbles = new Map(this.replica.bubbles(this.now).map((b) => [b.id, b]));
    for (const e of this.replica.entities.values()) {
      const at = this.replica.positionAt(e, this.now);
      const cx = sx(at.x * TILE + TILE / 2);
      const top = sy(at.y * TILE);
      const isSelf = e.id === this.replica.selfId;
      outlinedText(ctx, e.name, cx, top - 5, isSelf ? SELF_COLOR : '#e4e6ea', 11, isSelf);
      const bubble = bubbles.get(e.id);
      if (bubble) this.drawBubble(bubble.text, cx, top - 20, (this.now - bubble.at) / 1000);
    }
  }

  private drawBubble(text: string, cx: number, bottom: number, ageSeconds: number): void {
    const ctx = this.ctx;
    ctx.font = '600 12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    const width = Math.min(260, ctx.measureText(text).width + 14);
    const lines = wrap(ctx, text, width - 14);
    const lineHeight = 15;
    const height = lines.length * lineHeight + 8;
    const x = Math.max(4, Math.min(this.canvas.clientWidth - width - 4, cx - width / 2));
    const y = bottom - height;
    ctx.save();
    ctx.globalAlpha = ageSeconds > 3.5 ? Math.max(0, 1 - (ageSeconds - 3.5)) : 1;
    ctx.fillStyle = 'rgba(248, 246, 240, 0.95)';
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 6);
    ctx.fill();
    ctx.fillStyle = '#1b1520';
    ctx.textAlign = 'left';
    lines.forEach((line, i) => ctx.fillText(line, x + 7, y + 6 + (i + 1) * lineHeight - 4));
    ctx.textAlign = 'center';
    ctx.restore();
  }
}

/** Greedy word wrap for a bubble. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export type { ReplicaEntity };
