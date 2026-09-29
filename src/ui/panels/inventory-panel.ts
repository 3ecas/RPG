import type { ItemCategory } from '@/types/content';
import { BALANCE } from '@/content/balance';
import { fmtNum } from '@/util/format';
import { itemName } from '../components/items';
import { attr, html } from '../html';
import type { Panel } from '../panel';

const ORDER: ItemCategory[] = ['weapon', 'armor', 'food', 'potion', 'material', 'misc'];

export const inventoryPanel: Panel = {
  id: 'inventory',
  title: 'Inventory',
  group: 'Character',
  render({ game }) {
    const stacks = [...game.state.inventory]
      .map((s) => ({ ...s, item: game.content.item(s.itemId) }))
      .sort((a, b) => ORDER.indexOf(a.item.category) - ORDER.indexOf(b.item.category) || a.item.name.localeCompare(b.item.name));
    return html`
      <h2>Inventory <span class="muted">${game.state.inventory.length}/${BALANCE.INVENTORY_SLOTS} slots · ${fmtNum(game.state.player.gold)} gold</span></h2>
      ${stacks.length === 0 ? html`<p class="muted">Empty. Gather, fight, or craft something.</p>` : ''}
      <table class="table table-inventory">
        ${stacks.map(({ itemId, qty, item }) => {
          const canEquip = item.equip ? game.canEquip(itemId) : null;
          return html`<tr>
            <td class="name">${itemName(game, itemId)}</td>
            <td class="muted small">${item.category}</td>
            <td class="num">${fmtNum(qty)}</td>
            <td class="num muted small">${fmtNum(item.value)}g</td>
            <td class="actions">
              ${canEquip ? html`<button class="btn btn-small" data-action="equip" data-id="${itemId}" ${attr(!canEquip.ok, 'disabled')} title="${canEquip.ok ? `Equip (${item.equip?.slot})` : canEquip.reason}">Equip</button>` : ''}
              ${item.consume ? html`<button class="btn btn-small" data-action="use" data-id="${itemId}">Use</button>` : ''}
            </td>
          </tr>`;
        })}
      </table>
    `;
  },
};
