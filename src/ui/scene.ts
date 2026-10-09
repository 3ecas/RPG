/**
 * The zone drawn with simple shapes: flat tiles, circles and boxes for what
 * stands on the map, items on the ground, a coloured disc per player where
 * the replica says they are, the swing of whoever is working on something,
 * name tags, chat bubbles, xp gains and the click marker. Clicks and the
 * cell under the pointer go up to the shell, which decides what they mean.
 * Draws only; nothing here decides anything. Pixel art can replace the
 * shapes later without touching anything else.
 */
import { type Replica, type ReplicaEntity, XP_DROP_MS } from '@/client/replica';
import type { Biome, ItemGroup, Terrain } from '@/types/content';
import type { ItemId, NodeId, NpcId, ShopId, SkillId, StationId, TraderId, ZoneId } from '@/types/ids';
import { type Cell, type Dir, type Grid, inBounds, type PlacedObject } from '@/world/grid';

export interface SceneContent {
  zone(id: ZoneId): { name: string };
  npc(id: NpcId): { name: string };
  node(id: NodeId): { name: string; skill: SkillId };
  shop(id: ShopId): { name: string };
  station(id: StationId): { name: string };
  trader(id: TraderId): { name: string };
  item(id: ItemId): { name: string; group: ItemGroup };
  hasItem(id: string): id is ItemId;
}

export type ClickButton = 'left' | 'right';

/** A colour per kind of item, for the ground and the bag alike. */
export const ITEM_COLORS: Readonly<Record<ItemGroup, string>> = {
  log: '#9a6a3a', ore: '#8a8f98', bar: '#d0b060', fish: '#6ab0e0', crop: '#e0c060', herb: '#70c070', hide: '#b08060',
  food: '#f09060', weapon: '#c8c8d0', armor: '#90a0b0', shield: '#7888a8', trinket: '#d8a8e8', tool: '#c08848', misc: '#a8a8a8',
};

/** World units per cell; the camera scales these up by a whole number. */
export const TILE = 16;
const MARKER_MS = 700;
const SELF_COLOR = '#7cc4ff';
const OUTLINE = '#1b1520';
const LABEL_RANGE = 3;

const TERRAIN_COLORS: Readonly<Record<Terrain, string>> = {
  grass: '#4f8a3c', path: '#b59a6a', tallgrass: '#3f7a30', flowers: '#5f9c48', dirt: '#7c6244', floor: '#8b8b90', bridge: '#8a6a3a',
  water: '#2f6fa8', rock: '#6b6f78', trees: '#2e5a2a', fence: '#4f8a3c', void: '#0b0a0d',
};

/** A tint per biome over the flat colours, so zones read differently. */
const BIOME_TINTS: Readonly<Record<Biome, Partial<Record<Terrain, string>>>> = {
  meadow: {},
  hills: { grass: '#7f8a4a', tallgrass: '#6a7a3a', flowers: '#8f9a58', trees: '#4f6a34', rock: '#7c6a55', fence: '#7f8a4a' },
  city: { grass: '#5b8a45', floor: '#9a9aa2', path: '#a99a80', fence: '#5b8a45' },
  forest: { grass: '#3c6e33', trees: '#1f4a22', tallgrass: '#2e5a28', path: '#8f7a58', fence: '#3c6e33' },
  cave: { grass: '#3f4a3a', rock: '#2f2a30', path: '#5a5048', water: '#1f3f5a', dirt: '#4a4038', fence: '#3f4a3a' },
  marsh: { grass: '#46603a', water: '#2a4f4a', trees: '#24402a', path: '#6a5a40', tallgrass: '#3a5030', fence: '#46603a' },
  mountain: { grass: '#6c7a6a', rock: '#7a7f88', trees: '#3a5a40', path: '#9a9a8a', water: '#3a6a9a', fence: '#6c7a6a' },
  ash: { grass: '#55504a', rock: '#4a3a3a', trees: '#3a3030', path: '#5a4a48', water: '#1a1f2a', dirt: '#3c3234', fence: '#55504a' },
  reach: { grass: '#4e4a66', rock: '#55506a', trees: '#3a3050', path: '#6a6280', water: '#3a4a8a', fence: '#4e4a66' },
};

