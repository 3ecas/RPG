import { EQUIP_SLOTS } from '@/types/ids';
import { fmtDuration } from '@/util/format';
import { itemName } from '../components/items';
import { html } from '../html';
import type { Panel } from '../panel';

export const equipmentPanel: Panel = {
  id: 'equipment',
  title: 'Equipment',
  render({ game }) {
    const stats = game.stats();
    const buffs = game.state.player.buffs.filter((b) => b.expiresAtMs > game.state.time.nowMs);
    const weaponSkill = game.weaponSkill();
    return html`
      <div class="panel-head"><h2>Equipment</h2></div>
      <div class="grid grid-2">
        <section class="card">
          <h3>Worn</h3>
          <div class="slots">
            ${EQUIP_SLOTS.map((slot) => {
              const itemId = game.state.player.equipment[slot];
              return html`<div class="slot ${itemId ? '' : 'slot-empty'}">
                <span class="muted small slot-name">${slot}</span>
                <span class="name">${itemId ? itemName(game, itemId) : html`<span class="muted">—</span>`}</span>
                ${itemId ? html`<button class="btn btn-small" data-action="unequip" data-id="${slot}">Unequip</button>` : ''}
              </div>`;
            })}
          </div>
        </section>
        <section class="card">
          <h3>Stats</h3>
          <table class="table table-kv">
            <tr><td>Hit points</td><td class="num">${game.state.player.hp} / ${stats.maxHp}</td></tr>
            <tr><td>Attack</td><td class="num">${stats.attack}</td></tr>
            <tr><td>Strength</td><td class="num">${stats.strength}</td></tr>
            <tr><td>Defence</td><td class="num">${stats.defence}</td></tr>
            <tr><td>Attack speed</td><td class="num">${fmtDuration(stats.attackIntervalMs)}</td></tr>
            <tr><td>Weapon skill</td><td class="num">${weaponSkill ? `${game.content.skill(weaponSkill).name} T${game.skillTier(weaponSkill)}` : 'none'}</td></tr>
          </table>
          <p class="muted small">Mastery from skill tiers, plus gear, plus buffs.</p>
          ${buffs.length ? html`<h3>Active buffs</h3><ul>${buffs.map((b) => html`<li>+${b.amount} ${b.stat} <span class="muted small">(${fmtDuration(b.expiresAtMs - game.state.time.nowMs)} left)</span></li>`)}</ul>` : ''}
        </section>
      </div>
    `;
  },
};
