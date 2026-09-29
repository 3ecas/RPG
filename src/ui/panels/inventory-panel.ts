import type { ItemCategory } from '@/types/content';
import { fmtNum } from '@/util/format';
import { itemName } from '../components/items';
import { attr, html } from '../html';
import type { Panel } from '../panel';

const ORDER: ItemCategory[] = ['weapon', 'armor', 'food', 'potion', 'material', 'misc'];

export const inventoryPanel: Panel = {
  id: 'inventory',
  title: 'Items',
  render({ game }) {
    const stacks = [...game.state.inventory]
      .map((s) => ({ ...s, item: game.content.item(s.itemId) }))
      .sort((a, b) => ORDER.indexOf(a.item.category) - ORDER.indexOf(b.item.category) || a.item.tier - b.item.tier || a.item.name.localeCompare(b.item.name));
    return html`
      <div class="panel-head"><h2>Items</h2><span class="muted small">${game.state.inventory.length}/${game.inventoryCapacity()} slots · ${fmtNum(game.state.player.gold)} gold</span></div>
      ${stacks.length === 0 ? html`<p class="muted">Empty. Gather, fight, or craft something.</p>` : ''}
      <div class="grid grid-items">
        ${stacks.map(({ itemId, qty, item }) => {
          const canEquip = item.equip ? game.canEquip(itemId) : null;
          return html`<div class="item-card item-${item.category}">
            <div class="item-main"><span class="name">${itemName(game, itemId)}</span><span class="qty">×${fmtNum(qty)}</span></div>
            <div class="item-sub muted small">T${item.tier} · ${item.category} · ${fmtNum(item.value)}g</div>
            <div class="item-actions">
              ${canEquip ? html`<button class="btn btn-small" data-action="equip" data-id="${itemId}" ${attr(!canEquip.ok, 'disabled')} title="${canEquip.ok ? `Equip (${item.equip?.slot})` : canEquip.reason}">Equip</button>` : ''}
              ${item.consume ? html`<button class="btn btn-small" data-action="use" data-id="${itemId}">Use</button>` : ''}
            </div>
          </div>`;
        })}
      </div>
    `;
  },
};