const ROOFS = ['#a04030', '#3a6a9a', '#6a4a8a', '#8a6a2a', '#2a6a4a', '#8a3a5a', '#4a5a7a'];
/** Down, left, right, up. */
const FACING: readonly Cell[] = [{ x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }];

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A stable colour per name, so a player looks the same to everyone. */
export function colorFor(name: string): string {
  return `hsl(${hash(name.toLowerCase()) % 360} 62% 56%)`;
}

function terrainColor(biome: Biome, terrain: Terrain): string {
  return BIOME_TINTS[biome][terrain] ?? TERRAIN_COLORS[terrain];
}

export class OnlineScene {
  /** Called with the cell the player clicked, which button, and where on the page. */
  onClick: ((cell: Cell, button: ClickButton, screen: { x: number; y: number }) => void) | null = null;
  /** What the pointer is over, as a short label ("Chop Oak Tree"), or null for nothing worth saying. */
  labelAt: ((cell: Cell) => string | null) | null = null;
  private host!: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private grid: Grid | null = null;
  private ground: HTMLCanvasElement | null = null;
  private marker: { x: number; y: number; at: number } | null = null;
  private pointer: { x: number; y: number } | null = null;
  private hover: { cell: Cell; label: string } | null = null;
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
      const button: ClickButton = event.button === 2 ? 'right' : 'left';
      if (button === 'left') this.marker = { x: cell.x, y: cell.y, at: this.now };
      this.onClick?.(cell, button, { x: event.clientX, y: event.clientY });
    });
    this.canvas.addEventListener('pointermove', (event) => {
      const cell = this.cellAt(event.clientX, event.clientY);
      const label = cell ? this.labelAt?.(cell) ?? null : null;
      this.hover = cell && label ? { cell, label } : null;
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.hover = null;
    });
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
  }

  /** The zone to show; the replica's entities are drawn on it. */
  setMap(grid: Grid, biome: Biome): void {
    this.grid = grid;
    this.ground = renderGround(grid, biome);
    this.marker = null;
    this.hover = null;
  }

  /** Marks a cell as clicked, for a click that came through a menu. */
  mark(cell: Cell): void {
    this.marker = { x: cell.x, y: cell.y, at: this.now };
  }

  frame(now: number): void {
    this.now = now;
    if (!this.grid || !this.ground) return;
    if (this.canvas.width === 0) this.resize();
    this.draw(this.grid, this.ground);
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

  /** Locked on your own character, which stays in the middle of the view; the void shows past the map's edge. */
  private camera(grid: Grid): { x: number; y: number } {
    const viewW = this.canvas.clientWidth / this.scale;
    const viewH = this.canvas.clientHeight / this.scale;
    const self = this.replica.selfEntity;
    const at = self ? this.replica.positionAt(self, this.now) : { x: grid.spawn.x + 0.5, y: grid.spawn.y + 0.5 };
    const x = at.x * TILE - viewW / 2;
    const y = at.y * TILE - viewH / 2;
    return { x: Math.round(x * this.scale) / this.scale, y: Math.round(y * this.scale) / this.scale };
  }

  private draw(grid: Grid, ground: HTMLCanvasElement): void {
    const ctx = this.ctx;
    const cam = this.camera(grid);
    const k = this.dpr * this.scale;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = TERRAIN_COLORS.void;
    ctx.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    ctx.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(ground, 0, 0);
    drawExits(ctx, grid);
    this.drawMarker();
    for (const item of this.replica.items.values()) this.drawGroundItem(item.item, item.qty, item.x, item.y);

    const drawables: { y: number; draw: () => void }[] = [];
    for (const obj of grid.objects) {
      if (obj.def.kind === 'exit' || obj.def.kind === 'spawn' || obj.def.kind === 'monster') continue;
      drawables.push({ y: (obj.y + obj.h) * TILE, draw: () => this.drawObject(obj) });
    }
    for (const e of this.replica.entities.values()) {
      const at = this.replica.positionAt(e, this.now);
      const px = at.x * TILE - TILE / 2;
      const py = at.y * TILE - TILE / 2;
      drawables.push({ y: py + TILE + 0.5, draw: () => this.drawPlayer(e, px, py, at.dir, at.moving) });
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const d of drawables) d.draw();

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawOverlays(grid, cam);
  }

  private drawObject(obj: PlacedObject): void {
    const ctx = this.ctx;
    const x = obj.x * TILE;
    const y = obj.y * TILE;
    const def = obj.def;
    switch (def.kind) {
      case 'node': drawNode(ctx, x, y, this.content.node(def.id).skill, this.replica.depleted.has(obj.index)); break;
      case 'bank': drawChest(ctx, x, y); break;
      case 'shop': drawBuilding(ctx, x, y, ROOFS[hash(def.id) % ROOFS.length]!); break;
      case 'market': drawStall(ctx, x, y); break;
      case 'trader': drawCart(ctx, x, y); break;
      case 'station': drawStation(ctx, x, y, def.id, this.now); break;
      case 'npc': drawPerson(ctx, x, y, '#aab0bb', 0); break;
      case 'signpost': drawSignpost(ctx, x, y); break;
      default: break;
    }
  }

  private drawPlayer(e: ReplicaEntity, px: number, py: number, dir: Dir, moving: boolean): void {
    const ctx = this.ctx;
    const bob = moving ? Math.sin(this.now / 80) * 0.7 : 0;
    drawPerson(ctx, px, py + bob, colorFor(e.name), dir);
    if (e.id === this.replica.selfId) {
      ctx.strokeStyle = SELF_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px + TILE / 2, py + TILE / 2 + 1 + bob, 7.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (e.act) drawSwing(ctx, px + TILE / 2, py + TILE / 2 + 1, e.act, this.now);
  }

  /** An item lying on a cell: a small tilted square in the colour of its kind, with a count when it is a stack. */
  private drawGroundItem(itemId: string, qty: number, x: number, y: number): void {
    const ctx = this.ctx;
    const cx = x * TILE + TILE / 2;
    const cy = y * TILE + TILE / 2;
    const color = this.content.hasItem(itemId) ? ITEM_COLORS[this.content.item(itemId).group] : ITEM_COLORS.misc;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 3, 4, 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    box(ctx, -3, -3, 6, 6, color);
    ctx.restore();
    if (qty > 1) {
      ctx.fillStyle = '#f6f3ea';
      ctx.font = '600 6px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(String(qty), cx + 3, cy - 3);
      ctx.textAlign = 'center';
    }
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
    const me = this.replica.selfEntity ? this.replica.positionAt(this.replica.selfEntity, this.now) : null;
    const near = (obj: PlacedObject) => !!me && Math.abs(obj.x + obj.w / 2 - me.x) + Math.abs(obj.y + obj.h / 2 - me.y) <= LABEL_RANGE + obj.w;

    for (const obj of grid.objects) {
      const cx = sx((obj.x + obj.w / 2) * TILE);
      const def = obj.def;
      if (def.kind === 'exit') {
        const label = this.content.zone(def.zone).name;
        const above = obj.y === grid.height - 1;
        ctx.font = '600 11px system-ui, sans-serif';
        const half = ctx.measureText(label).width / 2 + 6;
        const lx = Math.max(half, Math.min(this.canvas.clientWidth - half, cx));
        text(ctx, label, lx, above ? sy(obj.y * TILE) - 4 : sy((obj.y + 1) * TILE) + 12, '#e4e6ea', 11);
      } else if (def.kind === 'npc') {
        text(ctx, this.content.npc(def.id).name, cx, sy(obj.y * TILE) - 5, '#c9ccd3', 10);
      } else if (near(obj)) {
        const label = def.kind === 'node' ? this.content.node(def.id).name : def.kind === 'shop' ? this.content.shop(def.id).name : def.kind === 'market' ? 'Market' : def.kind === 'trader' ? this.content.trader(def.id).name : def.kind === 'station' ? this.content.station(def.id).name : def.kind === 'bank' ? 'Bank' : null;
        if (label) text(ctx, label, cx, sy((obj.y + obj.h) * TILE) + 11, '#c9ccd3', 10);
      }
    }

    // Xp gains float up from your head.
    const selfAt = this.replica.selfEntity ? this.replica.positionAt(this.replica.selfEntity, this.now) : null;
    if (selfAt) {
      this.replica.xpDrops.forEach((drop, i) => {
        const age = (this.now - drop.at) / XP_DROP_MS;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - age * age);
        text(ctx, `+${drop.amount} ${drop.skill.charAt(0).toUpperCase()}${drop.skill.slice(1)}`, sx(selfAt.x * TILE), sy(selfAt.y * TILE - TILE) - 14 - age * 28 - i * 12, '#f0c674', 11, true);
        ctx.restore();
      });
    }

    if (this.hover) {
      ctx.textAlign = 'left';
      text(ctx, this.hover.label, 10, 18, '#f6f3ea', 12, true);
      ctx.textAlign = 'center';
    }

    const bubbles = new Map(this.replica.bubbles(this.now).map((b) => [b.id, b]));
    for (const e of this.replica.entities.values()) {
      const at = this.replica.positionAt(e, this.now);
      const cx = sx(at.x * TILE);
      const top = sy(at.y * TILE - TILE / 2);
      const isSelf = e.id === this.replica.selfId;
      text(ctx, e.name, cx, top - 5, isSelf ? SELF_COLOR : '#e4e6ea', 11, isSelf);
      const bubble = bubbles.get(e.id);
      if (bubble) this.drawBubble(bubble.text, cx, top - 20, (this.now - bubble.at) / 1000);
    }
  }

  private drawBubble(line: string, cx: number, bottom: number, ageSeconds: number): void {
    const ctx = this.ctx;
    ctx.font = '600 12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    const width = Math.min(260, ctx.measureText(line).width + 14);
    const lines = wrap(ctx, line, width - 14);
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
    ctx.fillStyle = OUTLINE;
    ctx.textAlign = 'left';
    lines.forEach((l, i) => ctx.fillText(l, x + 7, y + 6 + (i + 1) * lineHeight - 4));
    ctx.textAlign = 'center';
    ctx.restore();
  }
}

