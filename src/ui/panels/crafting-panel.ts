import type { StationId } from '@/types/ids';
import { fmtDuration } from '@/util/format';
import { itemName, stackList } from '../components/items';
import { lockNotice } from '../components/lock';
import { attr, html } from '../html';
import type { Panel } from '../panel';

/** One panel per station; the recipes come from content. */
export function craftingPanel(station: StationId, title: string): Panel {
  return {
    id: station,
    title,
    lock: ({ game }) => game.stationLockReason(station),
    render({ game }) {
      const def = game.content.station(station);
      const lock = game.stationLockReason(station);
      const recipes = game.content.recipesByStation(station);
      const active = game.state.activity?.kind === 'craft' ? game.state.activity : null;
      return html`
        <div class="panel-head"><h2>${def.name}</h2><span class="muted small">${def.description}</span></div>
        ${lock ? lockNotice(`The ${def.name} is locked. ${lock}`) : ''}
        <table class="table table-recipes ${lock ? 'table-dim' : ''}">
          <tr class="head"><th>Recipe</th><th>Tier</th><th>Needs</th><th>Makes</th><th></th><th></th></tr>
          ${recipes.map((recipe) => {
            const can = game.canCraft(recipe.id);
            const isActive = active?.recipeId === recipe.id;
            const max = game.maxCraftable(recipe.id);
            const skill = game.content.skill(recipe.skill);
            return html`<tr class="${isActive ? 'row-active' : ''} ${can.ok ? '' : 'row-dim'}">
              <td class="name"><strong>${game.content.recipeName(recipe)}</strong><div class="muted small">${recipe.xp} ${skill.name} xp · ${fmtDuration(recipe.durationMs)}</div></td>
              <td class="num">T${recipe.tier}</td>
              <td>${stackList(game, recipe.inputs)}</td>
              <td>${recipe.outputs.map((o, i) => html`${i > 0 ? ', ' : ''}${o.qty}× ${itemName(game, o.itemId)}`)}</td>
              <td class="actions">
                ${isActive
                  ? html`<span class="ok small">${active?.remaining} left</span> <button class="btn btn-small" data-action="stop">Stop</button>`
                  : html`
                    <button class="btn btn-small btn-primary" data-action="craft" data-id="${recipe.id}" data-qty="1" ${attr(!can.ok, 'disabled')} title="${can.ok ? '' : can.reason}">1</button>
                    <button class="btn btn-small" data-action="craft" data-id="${recipe.id}" data-qty="5" ${attr(!can.ok || max < 2, 'disabled')}>5</button>
                    <button class="btn btn-small" data-action="craft" data-id="${recipe.id}" data-qty="all" ${attr(!can.ok || max < 2, 'disabled')}>All (${max})</button>`}
              </td>
              <td class="small bad">${can.ok || isActive || lock ? '' : can.reason}</td>
            </tr>`;
          })}
        </table>
      `;
    },
  };
}
