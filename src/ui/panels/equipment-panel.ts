import { EQUIP_SLOTS } from '@/types/ids';
import { fmtDuration } from '@/util/format';
import { itemName } from '../components/items';
import { html } from '../html';
import type { Panel } from '../panel';

export const equipmentPanel: Panel = {
  id: 'equipment',
  title: 'Equipment',
  group: 'Character',
  render({ game }) {
    const stats = game.stats();
    const buffs = game.state.player.buffs.filter((b) => b.expiresAtMs > game.state.time.nowMs);
    return html`
      <h2>Equipment</h2>
      <div class="columns">
        <section class="card">
          <h3>Worn</h3>
          <table class="table">
            ${EQUIP_SLOTS.map((slot) => {
              const itemId = game.state.player.equipment[slot];
              return html`<tr>
                <td class="muted slot">${slot}</td>
                <td class="name">${itemId ? itemName(game, itemId) : html`<span class="muted">—</span>`}</td>
                <td class="actions">${itemId ? html`<button class="btn btn-small" data-action="unequip" data-id="${slot}">Unequip</button>` : ''}</td>
              </tr>`;
            })}
          </table>
        </section>
        <section class="card">
          <h3>Stats</h3>
          <table class="table">
            <tr><td>Hitpoints</td><td class="num">${game.state.player.hp} / ${stats.maxHp}</td></tr>
            <tr><td>Attack</td><td class="num">${stats.attack}</td></tr>
            <tr><td>Strength</td><td class="num">${stats.strength}</td></tr>
            <tr><td>Defence</td><td class="num">${stats.defence}</td></tr>
            <tr><td>Attack speed</td><td class="num">${fmtDuration(stats.attackIntervalMs)}</td></tr>
          </table>
          <p class="muted small">Base values come from your levels; gear and buffs add to them.</p>
          ${buffs.length ? html`<h3>Active buffs</h3><ul>${buffs.map((b) => html`<li>+${b.amount} ${b.stat} <span class="muted small">(${fmtDuration(b.expiresAtMs - game.state.time.nowMs)} left)</span></li>`)}</ul>` : ''}
        </section>
      </div>
    `;
  },
};
