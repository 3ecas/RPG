import type { ItemCategory } from '@/types/content';
import { fmtNum } from '@/util/format';
import { itemName } from '../components/items';
import { attr, html } from '../html';
import type { Panel } from '../panel';

const ORDER: ItemCategory[] = ['material', 'food', 'weapon', 'armor', 'potion', 'misc'];

export const shopsPanel: Panel = {
  id: 'shops',
  title: 'Shops',
  group: 'World',
  render({ game, ui }) {
    const zone = game.content.zone(game.state.player.zoneId);
    const shops = game.shopsHere();
    if (shops.length === 0) return html`<h2>Shops</h2><p class="muted">No shops in ${zone.name}.</p>`;
    const shop = shops.find((s) => s.id === ui.shopId) ?? shops[0]!;
    const gold = game.state.player.gold;
    const stock = game.shopStock(shop.id);
    const sellable = [...game.state.inventory]
      .map((s) => ({ ...s, item: game.content.item(s.itemId), can: game.canSellTo(shop.id, s.itemId), price: game.shopSellPrice(shop.id, s.itemId) }))
      .sort((a, b) => Number(b.can.ok) - Number(a.can.ok) || ORDER.indexOf(a.item.category) - ORDER.indexOf(b.item.category) || a.item.name.localeCompare(b.item.name));

    return html`
      <h2>Shops <span class="muted">in ${zone.name} · ${fmtNum(gold)} gold</span></h2>
      ${shops.length > 1 ? html`<div class="row wrap">${shops.map((s) => html`<button class="btn btn-small ${s.id === shop.id ? 'btn-active' : ''}" data-action="open-shop" data-id="${s.id}">${s.name}</button>`)}</div>` : ''}
      <section class="card">
        <div class="card-head"><strong>${shop.name}</strong>${shop.keeperId ? html`<span class="tag">${game.content.npc(shop.keeperId).name}</span>` : ''}</div>
        <p class="muted">${shop.description}</p>
        <p class="muted small">Buys ${shop.buys === 'all' ? 'anything' : shop.buys.join(', ')} at ${Math.round(shop.sellRate * 100)}% of value. Stock returns over time.</p>
      </section>
      <div class="columns">
        <section class="card">
          <h3>Buy</h3>
          <table class="table table-shop">
            ${stock.map((row) => {
              const soldOut = row.qty !== 'infinite' && row.qty < 1;
              const canAfford = gold >= row.price;
              const disabled = soldOut || !canAfford;
              const title = soldOut ? 'Sold out' : !canAfford ? 'Not enough gold' : '';
              return html`<tr class="${soldOut ? 'row-dim' : ''}">
                <td class="name">${itemName(game, row.itemId)}</td>
                <td class="num gold">${fmtNum(row.price)}g</td>
                <td class="num muted small">${row.qty === 'infinite' ? '∞' : `${row.qty}/${row.max}`}</td>
                <td class="actions">
                  <button class="btn btn-small btn-primary" data-action="buy" data-shop="${shop.id}" data-id="${row.itemId}" data-qty="1" ${attr(disabled, 'disabled')} title="${title}">1</button>
                  <button class="btn btn-small" data-action="buy" data-shop="${shop.id}" data-id="${row.itemId}" data-qty="5" ${attr(disabled, 'disabled')}>5</button>
                  <button class="btn btn-small" data-action="buy" data-shop="${shop.id}" data-id="${row.itemId}" data-qty="10" ${attr(disabled, 'disabled')}>10</button>
                </td>
              </tr>`;
            })}
          </table>
        </section>
        <section class="card">
          <h3>Sell</h3>
          ${sellable.length === 0 ? html`<p class="muted">Your inventory is empty.</p>` : ''}
          <table class="table table-shop">
            ${sellable.map((row) => html`<tr class="${row.can.ok ? '' : 'row-dim'}">
              <td class="name">${itemName(game, row.itemId)} <span class="muted small">×${fmtNum(row.qty)}</span></td>
              <td class="num gold">${row.can.ok ? `${fmtNum(row.price)}g` : ''}</td>
              <td class="actions">
                ${row.can.ok
                  ? html`
                    <button class="btn btn-small" data-action="sell" data-shop="${shop.id}" data-id="${row.itemId}" data-qty="1">1</button>
                    <button class="btn btn-small" data-action="sell" data-shop="${shop.id}" data-id="${row.itemId}" data-qty="10" ${attr(row.qty < 2, 'disabled')}>10</button>
                    <button class="btn btn-small" data-action="sell" data-shop="${shop.id}" data-id="${row.itemId}" data-qty="all" ${attr(row.qty < 2, 'disabled')}>All</button>`
                  : html`<span class="muted small">${row.can.reason}</span>`}
              </td>
            </tr>`)}
          </table>
        </section>
      </div>
    `;
  },
};
