import { fmtNum } from '@/util/format';
import { categoryList, itemLink } from '../components/catalogue';
import { catalogueKey, categoriesOf } from '../groups';
import { lockNotice } from '../components/lock';
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
  width: 900,
  lock: ({ game }) => (game.hasFeature('market') ? null : 'Unlock "Market Access" in the Progression tree.'),
  render({ game, params, windowId }) {
    const zone = game.content.zone(game.state.player.zoneId);
    const open = game.marketOpen();
    if (!open.ok) return html`${game.hasFeature('market') ? html`<p class="muted">${open.reason} The village has one.</p>` : lockNotice(open.reason)}`;
    const gold = game.state.player.gold;
    const all = game.marketView();
    const categories = categoriesOf(game, all.map((r) => r.itemId));
    const selected = params.cat && params.cat !== 'all' ? params.cat : null;
    const rows = all.filter((r) => !selected || catalogueKey(game.content.item(r.itemId)) === selected);
    return html`
      <div class="panel-head"><span class="muted small">${zone.name} · ${fmtNum(gold)} gold · your trades move prices; they drift back over time</span></div>
      <div class="catalogue">
      ${categoryList(windowId, categories, selected, all.length)}
      <table class="table table-market">
        <tr class="head"><th>Item</th><th class="num">Price</th><th>Trend</th><th class="num">You have</th><th class="num">Buy at</th><th></th><th class="num">Sell at</th><th></th></tr>
        ${rows.map((row) => {
          const t = trend(row.price, row.base);
          const canBuy = gold >= row.buy;
          return html`<tr>
            <td class="name">${itemLink(game, row.itemId)}</td>
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
      </div>
    `;
  },
};
