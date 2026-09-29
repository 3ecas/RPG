import type { ItemCategory } from '@/types/content';
import { EQUIP_SLOTS, type EquipSlot } from '@/types/ids';
import { fmtDuration, fmtNum } from '@/util/format';
import { itemLink } from '../components/catalogue';
import { itemName } from '../components/items';
import { attr, html, type Raw } from '../html';
import { icon, SLOT_ICONS } from '../icons';
import type { Panel, ViewContext } from '../panel';

const ORDER: ItemCategory[] = ['weapon', 'armor', 'food', 'potion', 'material', 'misc'];

const SLOT_LABELS: Record<EquipSlot, string> = {
  head: 'Head', body: 'Torso', legs: 'Legs', hands: 'Hands', feet: 'Feet',
  main_hand: 'Main hand', off_hand: 'Off hand', trinket_1: 'Trinket', trinket_2: 'Trinket',
};

/** The figure: slot boxes arranged around a silhouette. Click a filled slot to unequip. */
function paperDoll({ game }: ViewContext): Raw {
  const slot = (id: EquipSlot) => {
    const itemId = game.state.player.equipment[id];
    const item = itemId ? game.content.item(itemId) : null;
    const stats = item?.equip ? Object.entries(item.equip.stats).map(([k, v]) => `+${v} ${k}`).join(' ') : '';
    return html`<button class="doll-slot doll-${id} ${item ? 'filled' : ''}" data-action="unequip" data-id="${id}" ${attr(!item, 'disabled')} title="${item ? `${item.name} (${stats}). Click to unequip.` : SLOT_LABELS[id]}">
      <span class="doll-icon">${item ? '' : icon(SLOT_ICONS[id])}</span>
      <span class="doll-text">${item ? html`${itemName(game, item.id)}` : html`<span class="muted">${SLOT_LABELS[id]}</span>`}</span>
    </button>`;
  };
  return html`
    <div class="doll">
      <svg class="doll-figure" viewBox="0 0 120 300" aria-hidden="true">
        <circle cx="60" cy="34" r="22"/>
        <rect x="34" y="60" width="52" height="86" rx="14"/>
        <rect x="14" y="66" width="18" height="76" rx="9"/>
        <rect x="88" y="66" width="18" height="76" rx="9"/>
        <rect x="38" y="150" width="20" height="96" rx="9"/>
        <rect x="62" y="150" width="20" height="96" rx="9"/>
        <rect x="34" y="248" width="24" height="14" rx="5"/>
        <rect x="62" y="248" width="24" height="14" rx="5"/>
      </svg>
      ${slot('trinket_1')}${slot('head')}${slot('trinket_2')}
      ${slot('main_hand')}${slot('body')}${slot('off_hand')}
      ${slot('hands')}${slot('legs')}<span></span>
      <span></span>${slot('feet')}<span></span>
    </div>`;
}

export const inventoryPanel: Panel = {
  id: 'inventory',
  title: 'Bag & Gear',
  width: 1000,
  render(view) {
    const { game } = view;
    const stats = game.stats();
    const weaponSkill = game.weaponSkill();
    const stacks = [...game.state.inventory]
      .map((s) => ({ ...s, item: game.content.item(s.itemId) }))
      .sort((a, b) => ORDER.indexOf(a.item.category) - ORDER.indexOf(b.item.category) || a.item.tier - b.item.tier || a.item.name.localeCompare(b.item.name));
    return html`
      <div class="grid grid-inv">
        <section class="card">
          <h3>Gear <span class="muted">click a slot to unequip</span></h3>
          ${paperDoll(view)}
          <div class="stat-row">
            <span title="Hit points">${icon('heart')} ${game.state.player.hp}/${stats.maxHp}</span>
            <span title="Attack (accuracy)">${icon('crosshair')} ${stats.attack}</span>
            <span title="Strength (power)">${icon('dumbbell')} ${stats.strength}</span>
            <span title="Defence">${icon('shield')} ${stats.defence}</span>
            <span title="Attack speed">${icon('clock')} ${fmtDuration(stats.attackIntervalMs)}</span>
          </div>
          <div class="muted small">${weaponSkill ? `${game.content.skill(weaponSkill).name} T${game.skillTier(weaponSkill)} mastery` : 'No weapon skill in use'} · ${game.hasShield() ? 'shield up' : 'no shield'} · ${EQUIP_SLOTS.filter((s) => game.state.player.equipment[s]).length}/${EQUIP_SLOTS.length} slots</div>
        </section>
        <section class="card">
          <h3>Bag <span class="muted">${game.state.inventory.length}/${game.inventoryCapacity()} slots · ${fmtNum(game.state.player.gold)} gold</span></h3>
          ${stacks.length === 0 ? html`<p class="muted small">Empty. Gather, fight, or craft something.</p>` : ''}
          <div class="grid grid-items">
            ${stacks.map(({ itemId, qty, item }) => {
              const equip = item.equip;
              const canEquip = equip ? game.canEquip(itemId) : null;
              const offHand = equip?.kind === 'weapon' && equip.weaponType === 'dagger' ? game.canEquip(itemId, 'off_hand') : null;
              return html`<div class="item-card item-${item.category}">
                <div class="item-main"><span class="name">${itemLink(game, itemId)}</span><span class="qty">×${fmtNum(qty)}</span></div>
                <div class="item-sub muted small">T${item.tier} · ${item.category} · ${fmtNum(item.value)}g${equip ? ` · ${Object.entries(equip.stats).map(([k, v]) => `+${v} ${k}`).join(' ')}` : ''}</div>
                <div class="item-actions">
                  ${canEquip ? html`<button class="btn btn-small" data-action="equip" data-id="${itemId}" ${attr(!canEquip.ok, 'disabled')} title="${canEquip.ok ? `Equip: ${SLOT_LABELS[game.defaultSlot(itemId) ?? 'main_hand']}` : canEquip.reason}">Equip</button>` : ''}
                  ${offHand ? html`<button class="btn btn-small" data-action="equip" data-id="${itemId}" data-slot="off_hand" ${attr(!offHand.ok, 'disabled')} title="${offHand.ok ? 'Equip in the off hand (half stats)' : offHand.reason}">Off hand</button>` : ''}
                  ${item.consume ? html`<button class="btn btn-small" data-action="use" data-id="${itemId}">Use</button>` : ''}
                </div>
              </div>`;
            })}
          </div>
        </section>
      </div>
    `;
  },
};
