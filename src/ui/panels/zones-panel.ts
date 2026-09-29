import { requirementList } from '../components/items';
import { html } from '../html';
import type { Panel } from '../panel';

export const zonesPanel: Panel = {
  id: 'zones',
  title: 'Zones',
  render({ game }) {
    const current = game.state.player.zoneId;
    return html`
      <div class="panel-head"><h2>Zones</h2><span class="muted small">travel is instant and stops what you were doing</span></div>
      <div class="grid grid-auto-wide">
        ${game.content.zoneIds.map((id) => {
          const zone = game.content.zone(id);
          const unlocked = game.isZoneUnlocked(id);
          const here = id === current;
          return html`
            <div class="card ${here ? 'card-active' : ''} ${unlocked.ok ? '' : 'card-dim'}">
              <div class="card-head"><strong>${zone.name}</strong>${here ? html`<span class="tag tag-accent">here</span>` : unlocked.ok ? html`<button class="btn btn-small btn-primary" data-action="travel" data-id="${id}">Travel</button>` : html`<span class="tag tag-locked">🔒</span>`}</div>
              <div class="small muted">${zone.description}</div>
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