// ---- the ground --------------------------------------------------------------------

/** The whole ground of a zone as one image: a flat colour per cell with a little texture per terrain. */
function renderGround(grid: Grid, biome: Biome): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = grid.width * TILE;
  canvas.height = grid.height * TILE;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const terrain = grid.terrain[y * grid.width + x]!;
      const px = x * TILE;
      const py = y * TILE;
      ctx.fillStyle = terrainColor(biome, terrain);
      ctx.fillRect(px, py, TILE, TILE);
      switch (terrain) {
        case 'grass': case 'tallgrass': case 'flowers':
          if ((x + y) % 2 === 0) { ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'; ctx.fillRect(px, py, TILE, TILE); }
          if (terrain === 'flowers') { ctx.fillStyle = '#e85a7a'; dot(ctx, px + 4, py + 5, 1.2); dot(ctx, px + 11, py + 10, 1.2); dot(ctx, px + 9, py + 3, 1); }
          if (terrain === 'tallgrass') { ctx.fillStyle = 'rgba(0, 0, 0, 0.12)'; ctx.fillRect(px + 2, py + 9, 2, 5); ctx.fillRect(px + 7, py + 7, 2, 7); ctx.fillRect(px + 12, py + 10, 2, 4); }
          break;
        case 'water':
          ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
          ctx.fillRect(px + ((x * 5 + y * 3) % 6), py + 4 + ((x + y) % 2) * 6, 6, 1);
          break;
        case 'trees':
          ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
          dot(ctx, px + 8, py + 8, 6);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
          dot(ctx, px + 6, py + 6, 2.5);
          break;
        case 'rock':
          ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
          ctx.fillRect(px + 2, py + 2, TILE - 4, TILE - 4);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.fillRect(px + 3, py + 3, 5, 3);
          break;
        case 'fence':
          ctx.fillStyle = '#6e4a2a';
          ctx.fillRect(px, py + 5, TILE, 2);
          ctx.fillRect(px, py + 10, TILE, 2);
          ctx.fillRect(px + 7, py + 3, 2, 11);
          break;
        case 'bridge':
          ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
          for (let i = 3; i < TILE; i += 4) ctx.fillRect(px, py + i, TILE, 1);
          break;
        case 'floor':
          ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
          ctx.fillRect(px, py, TILE, 1);
          ctx.fillRect(px, py, 1, TILE);
          break;
        default:
          break;
      }
    }
  }
  return canvas;
}

