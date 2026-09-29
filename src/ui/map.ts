/**
 * The zone map: an SVG scene with one marker per thing you can interact with.
 * Markers carry data-action="poi" and open a window (or start a fight).
 */
import type { ZoneId } from '@/types/ids';
import { html, type Raw } from './html';
import { MONSTER_ICONS, NODE_ICONS, PLACE_ICONS, STATION_ICONS } from './icons';
import type { ViewContext } from './panel';

const W = 1000;
const H = 560;

interface Theme { ground: string; hill: string; accent: string; label: string }

const THEMES: Partial<Record<ZoneId, Theme>> & { default: Theme } = {
  default: { ground: '#1e2a22', hill: '#27392d', accent: '#4f9ee6', label: 'Wilds' },
  greenhollow: { ground: '#1f2d20', hill: '#2b3f2c', accent: '#98c379', label: 'Village' },
  copper_hills: { ground: '#2c261c', hill: '#3b3222', accent: '#e0a458', label: 'Hills' },
  whispering_woods: { ground: '#17241b', hill: '#1f3325', accent: '#6fb37a', label: 'Woods' },
  old_iron_mines: { ground: '#23252b', hill: '#2f323a', accent: '#8b93a1', label: 'Mines' },
  blackfen_marsh: { ground: '#1d2620', hill: '#27342b', accent: '#7f9c6b', label: 'Marsh' },
  grey_peaks: { ground: '#232a33', hill: '#2f3946', accent: '#9fb4d1', label: 'Peaks' },
  ashen_wastes: { ground: '#2a2020', hill: '#3a2a2a', accent: '#e06c75', label: 'Wastes' },
  dragons_reach: { ground: '#241f2e', hill: '#33293f', accent: '#c678dd', label: 'Reach' },
};

type PoiState = 'ok' | 'active' | 'locked' | 'tier';

interface Poi {
  kind: 'node' | 'station' | 'shop' | 'market' | 'trader' | 'npc' | 'monster' | 'signpost';
  id: string;
  label: string;
  icon: string;
  x: number;
  y: number;
  state: PoiState;
  badge?: string;
  title: string;
  /** Present when the marker shows a progress bar; the fraction is applied in place by the app. */
  progress?: boolean;
}

