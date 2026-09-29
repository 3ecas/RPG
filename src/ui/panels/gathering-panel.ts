import { fmtDuration } from '@/util/format';
import { itemName } from '../components/items';
import { attr, html } from '../html';
import type { Panel } from '../panel';

/** All gathering spots in the zone as a list; picking one walks you there. */
export const gatheringPanel: Panel = {
  id: 'gathering',
  title: 'Gathering',
  width: 720,
  render({ game }) {
    const zone = game.content.zone(game.state.player.zoneId);
    const nodes = zone.nodes.map((id) => game.content.node(id));
    const activeNode = game.state.activity?.kind === 'gather' ? game.state.activity.nodeId : null;
    if (nodes.length === 0) return html`<p class="muted">Nothing to gather in ${zone.name}.</p>`;
    return html`
      <div class="grid grid-auto">
        ${nodes.map((node) => {
          const skill = game.content.skill(node.skill);
          const can = game.canGather(node.id);
          const isActive = activeNode === node.id;
          return html`
            <div class="card ${isActive ? 'card-active' : ''} ${can.ok || isActive ? '' : 'card-dim'}">
              <div class="card-head"><strong>${node.name}</strong><span class="tag">${skill.name} T${node.tier}</span></div>
              <div class="row small"><span>${itemName(game, node.itemId)}</span><span class="muted">${node.xp} xp · ${fmtDuration(node.durationMs)}</span></div>
              <div class="row">
                ${isActive
                  ? html`<button class="btn btn-small" data-action="stop">Stop</button><span class="ok small">In progress</span>`
                  : html`<button class="btn btn-small btn-primary" data-action="gather" data-id="${node.id}" ${attr(!can.ok, 'disabled')} title="${can.ok ? '' : can.reason}">${skill.verb}</button>${can.ok ? '' : html`<span class="bad small">${can.reason}</span>`}`}
              </div>
            </div>`;
        })}
      </div>
    `;
  },
};