/** Pale arrows on the edge cells that lead to another zone. */
function drawExits(ctx: CanvasRenderingContext2D, grid: Grid): void {
  for (const obj of grid.objects) {
    if (obj.def.kind !== 'exit') continue;
    const x = obj.x * TILE;
    const y = obj.y * TILE;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    const cx = x + TILE / 2;
    const cy = y + TILE / 2;
    ctx.beginPath();
    if (obj.x === 0) { ctx.moveTo(cx + 3, cy - 4); ctx.lineTo(cx - 3, cy); ctx.lineTo(cx + 3, cy + 4); }
    else if (obj.x === grid.width - 1) { ctx.moveTo(cx - 3, cy - 4); ctx.lineTo(cx + 3, cy); ctx.lineTo(cx - 3, cy + 4); }
    else if (obj.y === 0) { ctx.moveTo(cx - 4, cy + 3); ctx.lineTo(cx, cy - 3); ctx.lineTo(cx + 4, cy + 3); }
    else { ctx.moveTo(cx - 4, cy - 3); ctx.lineTo(cx, cy + 3); ctx.lineTo(cx + 4, cy - 3); }
    ctx.closePath();
    ctx.fill();
  }
}

// ---- shapes ------------------------------------------------------------------------

function dot(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string, stroke = OUTLINE): void {
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, stroke: string | null = OUTLINE): void {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
}

