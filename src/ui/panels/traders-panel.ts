import { fmtDuration } from '@/util/format';
import { stackList } from '../components/items';
import { attr, html } from '../html';
import type { Panel } from '../panel';

export const tradersPanel: Panel = {
  id: 'traders',
  title: 'Traders',
  group: 'World',
  render({ game }) {
    const zone = game.content.zone(game.state.player.zoneId);
    const traders = game.tradersHere();
    if (traders.length === 0) return html`<h2>Traders</h2><p class="muted">No traders in ${zone.name}. They wander the wilder zones.</p>`;
    return html`
      <h2>Traders <span class="muted">in ${zone.name}</span></h2>
      <p class="muted small">Barter only. Offers rotate on a timer and each can be taken a few times per rotation.</p>
      ${traders.map((trader) => html`
        <section class="card">
          <div class="card-head"><strong>${trader.name}</strong><span class="tag">${trader.title}</span></div>
          <p class="muted">${trader.description}</p>
          <p class="muted small">New offers in ${fmtDuration(game.traderRefreshInMs(trader.id))}.</p>
          <table class="table">
            ${game.traderOffers(trader.id).map(({ slot, offer, usesLeft, can }) => html`<tr class="${usesLeft < 1 ? 'row-dim' : ''}">
              <td>${stackList(game, offer.give)}</td>
              <td class="muted">→</td>
              <td>${stackList(game, offer.get, false)}</td>
              <td class="num muted small">${usesLeft} left</td>
              <td class="actions">
                <button class="btn btn-small btn-primary" data-action="barter" data-trader="${trader.id}" data-id="${slot}" ${attr(!can.ok, 'disabled')} title="${can.ok ? '' : can.reason}">Trade</button>
              </td>
            </tr>`)}
          </table>
        </section>`)}
    `;
  },
};
