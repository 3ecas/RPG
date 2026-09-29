/** Colours: biome grounds, material tints for gathering spots, who wears what. Presentation only. */
import type { Biome } from '@/types/content';
import type { MonsterId, NodeId, SkillId } from '@/types/ids';
import {
  type BiomePalette, COW, CULTIST, DRAGON, GOBLIN, HARPY, type HumanColors, OUTLINE, type PixelArt, RAT, recolor, SKELETON, SLIME, SPIDER, WOLF,
} from './art';

const base: BiomePalette = {
  a: '#4f8a3c', b: '#5f9c48', c: '#3f7a30', f: '#e85a7a', w: '#2f6fa8', v: '#5da2d8', p: '#b59a6a', q: '#c4a878', d: '#7c6244', e: '#8f7350', o: '#8b8b90', l: '#6e6e74',
  n: '#8a6a3a', m: '#5e4526', r: '#6b6f78', s: '#4f535c', t: '#8a8f99', g: '#2e5a2a', h: '#3c7236', k: '#1e3a1c', z: '#0b0a0d',
};

export const BIOME_PALETTES: Readonly<Record<Biome, BiomePalette>> = {
  meadow: base,
  hills: { ...base, a: '#7f8a4a', b: '#8f9a58', c: '#6a7a3a', p: '#b9a27a', q: '#c9b48a', r: '#7c6a55', s: '#5f5040', t: '#9a8770', g: '#4f6a34', h: '#5e7c40', d: '#8a6f4e', e: '#9a7f5e' },
  city: { ...base, a: '#5b8a45', b: '#6a9a52', p: '#a99a80', q: '#b8a990', o: '#9a9aa2', l: '#7a7a84', r: '#6a6a72', s: '#4e4e56', t: '#8a8a92' },
  forest: { ...base, a: '#3c6e33', b: '#4a8040', c: '#2e5a28', p: '#8f7a58', q: '#9e8a66', g: '#1f4a22', h: '#2c5f2e', k: '#142e16', w: '#2b5f8a', v: '#4f8ab8' },
  cave: { ...base, a: '#3f4a3a', b: '#4a5644', d: '#4a4038', e: '#5a4e44', r: '#2f2a30', s: '#221e24', t: '#4a4450', w: '#1f3f5a', v: '#3a6a8a', p: '#5a5048', q: '#6a6058' },
  marsh: { ...base, a: '#46603a', b: '#55704a', c: '#3a5030', d: '#4a3f2c', e: '#5a4e38', w: '#2a4f4a', v: '#3f746e', g: '#24402a', h: '#305236', k: '#16281a', p: '#6a5a40', q: '#7a6a50' },
  mountain: { ...base, a: '#6c7a6a', b: '#7c8a7a', c: '#5a6a58', r: '#7a7f88', s: '#5c616a', t: '#a0a6b0', w: '#3a6a9a', v: '#6a9ac8', g: '#3a5a40', h: '#4a6c50', p: '#9a9a8a', q: '#aaaa9a' },
  ash: { ...base, a: '#55504a', b: '#635d56', c: '#454038', d: '#3c3234', e: '#4a3e40', r: '#4a3a3a', s: '#3a2a2a', t: '#6a5a5a', w: '#1a1f2a', v: '#2a3a4a', g: '#3a3030', h: '#4a3c3c', p: '#5a4a48', q: '#6a5a58', f: '#c04040' },
  reach: { ...base, a: '#4e4a66', b: '#5c5878', c: '#3e3a56', r: '#55506a', s: '#3e3a52', t: '#7a748f', w: '#3a4a8a', v: '#5a6ab8', g: '#3a3050', h: '#4a4064', k: '#221c30', p: '#6a6280', q: '#7a7290', f: '#e0a0ff' },
};

/** Roof colours for houses, by shop id. Unknown shops get the first. */
const ROOFS = ['#a04030', '#3a6a9a', '#6a4a8a', '#8a6a2a', '#2a6a4a', '#8a3a5a', '#4a5a7a'];

export function roofFor(id: string): string {
  return ROOFS[hash(id) % ROOFS.length]!;
}

const TUNICS = ['#a03a3a', '#3a7a4a', '#6a4a9a', '#2a7a8a', '#c06a2a', '#6a6a72', '#8a7a2a', '#3a4a9a'];
const HAIRS = ['#5a3a1e', '#1e1a18', '#c8a050', '#8a8a90', '#8a3a1e', '#3a2a1a'];

