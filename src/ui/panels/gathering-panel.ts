import { fmtDuration } from '@/util/format';
import { itemName } from '../components/items';
import { attr, html } from '../html';
import type { Panel } from '../panel';

export const gatheringPanel: Panel = {
  id: 'gathering',
  title: 'Gathering',
  group: 'Work',
  render({ game }) {
    const zone = game.content.zone(game.state.player.zoneId);
    const nodes = zone.nodes.map((id) => game.content.node(id));
    const activeNode = game.state.activity?.kind === 'gather' ? game.state.activity.nodeId : null;
    if (nodes.length === 0) {
      return html`<h2>Gathering</h2><p class="muted">There is nothing to gather in ${zone.name}. Try another zone.</p>`;
    }
    return html`
      <h2>Gathering <span class="muted">in ${zone.name}</span></h2>
      <div class="cards">
        ${nodes.map((node) => {
          const skill = game.content.skill(node.skill);
          const can = game.canGather(node.id);
          const isActive = activeNode === node.id;
          return html`
            <div class="card ${isActive ? 'card-active' : ''}">
              <div class="card-head"><strong>${node.name}</strong><span class="tag">${skill.name} ${node.level}</span></div>
              <p class="muted">${node.description}</p>
              <div class="row"><span>${itemName(game, node.itemId)}</span><span class="muted small">${node.xp} xp · ${fmtDuration(node.durationMs)}</span></div>
              <div class="row">
                ${isActive
                  ? html`<button class="btn" data-action="stop">Stop</button><span class="ok small">In progress</span>`
                  : html`<button class="btn btn-primary" data-action="gather" data-id="${node.id}" ${attr(!can.ok, 'disabled')} title="${can.ok ? `Start ${skill.verb.toLowerCase()}` : can.reason}">${skill.verb}</button>
                    ${can.ok ? '' : html`<span class="bad small">${can.reason}</span>`}`}
              </div>
            </div>`;
        })}
      </div>
    `;
  },
};
