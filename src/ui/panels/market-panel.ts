import { fmtNum } from '@/util/format';
import { itemName } from '../components/items';
import { attr, html } from '../html';
import type { Panel } from '../panel';

function trend(price: number, base: number): { label: string; cls: string } {
  const ratio = price / base - 1;
  if (Math.abs(ratio) < 0.03) return { label: '≈ base', cls: 'muted' };
  const pct = `${ratio > 0 ? '+' : ''}${Math.round(ratio * 100)}%`;
  return ratio > 0 ? { label: `▲ ${pct}`, cls: 'ok' } : { label: `▼ ${pct}`, cls: 'bad' };
}

export const marketPanel: Panel = {
  id: 'market',
  title: 'Market',
  group: 'World',
  render({ game }) {
    const zone = game.content.zone(game.state.player.zoneId);
    const open = game.marketOpen();
    if (!open.ok) return html`<h2>Market</h2><p class="muted">${open.reason} The village has one.</p>`;
    const gold = game.state.player.gold;
    const rows = game.marketView();
    return html`
      <h2>Market <span class="muted">in ${zone.name} · ${fmtNum(gold)} gold</span></h2>
      <p class="muted small">Prices move with what you trade: buying pushes a price up, selling pushes it down, and it drifts back toward the base value over time. Dumping a big stack at once pays less per unit.</p>
      <table class="table table-market">
        <tr class="head"><th>Item</th><th class="num">Price</th><th>Trend</th><th class="num">You have</th><th class="num">Buy at</th><th></th><th class="num">Sell at</th><th></th></tr>
        ${rows.map((row) => {
          const t = trend(row.price, row.base);
          const canBuy = gold >= row.buy;
          return html`<tr>
            <td class="name">${itemName(game, row.itemId)}</td>
            <td class="num">${fmtNum(Math.round(row.price))}g <span class="muted small">(base ${row.base})</span></td>
            <td class="${t.cls} small">${t.label}</td>
            <td class="num muted">${row.have ? fmtNum(row.have) : '—'}</td>
            <td class="num gold">${fmtNum(row.buy)}g</td>
            <td class="actions">
              <button class="btn btn-small btn-primary" data-action="market-buy" data-id="${row.itemId}" data-qty="1" ${attr(!canBuy, 'disabled')} title="${canBuy ? '' : 'Not enough gold'}">1</button>
              <button class="btn btn-small" data-action="market-buy" data-id="${row.itemId}" data-qty="10" ${attr(!canBuy, 'disabled')}>10</button>
            </td>
            <td class="num gold">${fmtNum(row.sell)}g</td>
            <td class="actions">
              <button class="btn btn-small" data-action="market-sell" data-id="${row.itemId}" data-qty="1" ${attr(row.have < 1, 'disabled')}>1</button>
              <button class="btn btn-small" data-action="market-sell" data-id="${row.itemId}" data-qty="10" ${attr(row.have < 2, 'disabled')}>10</button>
              <button class="btn btn-small" data-action="market-sell" data-id="${row.itemId}" data-qty="all" ${attr(row.have < 2, 'disabled')} title="${row.have >= 2 ? `Sell all ${row.have} for about ${fmtNum(game.marketQuote('sell', row.itemId, row.have).total)} gold` : ''}">All</button>
            </td>
          </tr>`;
        })}
      </table>
    `;
  },
};