/** A deterministic outfit per person, so the same face greets you every time. */
export function humanColorsFor(id: string): HumanColors {
  const h = hash(id);
  return { hair: HAIRS[h % HAIRS.length]!, skin: h % 3 === 0 ? '#d8a878' : '#f0c8a0', tunic: TUNICS[(h >>> 3) % TUNICS.length]!, pants: '#4a3b2a', boots: '#3a2a1a', belt: '#8a6a2a' };
}

export interface MonsterStyle {
  art: PixelArt;
  /** Drawn bigger than a tile for the big ones. */
  scale: number;
}

export const MONSTER_ART: Readonly<Record<MonsterId, MonsterStyle>> = {
  rat: { art: RAT, scale: 1 },
  cow: { art: COW, scale: 1 },
  goblin: { art: GOBLIN, scale: 1 },
  wolf: { art: WOLF, scale: 1 },
  bandit: { art: recolor(GOBLIN, { g: '#f0c8a0', d: '#3a3a44', l: '#8a2a2a', e: '#20202a' }), scale: 1 },
  cave_spider: { art: SPIDER, scale: 1 },
  skeleton: { art: SKELETON, scale: 1 },
  bear: { art: recolor(WOLF, { g: '#6a4a2a', t: '#5a3a1a', e: '#20202a' }), scale: 1.25 },
  bog_lurker: { art: SLIME, scale: 1.1 },
  troll: { art: recolor(GOBLIN, { g: '#7a8a7a', d: '#4a4a3a', e: '#f0d040' }), scale: 1.5 },
  harpy: { art: HARPY, scale: 1.1 },
  wyvern: { art: recolor(DRAGON, { g: '#8a3a2a', t: '#6a2a1a' }), scale: 1.5 },
  cultist: { art: CULTIST, scale: 1 },
  drake: { art: DRAGON, scale: 1.6 },
  lich: { art: recolor(SKELETON, { w: '#dcd8ff', e: '#7a2aff' }), scale: 1.25 },
};

export interface NodeStyle {
  kind: 'tree' | 'rock' | 'fishing' | 'field' | 'patch';
  palette: Readonly<Record<string, string>>;
}

const WOOD: Record<string, [string, string]> = {
  oak: ['#3d7a35', '#2c5c28'], willow: ['#6a9a4a', '#4e7c36'], maple: ['#c8602a', '#a04420'], yew: ['#2a5a3a', '#1c402a'], ash: ['#8a9a8a', '#6a7a6a'], elder: ['#6a4a9a', '#4a2e7a'],
};
const ORE: Record<string, string> = { copper: '#d08a3a', tin: '#c8ccd8', iron: '#a05a3a', coal: '#1e1a1e', mithril: '#5a8aff', adamant: '#3aa060', rune: '#b060ff' };
const CROP: Record<string, [string, string]> = {
  wheat: ['#d8b640', '#e8c850'], potato: ['#5a8a3a', '#8a6a3a'], carrot: ['#5a9a3a', '#e87a2a'], cabbage: ['#7ab060', '#9acc80'], pumpkin: ['#4a8a3a', '#e88a20'], sunfruit: ['#5a9a4a', '#f0d040'],
};
const HERB: Record<string, [string, string]> = {
  nettle: ['#4f8a3c', '#6aa050'], sage: ['#7a9a7a', '#c8d8c8'], lavender: ['#5a7a4a', '#a070e0'], bloodroot: ['#4a6a3a', '#d02020'], moonflower: ['#5a6a7a', '#f0f0ff'], dragonleaf: ['#2a7a6a', '#40e0c0'],
};

/** Which sprite a gathering spot uses, tinted by its material (from the node id). */
export function NODE_STYLE(id: NodeId, skill: SkillId): NodeStyle {
  const material = id.replace(/_(tree|rock|seam|spot|field|patch)$/, '');
  switch (skill) {
    case 'woodcutting': { const [c, d] = WOOD[material] ?? WOOD.oak!; return { kind: 'tree', palette: { c, d } }; }
    case 'mining': return { kind: 'rock', palette: { o: ORE[material] ?? ORE.copper!, ...(material === 'coal' ? { g: '#5a5a62', d: '#3a3a40' } : {}) } };
    case 'fishing': return { kind: 'fishing', palette: {} };
    case 'farming': { const [c, o] = CROP[material] ?? CROP.wheat!; return { kind: 'field', palette: { c, o } }; }
    default: { const [g, f] = HERB[material] ?? HERB.nettle!; return { kind: 'patch', palette: { g, f } }; }
  }
}

export const MARKER_COLORS = { quest: '#f0c674', ready: '#98c379', lock: '#e06c75', outline: OUTLINE } as const;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
