import type { CombatStyle } from '@/types/state';
import { fmtDuration } from '@/util/format';
import { itemName } from '../components/items';
import { progressBar } from '../components/progress-bar';
import { attr, html } from '../html';
import type { Panel } from '../panel';

const STYLES: { id: CombatStyle; label: string; hint: string }[] = [
  { id: 'attack', label: 'Accurate', hint: 'Trains Attack' },
  { id: 'strength', label: 'Aggressive', hint: 'Trains Strength' },
  { id: 'defence', label: 'Defensive', hint: 'Trains Defence' },
];

export const combatPanel: Panel = {
  id: 'combat',
  title: 'Combat',
  group: 'Work',
  render({ game }) {
    const state = game.state;
    const zone = game.content.zone(state.player.zoneId);
    const stats = game.stats();
    const combat = state.combat;
    const monster = combat ? game.content.monster(combat.monsterId) : null;
    const feed = state.log.filter((e) => e.kind === 'combat' || e.kind === 'loot' || e.kind === 'warn').slice(-12);
    const food = state.inventory.filter((s) => game.content.item(s.itemId).consume);

    return html`
      <h2>Combat <span class="muted">in ${zone.name}</span></h2>
      <div class="row wrap">
        <span class="muted small">Style:</span>
        ${STYLES.map((s) => html`<button class="btn btn-small ${state.player.combatStyle === s.id ? 'btn-active' : ''}" data-action="style" data-id="${s.id}" title="${s.hint}">${s.label}</button>`)}
      </div>

      ${combat && monster
        ? html`
          <section class="card card-active fight">
            <div class="columns">
              <div>
                <h3>${state.player.name}</h3>
                ${progressBar(state.player.hp / stats.maxHp, 'hp', `${state.player.hp} / ${stats.maxHp} hp`)}
                <div class="muted small">atk ${stats.attack} · str ${stats.strength} · def ${stats.defence} · ${fmtDuration(stats.attackIntervalMs)}/hit</div>
                ${food.length ? html`<div class="row wrap top-gap">${food.map((s) => html`<button class="btn btn-small" data-action="use" data-id="${s.itemId}">Eat ${game.content.item(s.itemId).name} (${s.qty})</button>`)}</div>` : ''}
              </div>
              <div>
                <h3>${monster.name} <span class="muted small">lvl ${monster.level}</span></h3>
                ${progressBar(combat.monsterHp / monster.hp, 'monster', `${combat.monsterHp} / ${monster.hp} hp`)}
                <div class="muted small">atk ${monster.attack} · str ${monster.strength} · def ${monster.defence} · ${fmtDuration(monster.attackIntervalMs)}/hit</div>
                <div class="top-gap"><span class="tag">${combat.kills} kills this session</span> <button class="btn btn-small" data-action="stop">Retreat</button></div>
              </div>
            </div>
          </section>`
        : html`<p class="muted">Pick a target. Fighting continues until you stop, die, or leave.</p>`}

      <div class="cards">
        ${zone.monsters.map((id) => {
          const m = game.content.monster(id);
          const isActive = combat?.monsterId === id;
          return html`
            <div class="card ${isActive ? 'card-active' : ''}">
              <div class="card-head"><strong>${m.name}</strong><span class="tag">lvl ${m.level}</span></div>
              <p class="muted">${m.description}</p>
              <div class="muted small">${m.hp} hp · atk ${m.attack} · str ${m.strength} · def ${m.defence}</div>
              <div class="muted small">Drops: ${m.loot.length ? m.loot.map((l, i) => html`${i > 0 ? ', ' : ''}${itemName(game, l.itemId)}`) : 'nothing'}${m.gold[1] > 0 ? html`, ${m.gold[0]}–${m.gold[1]} gold` : ''}</div>
              <div class="row top-gap">
                ${isActive
                  ? html`<button class="btn" data-action="stop">Stop</button>`
                  : html`<button class="btn btn-primary" data-action="fight" data-id="${id}" ${attr(!game.canFight(id).ok, 'disabled')}>Fight</button>`}
              </div>
            </div>`;
        })}
      </div>

      ${feed.length ? html`<section class="card"><h3>Combat log</h3><ul class="feed">${feed.map((e) => html`<li class="log-${e.kind}">${e.text}</li>`)}</ul></section>` : ''}
    `;
  },
};
