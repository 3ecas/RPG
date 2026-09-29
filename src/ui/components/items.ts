import type { Game } from '@/game';
import type { ItemStack, Requirement } from '@/types/content';
import type { ItemId } from '@/types/ids';
import { html, type Raw } from '../html';
import { icon } from '../icons';

export function itemName(game: Game, itemId: ItemId): Raw {
  const item = game.content.item(itemId);
  return html`<span class="item item-${item.category}" title="Tier ${item.tier} · ${item.description}">${item.name}</span>`;
}

/** "1× Copper Ore" with have/need coloring. */
export function stackList(game: Game, stacks: readonly Readonly<ItemStack>[], showHave = true): Raw {
  return html`${stacks.map((s, i) => {
    const have = game.itemCount(s.itemId);
    const ok = have >= s.qty;
    return html`${i > 0 ? ', ' : ''}<span class="${showHave ? (ok ? 'ok' : 'bad') : ''}">${s.qty}× ${itemName(game, s.itemId)}${showHave ? html` <span class="muted small">(${have})</span>` : ''}</span>`;
  })}`;
}

export function requirementList(game: Game, reqs: readonly Requirement[]): Raw {
  if (reqs.length === 0) return html`<span class="muted">none</span>`;
  return html`${reqs.map((r, i) => {
    const met = game.meetsRequirement(r);
    return html`${i > 0 ? ' · ' : ''}<span class="${met ? 'ok' : 'bad'}">${icon(met ? 'check' : 'x')} ${game.describeRequirement(r)}</span>`;
  })}`;
}
