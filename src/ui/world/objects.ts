/**
 * Sprites and markers for the things placed on a zone map, shared by the
 * single-player scene and the online scene. Pure drawing: content decides the
 * look, nothing here decides a rule.
 */
import type { NodeId, SkillId } from '@/types/ids';
import type { Grid, PlacedObject } from '@/world/grid';
import { ANVIL, CAMPFIRE, CART, FIELD, FISHING_SPOT, FURNACE, house, human, PATCH, type PixelArt, recolor, ROCK, SAWBENCH, SIGNPOST, stall, TANNERY, TREE } from './art';
import { humanColorsFor, NODE_STYLE, roofFor } from './palettes';
import { sprite, TILE } from './sprites';

/** What the object renderer needs from content: which skill a gathering spot trains. */
export interface ObjectContent {
  node(id: NodeId): { skill: SkillId };
}

/** The cached sprite for a placed object, or null for things drawn as ground (exits, the spawn, monster spots). */
export function objectSprite(content: ObjectContent, obj: PlacedObject, now: number): HTMLCanvasElement | null {
  const def = obj.def;
  switch (def.kind) {
    case 'node': {
      const style = NODE_STYLE(def.id, content.node(def.id).skill);
      const base: PixelArt = style.kind === 'tree' ? TREE : style.kind === 'rock' ? ROCK : style.kind === 'fishing' ? FISHING_SPOT : style.kind === 'field' ? FIELD : PATCH;
      return sprite(`node:${def.id}`, () => recolor(base, style.palette));
    }
    case 'station': {
      const frame = Math.floor(now / 320) % 2;
      switch (def.id) {
        case 'campfire': return sprite(`campfire:${frame}`, () => CAMPFIRE[frame]!);
        case 'furnace': return sprite(`furnace:${frame}`, () => FURNACE[frame]!);
        case 'anvil': return sprite('anvil', () => ANVIL);
        case 'sawbench': return sprite('sawbench', () => SAWBENCH);
        case 'tannery': return sprite('tannery', () => TANNERY);
      }
      return null;
    }
    case 'shop': return sprite(`house:${def.id}`, () => house(roofFor(def.id)));
    case 'market': return sprite('stall', () => stall('#d84a20'));
    case 'trader': return sprite('cart', () => CART);
    case 'npc': return sprite(`npc:${def.id}`, () => human('down', 0, humanColorsFor(def.id)));
    case 'signpost': return sprite('signpost', () => SIGNPOST);
    default: return null;
  }
}

/** Pale arrows on the edge cells that lead to another zone. Drawn in world space. */
export function drawExitMarkers(ctx: CanvasRenderingContext2D, grid: Grid): void {
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

/** Crisp text with a dark outline, in screen space. */
export function outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, size: number, bold = false): void {
  ctx.font = `${bold ? '800' : '600'} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(10, 10, 14, 0.85)';
  ctx.strokeText(text, Math.round(x), Math.round(y));
  ctx.fillStyle = color;
  ctx.fillText(text, Math.round(x), Math.round(y));
}
