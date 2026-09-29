import type { StationId } from '@/types/ids';
import { fmtDuration } from '@/util/format';
import { categoryList, itemLink } from '../components/catalogue';
import { stackList } from '../components/items';
import { attr, html } from '../html';
import { catalogueKey, categoriesOf } from '../groups';
import type { Panel } from '../panel';

/** One panel per station; the recipes come from content. A category list filters them. */
export function craftingPanel(station: StationId, title: string): Panel {
  return {
    id: station,
    title,
    width: 900,
    render({ game, params, windowId }) {
      const def = game.content.station(station);
      const here = game.stationHere(station);
      const elsewhere = game.zoneWithStation(station);
      const recipes = game.content.recipesByStation(station);
      const outputs = recipes.map((r) => r.outputs[0]!.itemId);
      const categories = categoriesOf(game, outputs);
      const selected = params.cat && params.cat !== 'all' ? params.cat : null;
      const shown = recipes.filter((r) => !selected || catalogueKey(game.content.item(r.outputs[0]!.itemId)) === selected);
      const active = game.state.activity?.kind === 'craft' ? game.state.activity : null;
      return html`
        <p class="muted small">${def.description}${here ? '' : html` <span class="warn">No ${def.name} in ${game.content.zone(game.state.player.zoneId).name}${elsewhere ? html`; the nearest is in ${game.content.zone(elsewhere).name}` : ''}.</span> <button class="btn btn-small" data-action="window" data-id="zones">Travel</button>`}</p>
        <div class="catalogue">
          ${categoryList(windowId, categories, selected, recipes.length)}
          <table class="table table-recipes ${here ? '' : 'table-dim'}">
            <tr class="head"><th>Recipe</th><th>Tier</th><th>Needs</th><th>Makes</th><th></th><th></th></tr>
            ${shown.map((recipe) => {
              const can = game.canCraft(recipe.id);
              const isActive = active?.recipeId === recipe.id;
              const max = game.maxCraftable(recipe.id);
              const skill = game.content.skill(recipe.skill);
              const output = recipe.outputs[0]!;
              return html`<tr class="${isActive ? 'row-active' : ''} ${can.ok ? '' : 'row-dim'}">
                <td class="name">${itemLink(game, output.itemId)}<div class="muted small">${recipe.xp} ${skill.name} xp · ${fmtDuration(recipe.durationMs)}</div></td>
                <td class="num">T${recipe.tier}</td>
                <td>${stackList(game, recipe.inputs)}</td>
                <td>${recipe.outputs.map((o, i) => html`${i > 0 ? ', ' : ''}${o.qty}× ${itemLink(game, o.itemId)}`)}</td>
                <td class="actions">
                  ${isActive
                    ? html`<span class="ok small">${active?.remaining} left</span> <button class="btn btn-small" data-action="stop">Stop</button>`
                    : html`
                      <button class="btn btn-small btn-primary" data-action="craft" data-id="${recipe.id}" data-qty="1" ${attr(!can.ok, 'disabled')} title="${can.ok ? '' : can.reason}">1</button>
                      <button class="btn btn-small" data-action="craft" data-id="${recipe.id}" data-qty="5" ${attr(!can.ok || max < 2, 'disabled')}>5</button>
                      <button class="btn btn-small" data-action="craft" data-id="${recipe.id}" data-qty="all" ${attr(!can.ok || max < 2, 'disabled')}>All (${max})</button>`}
                </td>
                <td class="small bad">${can.ok || isActive || !here ? '' : can.reason}</td>
              </tr>`;
            })}
          </table>
        </div>
      `;
    },
  };
}
