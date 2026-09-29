import { requirementList } from '../components/items';
import { attr, html } from '../html';
import type { Panel } from '../panel';

export const zonesPanel: Panel = {
  id: 'zones',
  title: 'Zones',
  group: 'World',
  render({ game }) {
    const current = game.state.player.zoneId;
    return html`
      <h2>Zones</h2>
      <div class="cards cards-wide">
        ${game.content.zoneIds.map((id) => {
          const zone = game.content.zone(id);
          const unlocked = game.isZoneUnlocked(id);
          const here = id === current;
          return html`
            <div class="card ${here ? 'card-active' : ''} ${unlocked.ok ? '' : 'card-locked'}">
              <div class="card-head"><strong>${zone.name}</strong>${here ? html`<span class="tag">You are here</span>` : unlocked.ok ? '' : html`<span class="tag tag-locked">Locked</span>`}</div>
              <p class="muted">${zone.description}</p>
              <div class="small"><span class="muted">Gather:</span> ${zone.nodes.length ? zone.nodes.map((n) => game.content.node(n).name).join(', ') : '—'}</div>
              <div class="small"><span class="muted">Monsters:</span> ${zone.monsters.length ? zone.monsters.map((m) => `${game.content.monster(m).name} (${game.content.monster(m).level})`).join(', ') : '—'}</div>
              <div class="small"><span class="muted">People:</span> ${zone.npcs.length ? zone.npcs.map((n) => game.content.npc(n).name).join(', ') : '—'}</div>
              <div class="small"><span class="muted">Requires:</span> ${requirementList(game, zone.unlock)}</div>
              <div class="row top-gap">
                <button class="btn btn-primary" data-action="travel" data-id="${id}" ${attr(here || !unlocked.ok, 'disabled')} title="${unlocked.ok ? '' : unlocked.reason}">Travel</button>
              </div>
            </div>`;
        })}
      </div>
    `;
  },
};
