import { BRANCHES } from '@/content/progression';
import { attr, html } from '../html';
import type { Panel } from '../panel';

export const treePanel: Panel = {
  id: 'tree',
  title: 'Progression',
  badge({ game }) {
    const points = game.progressPoints().available;
    return points > 0 && game.content.progressNodeIds.some((id) => game.progressNodeView(id).status === 'available') ? points : 0;
  },
  render({ game }) {
    const points = game.progressPoints();
    const views = game.content.progressNodeIds.map((id) => game.progressNodeView(id));
    return html`
      <div class="panel-head">
        <h2>Progression</h2>
        <span class="chip ${points.available > 0 ? 'chip-accent' : ''}">${points.available} point${points.available === 1 ? '' : 's'} to spend</span>
        <span class="muted small">${points.spent} spent · one point per skill tier-up, two per quest</span>
      </div>
      <div class="grid grid-4 tree">
        ${BRANCHES.map((branch) => html`
          <section class="card branch">
            <h3>${branch.title} <span class="muted">${branch.blurb}</span></h3>
            ${views
              .filter((v) => v.node.branch === branch.id)
              .sort((a, b) => a.depth - b.depth || a.node.cost - b.node.cost || a.node.name.localeCompare(b.node.name))
              .map(({ node, status, can, unlocks }) => html`
                <div class="node node-${status}" style="--depth:${Math.min(6, node.requires.length ? 1 : 0)}">
                  <div class="node-head">
                    <strong>${node.name}</strong>
                    <span class="cost">${status === 'unlocked' ? '✓' : node.cost === 0 ? 'free' : `${node.cost} pt`}</span>
                  </div>
                  <div class="small">${node.description}</div>
                  ${node.unlocks.every((u) => u.type === 'perk') ? '' : html`<div class="small muted">${unlocks}</div>`}
                  ${node.requires.length ? html`<div class="small muted">After: ${node.requires.map((r) => game.content.progressNode(r).name).join(', ')}</div>` : ''}
                  ${node.requirements.length ? html`<div class="small muted">Needs: ${node.requirements.map((r) => game.describeRequirement(r)).join(', ')}</div>` : ''}
                  ${status === 'unlocked'
                    ? ''
                    : html`<button class="btn btn-small ${status === 'available' ? 'btn-primary' : ''}" data-action="unlock" data-id="${node.id}" ${attr(!can.ok, 'disabled')} title="${can.ok ? '' : can.reason}">${can.ok ? 'Unlock' : can.reason}</button>`}
                </div>`)}
          </section>`)}
      </div>
    `;
  },
};