/** A person is a disc with a shadow and a dot for the way it faces: players and the people of the village alike. */
function drawPerson(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, dir: Dir): void {
  const cx = x + TILE / 2;
  const cy = y + TILE / 2 + 1;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, y + TILE - 1.5, 5, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  disc(ctx, cx, cy, 6, color);
  const f = FACING[dir]!;
  ctx.fillStyle = '#f6f3ea';
  dot(ctx, cx + f.x * 3.5, cy + f.y * 3.5, 1.6);
}

function drawNode(ctx: CanvasRenderingContext2D, x: number, y: number, skill: SkillId, depleted: boolean): void {
  if (depleted) {
    // A stump, a hollow, bare rows: the node is spent until it comes back.
    switch (skill) {
      case 'woodcutting': disc(ctx, x + 8, y + 10, 4, '#7a5a34'); ctx.fillStyle = '#a8824a'; dot(ctx, x + 8, y + 10, 2); return;
      case 'mining': disc(ctx, x + 8, y + 10, 5, '#55585f'); return;
      case 'fishing': return;
      default: box(ctx, x + 2, y + 2, 12, 12, '#8a6a44'); ctx.fillStyle = '#6a4a2a'; for (let i = 4; i < 14; i += 3) ctx.fillRect(x + 3, y + i, 10, 1); return;
    }
  }
  switch (skill) {
    case 'woodcutting':
      box(ctx, x + 6, y + 8, 4, 8, '#5e4526', null);
      disc(ctx, x + 8, y + 6, 6.5, '#2f6a2a');
      ctx.fillStyle = '#3f8a38';
      dot(ctx, x + 7, y + 5, 3.5);
      return;
    case 'mining':
      disc(ctx, x + 8, y + 9.5, 6, '#7a7f88');
      ctx.fillStyle = '#a0a6b0';
      dot(ctx, x + 6, y + 8, 2.2);
      return;
    case 'fishing':
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x + 8, y + 8, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 8, y + 8, 2.5, 0, Math.PI * 2);
      ctx.stroke();
      return;
    case 'farming':
      box(ctx, x + 2, y + 2, 12, 12, '#c4a878');
      ctx.fillStyle = '#8a6a2a';
      for (let i = 4; i < 14; i += 3) ctx.fillRect(x + 3, y + i, 10, 1);
      return;
    default:
      ctx.fillStyle = '#5fa050';
      dot(ctx, x + 5, y + 10, 2.5);
      dot(ctx, x + 10, y + 7, 2.5);
      dot(ctx, x + 11, y + 12, 2);
      return;
  }
}

/** A 2×2 building: wall, roof band, windows, door. */
function drawBuilding(ctx: CanvasRenderingContext2D, x: number, y: number, roof: string): void {
  box(ctx, x + 2, y + 10, 28, 20, '#c9b48a');
  box(ctx, x, y + 3, 32, 9, roof);
  box(ctx, x + 13, y + 20, 6, 10, '#5e4526');
  box(ctx, x + 5, y + 15, 5, 5, '#8fc7ea');
  box(ctx, x + 22, y + 15, 5, 5, '#8fc7ea');
}

