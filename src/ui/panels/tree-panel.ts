import { BRANCHES } from '@/content/progression';
import type { ProgressNodeDef } from '@/types/content';
import { attr, html, type Raw } from '../html';
import { type IconName, icon, iconUse } from '../icons';
import type { Panel, ViewContext } from '../panel';

const COL = 118;
const ROW = 72;
const R = 22;

function nodeIcon(node: ProgressNodeDef): IconName {
  const first = node.unlocks[0];
  if (!first) return 'dot';
  switch (first.type) {
    case 'zone': return 'map';
    case 'feature': return first.feature === 'market' ? 'scales' : first.feature === 'traders' ? 'cart' : first.feature === 'auto_eat' ? 'utensils' : 'crossed';
    case 'perk': return first.perk === 'inventory_slots' ? 'backpack' : first.perk === 'max_hp' ? 'heart' : first.perk === 'gold_find' || first.perk === 'sell_bonus' ? 'coins' : first.perk.endsWith('_xp') ? 'trend' : 'bolt';
  }
}

/** One branch drawn as a graph: columns by depth, edges from parents. */
function branchGraph(view: ViewContext, branch: (typeof BRANCHES)[number]): Raw {
  const { game, ui } = view;
  const nodes = game.content.progressNodeIds
    .map((id) => game.progressNodeView(id))
    .filter((v) => v.node.branch === branch.id)
    .sort((a, b) => a.depth - b.depth || a.node.cost - b.node.cost || a.node.name.localeCompare(b.node.name));
  const byDepth = new Map<number, typeof nodes>();
  for (const n of nodes) byDepth.set(n.depth, [...(byDepth.get(n.depth) ?? []), n]);
  const maxDepth = Math.max(...nodes.map((n) => n.depth));
  const rows = Math.max(...[...byDepth.values()].map((c) => c.length));
  const width = 60 + (maxDepth + 1) * COL;
  const height = Math.max(150, rows * ROW + 50);
  const pos = new Map<string, { x: number; y: number }>();
  for (const [depth, column] of byDepth) {
    column.forEach((n, i) => pos.set(n.node.id, { x: 50 + depth * COL, y: height / 2 - 10 + (i - (column.length - 1) / 2) * ROW }));
  }
  const edges = nodes.flatMap((n) =>
    n.node.requires.flatMap((parent) => {
      const a = pos.get(parent);
      const b = pos.get(n.node.id);
      if (!a || !b) return [];
      const mid = (a.x + b.x) / 2;
      const lit = n.status === 'unlocked' ? 'edge-on' : n.status === 'available' ? 'edge-ready' : '';
      return [html`<path class="edge ${lit}" d="M ${a.x + R} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x - R} ${b.y}"/>`];
    }),
  );
  return html`<svg class="tree-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMinYMid meet" style="aspect-ratio:${width}/${height}">
    ${edges}
    ${nodes.map((n) => {
      const p = pos.get(n.node.id)!;
      return html`<g class="tnode tnode-${n.status} ${ui.selectedNode === n.node.id ? 'tnode-selected' : ''}" transform="translate(${p.x},${p.y})" data-action="select-node" data-id="${n.node.id}" tabindex="0" role="button" aria-label="${n.node.name}">
        <title>${n.node.name}: ${n.node.description}</title>
        <circle r="${R}" class="tnode-bg"/>
        ${iconUse(nodeIcon(n.node), 22, 'tnode-icon')}
        <text y="${R + 14}" text-anchor="middle" class="tnode-label">${n.node.name}</text>
        ${n.status === 'unlocked' ? html`<g transform="translate(16,-16)"><circle r="8" class="tnode-check-bg"/>${iconUse('check', 11, 'tnode-check')}</g>` : n.node.cost > 0 ? html`<g transform="translate(17,-16)"><circle r="9" class="tnode-cost-bg"/><text y="3.5" text-anchor="middle" class="tnode-cost">${n.node.cost}</text></g>` : ''}
      </g>`;
    })}
  </svg>`;
}

function details(view: ViewContext): Raw {
  const { game, ui } = view;
  const id = ui.selectedNode && game.content.hasProgressNode(ui.selectedNode) ? ui.selectedNode : null;
  if (!id) return html`<div class="tree-details muted small">Select a node to see what it unlocks. ${icon('check', 'icon-ok')} unlocked · blue ring = can unlock now · grey = locked.</div>`;
  const { node, status, can, unlocks } = game.progressNodeView(id);
  return html`
    <div class="tree-details">
      <div class="row"><strong>${node.name}</strong><span class="tag">${status === 'unlocked' ? 'unlocked' : node.cost === 0 ? 'free' : `${node.cost} point${node.cost === 1 ? '' : 's'}`}</span></div>
      <div class="small">${node.description}</div>
      <div class="small muted">${unlocks}</div>
      ${node.requires.length ? html`<div class="small muted">After: ${node.requires.map((r) => game.content.progressNode(r).name).join(', ')}</div>` : ''}
      ${node.requirements.length ? html`<div class="small muted">Needs: ${node.requirements.map((r) => game.describeRequirement(r)).join(', ')}</div>` : ''}
      ${status === 'unlocked' ? '' : html`<div class="row"><button class="btn btn-small btn-primary" data-action="unlock" data-id="${node.id}" ${attr(!can.ok, 'disabled')}>Unlock</button>${can.ok ? '' : html`<span class="bad small">${can.reason}</span>`}</div>`}
    </div>`;
}

export const treePanel: Panel = {
  id: 'tree',
  title: 'Progression',
  width: 1180,
  badge({ game }) {
    const points = game.progressPoints().available;
    return points > 0 && game.content.progressNodeIds.some((id) => game.progressNodeView(id).status === 'available') ? points : 0;
  },
  render(view) {
    const { game } = view;
    const points = game.progressPoints();
    return html`
      <div class="panel-head">
        <span class="chip ${points.available > 0 ? 'chip-accent' : ''}">${points.available} point${points.available === 1 ? '' : 's'} to spend</span>
        <span class="muted small">${points.spent} spent · one point per skill tier-up, two per quest</span>
      </div>
      ${details(view)}
      <div class="grid grid-2 tree">
        ${BRANCHES.map((branch) => html`<section class="card branch"><h3>${branch.title} <span class="muted">${branch.blurb}</span></h3>${branchGraph(view, branch)}</section>`)}
      </div>
    `;
  },
};