/** Deterministic pseudo-random in [0, 1) from a string, for decoration only. */
function hash01(text: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

export function renderMap(view: ViewContext): Raw {
  const { game } = view;
  const state = game.state;
  const zone = game.content.zone(state.player.zoneId);
  const theme = THEMES[zone.id] ?? THEMES.default;
  const activity = state.activity;
  const pois: Poi[] = [];

  // Wilds: gathering nodes down the left side.
  zone.nodes.forEach((id, i) => {
    const node = game.content.node(id);
    const can = game.canGather(id);
    const active = activity?.kind === 'gather' && activity.nodeId === id;
    const tierShort = game.skillTier(node.skill) < node.tier;
    pois.push({
      kind: 'node', id, label: node.name, icon: NODE_ICONS[node.skill] ?? '•',
      x: 110 + (i % 2) * 120, y: 95 + i * 88,
      state: active ? 'active' : tierShort ? 'tier' : 'ok',
      badge: tierShort ? `T${node.tier}` : undefined,
      title: active ? 'In progress. Click to open.' : can.ok ? `${game.content.skill(node.skill).verb} here` : can.reason,
      progress: active,
    });
  });

  // Settlement: stations, shops, market, traders, people in a cluster in the middle.
  const settlement: Omit<Poi, 'x' | 'y'>[] = [];
  for (const id of zone.stations) {
    const station = game.content.station(id);
    const active = activity?.kind === 'craft' && game.content.recipe(activity.recipeId).station === id;
    settlement.push({ kind: 'station', id, label: station.name, icon: STATION_ICONS[id], state: active ? 'active' : 'ok', title: station.description, progress: active });
  }
  for (const id of zone.shops) settlement.push({ kind: 'shop', id, label: game.content.shop(id).name, icon: PLACE_ICONS.shop, state: 'ok', title: game.content.shop(id).description });
  if (zone.market) {
    const locked = !game.hasFeature('market');
    settlement.push({ kind: 'market', id: 'market', label: 'Market', icon: PLACE_ICONS.market, state: locked ? 'locked' : 'ok', badge: locked ? '🔒' : undefined, title: locked ? 'Unlock Market Access in the Progression tree.' : 'Buy and sell at moving prices.' });
  }
  for (const id of zone.traders) {
    const locked = !game.hasFeature('traders');
    settlement.push({ kind: 'trader', id, label: game.content.trader(id).name, icon: PLACE_ICONS.trader, state: locked ? 'locked' : 'ok', badge: locked ? '🔒' : undefined, title: locked ? 'Unlock Barter in the Progression tree.' : game.content.trader(id).title });
  }
  for (const id of zone.npcs) {
    const npc = game.content.npc(id);
    const quests = game.questsByGiver(id);
    const ready = quests.some((q) => q.status === 'active' && game.canTurnIn(q.quest.id).ok);
    const available = quests.some((q) => q.status === 'available');
    settlement.push({ kind: 'npc', id, label: npc.name, icon: PLACE_ICONS.npc, state: 'ok', badge: ready ? '❗' : available ? '❕' : undefined, title: `${npc.name}, ${npc.title}` });
  }
  const cols = 3;
  settlement.forEach((poi, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    pois.push({ ...poi, x: 400 + col * 120 + (row % 2) * 30, y: 105 + row * 92 });
  });

  // Hunting grounds: monsters down the right side.
  zone.monsters.forEach((id, i) => {
    const monster = game.content.monster(id);
    const active = state.combat?.monsterId === id && activity?.kind === 'combat';
    pois.push({
      kind: 'monster', id, label: monster.name, icon: MONSTER_ICONS[id] ?? PLACE_ICONS.monster,
      x: 830 + (i % 2) * 110, y: 95 + i * 95,
      state: active ? 'active' : 'ok',
      badge: `T${monster.tier}`,
      title: active ? 'Fighting. Click to open.' : `Attack the ${monster.name} (${monster.hp} hp)`,
      progress: active,
    });
  });

  // Signpost to the world map.
  pois.push({ kind: 'signpost', id: 'zones', label: 'World map', icon: PLACE_ICONS.signpost, x: 500, y: H - 60, state: 'ok', title: 'Travel to another zone' });

  const decorations = Array.from({ length: 9 }, (_, i) => {
    const cx = 60 + hash01(zone.id, i * 7) * (W - 120);
    const cy = 60 + hash01(zone.id, i * 13 + 1) * (H - 120);
    const rx = 60 + hash01(zone.id, i * 3 + 2) * 120;
    return html`<ellipse cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" rx="${rx.toFixed(0)}" ry="${(rx * 0.45).toFixed(0)}" fill="${theme.hill}" opacity="0.7"/>`;
  });

  return html`<svg class="map-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${zone.name}">
    <rect width="${W}" height="${H}" fill="${theme.ground}"/>
    ${decorations}
    <path d="M 230 ${H - 40} Q 500 ${H - 120} 780 ${H - 40}" stroke="${theme.accent}" stroke-opacity="0.25" stroke-width="6" fill="none" stroke-dasharray="14 12"/>
    <text x="24" y="34" class="map-title">${zone.name}</text>
    <text x="24" y="54" class="map-sub">${zone.description}</text>
    ${zone.nodes.length ? html`<text x="110" y="${H - 22}" class="map-region">Wilds</text>` : ''}
    ${settlement.length ? html`<text x="${zone.npcs.length ? 470 : 470}" y="${H - 22}" class="map-region">${zone.npcs.length ? 'Settlement' : 'Camp'}</text>` : ''}
    ${zone.monsters.length ? html`<text x="850" y="${H - 22}" class="map-region">Hunting grounds</text>` : ''}
    ${pois.map((poi) => html`<g class="poi poi-${poi.state}" transform="translate(${poi.x},${poi.y})" data-action="poi" data-kind="${poi.kind}" data-id="${poi.id}" tabindex="0" role="button" aria-label="${poi.label}">
      <title>${poi.title}</title>
      ${poi.state === 'active' ? html`<circle r="34" class="poi-glow"/>` : ''}
      <circle r="27" class="poi-bg"/>
      <text y="9" text-anchor="middle" class="poi-icon">${poi.icon}</text>
      <text y="46" text-anchor="middle" class="poi-label">${poi.label}</text>
      ${poi.badge ? html`<g transform="translate(20,-20)"><circle r="11" class="poi-badge-bg"/><text y="4" text-anchor="middle" class="poi-badge">${poi.badge}</text></g>` : ''}
      ${poi.progress ? html`<rect x="-26" y="52" width="52" height="5" rx="2" class="poi-track"/><rect x="-26" y="52" width="0" height="5" rx="2" class="poi-fill" data-poi="${poi.kind}:${poi.id}"/>` : ''}
    </g>`)}
  </svg>`;
}

/** Current fill fraction of every marker progress bar, keyed like the markers' data-poi. */
export function mapProgress(view: ViewContext): Record<string, number> {
  const { game } = view;
  const a = game.state.activity;
  const out: Record<string, number> = {};
  if (!a) return out;
  const progress = game.activityView()?.progress ?? 0;
  if (a.kind === 'gather') out[`node:${a.nodeId}`] = progress;
  if (a.kind === 'craft') out[`station:${game.content.recipe(a.recipeId).station}`] = progress;
  if (a.kind === 'combat' && game.state.combat) out[`monster:${game.state.combat.monsterId}`] = game.state.combat.monsterHp / game.content.monster(game.state.combat.monsterId).hp;
  return out;
}
