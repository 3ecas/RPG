import type { Game } from '@/game';
import type { ItemId } from '@/types/ids';
import { html, type Raw } from '../html';
import type { Category } from '../groups';

/** The ordered category list of a catalogue window. */
export function categoryList(windowId: string, categories: Category[], selected: string | null, total: number): Raw {
  const all = selected === null || selected === 'all';
  return html`<div class="cat-list">
    <button class="cat ${all ? 'active' : ''}" data-action="filter" data-window="${windowId}" data-id="all">All <span class="muted">${total}</span></button>
    ${categories.map((c) => html`<button class="cat ${selected === c.key ? 'active' : ''}" data-action="filter" data-window="${windowId}" data-id="${c.key}">${c.label} <span class="muted">${c.count}</span></button>`)}
  </div>`;
}

/** An item name that opens the item card. `context` is passed to the card (e.g. the shop). */
export function itemLink(game: Game, itemId: ItemId, context: { shop?: string } = {}): Raw {
  const item = game.content.item(itemId);
  return html`<button class="link item item-${item.category}" data-action="item" data-id="${itemId}" data-shop="${context.shop ?? ''}" title="Tier ${item.tier} · ${item.description}">${item.name}</button>`;
}
