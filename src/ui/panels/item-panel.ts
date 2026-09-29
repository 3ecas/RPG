import type { ItemId } from '@/types/ids';
import { fmtDuration, fmtNum } from '@/util/format';
import { itemLink } from '../components/catalogue';
import { attr, html, type Raw } from '../html';
import { catalogueLabel, catalogueKey } from '../groups';
import type { Panel, ViewContext } from '../panel';

/** Everything about one item, with the actions available where you stand. */
export const itemPanel: Panel = {
  id: 'item',
  width: 560,
  title: ({ game, params }) => (game.content.hasItem(params.id ?? '') ? game.content.item(params.id as ItemId).name : 'Item'),
  render(view) {
    const { game, params } = view;
    const id = params.id ?? '';
    if (!game.content.hasItem(id)) return html`<p class="muted">Unknown item.</p>`;
    const item = game.content.item(id);
    const have = game.itemCount(id);
    const zone = game.content.zone(game.state.player.zoneId);
    return html`
      <div class="row"><span class="chip">Tier ${item.tier}</span><span class="chip">${catalogueLabel(catalogueKey(item))}</span><span class="chip">${fmtNum(item.value)}g base value</span><span class="chip">You have ${fmtNum(have)}</span></div>
      <p>${item.description}</p>
      ${equipInfo(view)}
      ${consumeInfo(view)}
      ${sources(view)}
      ${uses(view)}
      ${actions(view)}
      <p class="muted small">You are in ${zone.name}.</p>
    `;
  },
};

function equipInfo({ game, params }: ViewContext): Raw {
  const item = game.content.item(params.id as ItemId);
  const equip = item.equip;
  if (!equip) return html``;
  const stats = Object.entries(equip.stats).map(([k, v]) => `+${v} ${k}`).join(' · ');
  const reqs = (equip.requirements ?? []).map((r) => `${game.content.skill(r.skill).name} tier ${r.tier} (you: ${game.skillTier(r.skill)})`).join(', ');
  return html`<table class="table table-kv">
    <tr><td>Slot</td><td>${equip.kind === 'weapon' ? `Main hand${equip.weaponType === 'dagger' ? ' or off hand' : ''}` : equip.kind === 'shield' ? 'Off hand' : equip.kind === 'trinket' ? 'Trinket' : equip.kind}</td></tr>
    <tr><td>Stats</td><td>${stats || '—'}${equip.attackIntervalMs ? ` · ${fmtDuration(equip.attackIntervalMs)} per hit` : ''}</td></tr>
    ${equip.weaponType ? html`<tr><td>Trains</td><td>${game.content.skill(equip.weaponType === 'sword' ? 'swords' : equip.weaponType === 'axe' ? 'axes' : 'daggers').name}</td></tr>` : ''}
    <tr><td>Requires</td><td>${reqs || 'nothing'}</td></tr>
  </table>`;
}

function consumeInfo({ game, params }: ViewContext): Raw {
  const item = game.content.item(params.id as ItemId);
  if (!item.consume) return html``;
  return html`<div class="small">Use: ${item.consume.effects.map((e) => (e.type === 'heal' ? `heals ${e.amount}` : e.type === 'restore_mana' ? `restores ${e.amount} mana` : `+${e.amount} ${e.stat} for ${fmtDuration(e.durationMs)}`)).join(', ')}.</div>`;
}

function sources({ game, params }: ViewContext): Raw {
  const id = params.id as ItemId;
  const lines: Raw[] = [];
  for (const recipeId of game.content.recipeIds) {
    const recipe = game.content.recipe(recipeId);
    if (!recipe.outputs.some((o) => o.itemId === id)) continue;
    const zoneId = game.zoneWithStation(recipe.station);
    lines.push(html`<li>Crafted at the ${game.content.station(recipe.station).name}${zoneId ? ` (${game.content.zone(zoneId).name})` : ''} · ${game.content.skill(recipe.skill).name} T${recipe.tier} · needs ${recipe.inputs.map((i) => `${i.qty}× ${game.content.item(i.itemId).name}`).join(', ')}</li>`);
  }
  for (const zoneId of game.content.zoneIds) {
    const zone = game.content.zone(zoneId);
    for (const nodeId of zone.nodes) {
      const node = game.content.node(nodeId);
      if (node.itemId === id) lines.push(html`<li>Gathered at ${node.name} in ${zone.name} · ${game.content.skill(node.skill).name} T${node.tier}</li>`);
    }
    for (const monsterId of zone.monsters) {
      const m = game.content.monster(monsterId);
      const drop = m.loot.find((l) => l.itemId === id);
      if (drop) lines.push(html`<li>Dropped by ${m.name} in ${zone.name} · ${Math.round(drop.chance * 100)}%</li>`);
    }
    for (const shopId of zone.shops) {
      const shop = game.content.shop(shopId);
      if (shop.stock.some((s) => s.itemId === id)) lines.push(html`<li>Sold at ${shop.name} in ${zone.name}</li>`);
    }
  }
  if (game.content.isMarketItem(id)) lines.push(html`<li>Traded on the Kingsport market</li>`);
  return lines.length ? html`<h3>Where to get it</h3><ul class="small">${lines}</ul>` : html``;
}

