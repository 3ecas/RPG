import { requirementList } from '../components/items';
import { html } from '../html';
import { icon } from '../icons';
import type { Panel } from '../panel';

export const zonesPanel: Panel = {
  id: 'zones',
  title: 'Zones',
  width: 940,
  render({ game }) {
    const current = game.state.player.zoneId;
    const visited = game.state.world.visitedZones;
    return html`
      <div class="panel-head"><span class="muted small">walk through the exits at the edge of each zone to discover it; places you have been to can be travelled to from here at once</span></div>
      <div class="grid grid-auto-wide">
        ${game.content.zoneIds.map((id) => {
          const zone = game.content.zone(id);
          const unlocked = game.isZoneUnlocked(id);
          const here = id === current;
          const been = visited.includes(id) || id === 'greenhollow';
          const route = game.content.route(current, id);
          const exits = game.content.exits(id).map((z) => game.content.zone(z).name).join(', ');
          return html`
            <div class="card ${here ? 'card-active' : ''} ${unlocked.ok ? '' : 'card-dim'}">
              <div class="card-head"><strong>${zone.name}</strong>${here ? html`<span class="tag tag-accent">here</span>` : !unlocked.ok ? html`<span class="tag tag-locked">${icon('lock')}</span>` : been ? html`<button class="btn btn-small btn-primary" data-action="travel" data-id="${id}">Travel</button>` : html`<span class="tag" title="Walk there first">not visited</span>`}</div>
              <div class="small muted">${zone.description}</div>
              <div class="small"><span class="muted">Paths lead to:</span> ${exits || '—'}</div>
              ${!here && route && route.length > 2 ? html`<div class="small"><span class="muted">On foot:</span> ${route.slice(1).map((z) => game.content.zone(z).name).join(' → ')}</div>` : ''}
              <div class="small"><span class="muted">Gather:</span> ${zone.nodes.length ? zone.nodes.map((n) => game.content.node(n).name).join(', ') : '—'}</div>
              <div class="small"><span class="muted">Monsters:</span> ${zone.monsters.length ? zone.monsters.map((m) => `${game.content.monster(m).name} (T${game.content.monster(m).tier})`).join(', ') : '—'}</div>
              <div class="small"><span class="muted">People:</span> ${[...zone.npcs.map((n) => game.content.npc(n).name), ...zone.shops.map((s) => game.content.shop(s).name), ...zone.traders.map((t) => `${game.content.trader(t).name} (barter)`), ...(zone.market ? ['Market'] : [])].join(', ') || '—'}</div>
              ${zone.unlock.length ? html`<div class="small"><span class="muted">Requires:</span> ${requirementList(game, zone.unlock)}</div>` : ''}
            </div>`;
        })}
      </div>
    `;
  },
};
