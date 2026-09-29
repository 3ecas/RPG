import { fmtDuration } from '@/util/format';
import { itemName } from '../components/items';
import { attr, html } from '../html';
import type { Panel } from '../panel';

/** One gathering spot, opened from its marker on the map. */
export const nodePanel: Panel = {
  id: 'node',
  width: 400,
  title: ({ game, params }) => (game.content.hasNode(params.id ?? '') ? game.content.node(params.id as never).name : 'Gathering'),
  render({ game, params }) {
    const id = params.id ?? '';
    if (!game.content.hasNode(id)) return html`<p class="muted">Nothing here.</p>`;
    const node = game.content.node(id);
    const skill = game.content.skill(node.skill);
    const can = game.canGather(id);
    const active = game.state.activity?.kind === 'gather' && game.state.activity.nodeId === id;
    const view = game.skillView(node.skill);
    return html`
      <p class="muted">${node.description}</p>
      <table class="table table-kv">
        <tr><td>Yields</td><td>${itemName(game, node.itemId)} <span class="muted small">(you have ${game.itemCount(node.itemId)})</span></td></tr>
        <tr><td>Skill</td><td>${skill.name} · needs tier ${node.tier} · you are tier ${view.tier}</td></tr>
        <tr><td>Per cycle</td><td>${node.xp} xp · ${fmtDuration(node.durationMs)}</td></tr>
      </table>
      <div class="row">
        ${active
          ? html`<button class="btn btn-primary" data-action="stop">Stop</button><span class="ok small">In progress</span>`
          : html`<button class="btn btn-primary" data-action="gather" data-id="${node.id}" ${attr(!can.ok, 'disabled')}>${skill.verb}</button>${can.ok ? html`<span class="muted small">Keeps going until you stop or the bag is full.</span>` : html`<span class="bad small">${can.reason}</span>`}`}
      </div>
    `;
  },
};
