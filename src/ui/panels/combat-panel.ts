import { fmtDuration } from '@/util/format';
import { itemName } from '../components/items';
import { progressBar } from '../components/progress-bar';
import { attr, html } from '../html';
import type { Panel } from '../panel';

export const combatPanel: Panel = {
  id: 'combat',
  title: 'Combat',
  width: 860,
  render({ game }) {
    const state = game.state;
    const zone = game.content.zone(state.player.zoneId);
    const stats = game.stats();
    const combat = state.combat;
    const monster = combat ? game.content.monster(combat.monsterId) : null;
    const feed = state.log.filter((e) => e.kind === 'combat' || e.kind === 'loot' || e.kind === 'warn').slice(-14).reverse();
    const food = state.inventory.filter((s) => game.content.item(s.itemId).consume);
    const weaponSkill = game.weaponSkill();
    const training = [
      weaponSkill ? `${game.content.skill(weaponSkill).name} T${game.skillTier(weaponSkill)}` : 'no weapon skill',
      `Armor T${game.skillTier('armor')}`,
      game.hasShield() ? `Shields T${game.skillTier('shields')}` : 'Shields (equip one)',
      `Vitality T${game.skillTier('vitality')}`,
    ];

    return html`
      <div class="panel-head"><span class="muted small">Training ${training.join(' · ')}${game.hasFeature('auto_eat') ? ' · auto-eat on' : ''}</span></div>

      ${combat && monster
        ? html`
          <section class="card card-active fight">
            <div class="grid grid-2">
              <div>
                <div class="row"><strong>${state.player.name}</strong><span class="muted small">atk ${stats.attack} · str ${stats.strength} · def ${stats.defence} · ${fmtDuration(stats.attackIntervalMs)}/hit</span></div>
                ${progressBar(state.player.hp / stats.maxHp, 'hp', `${state.player.hp} / ${stats.maxHp} hp`)}
                ${food.length ? html`<div class="row wrap">${food.map((s) => html`<button class="btn btn-small" data-action="use" data-id="${s.itemId}">Eat ${game.content.item(s.itemId).name} (${s.qty})</button>`)}</div>` : ''}
              </div>
              <div>
                <div class="row"><strong>${monster.name} <span class="muted small">T${monster.tier}</span></strong><span class="muted small">atk ${monster.attack} · str ${monster.strength} · def ${monster.defence} · ${fmtDuration(monster.attackIntervalMs)}/hit</span></div>
                ${progressBar(combat.monsterHp / monster.hp, 'monster', `${combat.monsterHp} / ${monster.hp} hp`)}
                <div class="row"><span class="tag">${combat.kills} kills this session</span><button class="btn btn-small" data-action="stop">Retreat</button></div>
              </div>
            </div>
          </section>`
        : ''}

      <div class="grid grid-2 grid-combat">
        <section class="card">
          <h3>Targets in ${zone.name} <span class="muted">walk up to one and press E, or pick one here and you will walk over</span></h3>
          <div class="grid grid-auto-sm">
            ${zone.monsters.map((id) => {
              const m = game.content.monster(id);
              const isActive = combat?.monsterId === id;
              return html`
                <div class="card card-inner ${isActive ? 'card-active' : ''}">
                  <div class="card-head"><strong>${m.name}</strong><span class="tag">T${m.tier}</span></div>
                  <div class="muted small">${m.hp} hp · atk ${m.attack} · str ${m.strength} · def ${m.defence}</div>
                  <div class="muted small">Drops: ${m.loot.length ? m.loot.map((l, i) => html`${i > 0 ? ', ' : ''}${itemName(game, l.itemId)}`) : 'nothing'}${m.gold[1] > 0 ? html`, ${m.gold[0]}–${m.gold[1]} gold` : ''}</div>
                  <div class="row">
                    ${isActive
                      ? html`<button class="btn btn-small" data-action="stop">Stop</button>`
                      : html`<button class="btn btn-small btn-primary" data-action="fight" data-id="${id}" ${attr(!game.canFight(id).ok, 'disabled')}>Fight</button>`}
                  </div>
                </div>`;
            })}
          </div>
        </section>
        <section class="card">
          <h3>Combat log</h3>
          <ul class="feed">${feed.length ? feed.map((e) => html`<li class="log-${e.kind}">${e.text}</li>`) : html`<li class="muted">Nothing yet.</li>`}</ul>
        </section>
      </div>
    `;
  },
};