function uses({ game, params }: ViewContext): Raw {
  const id = params.id as ItemId;
  const lines = game.content.recipeIds.flatMap((recipeId) => {
    const recipe = game.content.recipe(recipeId);
    const input = recipe.inputs.find((i) => i.itemId === id);
    return input ? [html`<li>${input.qty}× for ${recipe.outputs.map((o) => itemLink(game, o.itemId)).map((r) => r)} at the ${game.content.station(recipe.station).name}</li>`] : [];
  });
  return lines.length ? html`<h3>Used for</h3><ul class="small">${lines}</ul>` : html``;
}

function actions(view: ViewContext): Raw {
  const { game, params } = view;
  const id = params.id as ItemId;
  const item = game.content.item(id);
  const parts: Raw[] = [];
  if (item.equip) {
    const can = game.canEquip(id);
    parts.push(html`<button class="btn btn-small btn-primary" data-action="equip" data-id="${id}" ${attr(!can.ok, 'disabled')} title="${can.ok ? '' : can.reason}">Equip</button>`);
    if (item.equip.weaponType === 'dagger') {
      const off = game.canEquip(id, 'off_hand');
      parts.push(html`<button class="btn btn-small" data-action="equip" data-id="${id}" data-slot="off_hand" ${attr(!off.ok, 'disabled')} title="${off.ok ? '' : off.reason}">Off hand</button>`);
    }
  }
  if (item.consume) parts.push(html`<button class="btn btn-small" data-action="use" data-id="${id}" ${attr(game.itemCount(id) < 1, 'disabled')}>Use</button>`);
  for (const recipeId of game.content.recipeIds) {
    const recipe = game.content.recipe(recipeId);
    if (!recipe.outputs.some((o) => o.itemId === id) || !game.stationHere(recipe.station)) continue;
    const can = game.canCraft(recipeId);
    const max = game.maxCraftable(recipeId);
    parts.push(html`<span class="row wrap"><span class="muted small">${game.content.station(recipe.station).name}:</span>
      <button class="btn btn-small btn-primary" data-action="craft" data-id="${recipeId}" data-qty="1" ${attr(!can.ok, 'disabled')} title="${can.ok ? '' : can.reason}">Craft 1</button>
      <button class="btn btn-small" data-action="craft" data-id="${recipeId}" data-qty="all" ${attr(!can.ok || max < 2, 'disabled')}>All (${max})</button>
      ${can.ok ? '' : html`<span class="bad small">${can.reason}</span>`}</span>`);
  }
  const shopId = params.shop && game.content.hasShop(params.shop) ? params.shop : null;
  if (shopId && game.shopsHere().some((s) => s.id === shopId)) {
    const shop = game.content.shop(shopId);
    const stock = game.shopStock(shopId).find((r) => r.itemId === id);
    if (stock) parts.push(html`<span class="row wrap"><span class="muted small">${shop.name} sells at <span class="gold">${fmtNum(stock.price)}g</span> (${stock.qty === 'infinite' ? '∞' : `${stock.qty} left`}):</span>
      <button class="btn btn-small btn-primary" data-action="buy" data-shop="${shopId}" data-id="${id}" data-qty="1" ${attr(stock.qty !== 'infinite' && stock.qty < 1, 'disabled')}>Buy 1</button>
      <button class="btn btn-small" data-action="buy" data-shop="${shopId}" data-id="${id}" data-qty="5">Buy 5</button></span>`);
    const sell = game.canSellTo(shopId, id);
    parts.push(html`<span class="row wrap"><span class="muted small">${shop.name} buys at <span class="gold">${fmtNum(game.shopSellPrice(shopId, id))}g</span>:</span>
      <button class="btn btn-small" data-action="sell" data-shop="${shopId}" data-id="${id}" data-qty="1" ${attr(!sell.ok, 'disabled')} title="${sell.ok ? '' : sell.reason}">Sell 1</button>
      <button class="btn btn-small" data-action="sell" data-shop="${shopId}" data-id="${id}" data-qty="all" ${attr(!sell.ok, 'disabled')}>Sell all</button></span>`);
  }
  if (game.marketOpen().ok && game.content.isMarketItem(id)) {
    const row = game.marketView().find((r) => r.itemId === id)!;
    parts.push(html`<span class="row wrap"><span class="muted small">Market: buy <span class="gold">${fmtNum(row.buy)}g</span> · sell <span class="gold">${fmtNum(row.sell)}g</span>:</span>
      <button class="btn btn-small btn-primary" data-action="market-buy" data-id="${id}" data-qty="1">Buy 1</button>
      <button class="btn btn-small" data-action="market-buy" data-id="${id}" data-qty="10">Buy 10</button>
      <button class="btn btn-small" data-action="market-sell" data-id="${id}" data-qty="1" ${attr(row.have < 1, 'disabled')}>Sell 1</button>
      <button class="btn btn-small" data-action="market-sell" data-id="${id}" data-qty="all" ${attr(row.have < 1, 'disabled')}>Sell all</button></span>`);
  }
  return parts.length ? html`<h3>Actions</h3><div class="actions-stack">${parts}</div>` : html``;
}