/** The market: a striped awning over a counter. */
function drawStall(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  box(ctx, x + 4, y + 16, 24, 11, '#8a6a3a');
  box(ctx, x + 2, y + 6, 28, 9, '#f0e6d2');
  ctx.fillStyle = '#d84a20';
  for (let i = 2; i < 30; i += 8) ctx.fillRect(x + i, y + 6, 4, 9);
}

function drawCart(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  box(ctx, x + 2, y + 5, 12, 6, '#8a6a3a');
  disc(ctx, x + 5, y + 12, 2.5, '#5e4526');
  disc(ctx, x + 11, y + 12, 2.5, '#5e4526');
}

function drawStation(ctx: CanvasRenderingContext2D, x: number, y: number, id: StationId, now: number): void {
  switch (id) {
    case 'campfire': {
      box(ctx, x + 3, y + 11, 10, 3, '#5e4526');
      const flicker = Math.floor(now / 160) % 2;
      ctx.fillStyle = '#f08a2a';
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 2 + flicker);
      ctx.lineTo(x + 12, y + 11);
      ctx.lineTo(x + 4, y + 11);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f6d24a';
      dot(ctx, x + 8, y + 9, 2);
      return;
    }
    case 'furnace':
      box(ctx, x + 2, y + 3, 12, 12, '#55555e');
      box(ctx, x + 5, y + 8, 6, 5, Math.floor(now / 300) % 2 ? '#f08a2a' : '#d8601a', null);
      return;
    case 'anvil':
      box(ctx, x + 5, y + 10, 6, 4, '#3a3a42');
      box(ctx, x + 2, y + 6, 12, 4, '#55555e');
      return;
    case 'sawbench':
      box(ctx, x + 2, y + 6, 12, 4, '#a8824a');
      box(ctx, x + 3, y + 10, 2, 5, '#5e4526', null);
      box(ctx, x + 11, y + 10, 2, 5, '#5e4526', null);
      return;
    case 'tannery':
      box(ctx, x + 2, y + 3, 12, 12, '#5e4526');
      box(ctx, x + 4, y + 5, 8, 8, '#c49a6a', null);
      return;
    default:
      box(ctx, x + 3, y + 3, 10, 10, '#8b8b90');
      return;
  }
}

function drawSignpost(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  box(ctx, x + 7, y + 7, 2, 8, '#5e4526', null);
  box(ctx, x + 3, y + 3, 10, 5, '#a8824a');
}

/** The bank: a chest with a brass band. */
function drawChest(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  box(ctx, x + 2, y + 5, 12, 9, '#8a5a2a');
  box(ctx, x + 2, y + 3, 12, 4, '#a8702a');
  box(ctx, x + 7, y + 7, 2, 3, '#e0c060', null);
}

/** A tool swinging between a worker and the thing worked on: a short line that rocks back and forth. */
function drawSwing(ctx: CanvasRenderingContext2D, cx: number, cy: number, target: Cell, now: number): void {
  const tx = target.x * TILE + TILE / 2;
  const ty = target.y * TILE + TILE / 2;
  const base = Math.atan2(ty - cy, tx - cx);
  const angle = base + Math.sin(now / 110) * 0.7;
  ctx.strokeStyle = '#c08848';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(angle) * 4, cy + Math.sin(angle) * 4);
  ctx.lineTo(cx + Math.cos(angle) * 10, cy + Math.sin(angle) * 10);
  ctx.stroke();
  ctx.fillStyle = '#c8c8d0';
  dot(ctx, cx + Math.cos(angle) * 10, cy + Math.sin(angle) * 10, 1.8);
}

/** Crisp text with a dark outline, in screen space. */
function text(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, color: string, size: number, bold = false): void {
  ctx.font = `${bold ? '800' : '600'} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(10, 10, 14, 0.85)';
  ctx.strokeText(label, Math.round(x), Math.round(y));
  ctx.fillStyle = color;
  ctx.fillText(label, Math.round(x), Math.round(y));
}

/** Greedy word wrap for a bubble. */
function wrap(ctx: CanvasRenderingContext2D, line: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of line.split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) current = candidate;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}
