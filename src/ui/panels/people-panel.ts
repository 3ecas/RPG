import type { Keyed, QuestDef } from '@/types/content';
import type { QuestId } from '@/types/ids';
import type { Game } from '@/game';
import { itemName, requirementList } from '../components/items';
import { attr, html, type Raw } from '../html';
import type { Panel } from '../panel';

function rewardText(game: Game, quest: Keyed<QuestDef, QuestId>): Raw {
  return html`${quest.rewards.map((r, i) => {
    const sep = i > 0 ? ', ' : '';
    switch (r.type) {
      case 'gold': return html`${sep}${r.amount} gold`;
      case 'item': return html`${sep}${r.qty}× ${itemName(game, r.itemId)}`;
      case 'xp': return html`${sep}${r.amount} ${game.content.skill(r.skill).name} xp`;
    }
  })}`;
}

export const peoplePanel: Panel = {
  id: 'people',
  title: 'People',
  group: 'World',
  badge({ game }) {
    return game.npcsHere().flatMap((npc) => game.questsByGiver(npc.id)).filter((q) => q.status === 'available' || (q.status === 'active' && game.canTurnIn(q.quest.id).ok)).length;
  },
  render({ game }) {
    const zone = game.content.zone(game.state.player.zoneId);
    const npcs = game.npcsHere();
    if (npcs.length === 0) return html`<h2>People</h2><p class="muted">Nobody lives in ${zone.name}. The village is where the quests are.</p>`;
    return html`
      <h2>People <span class="muted">in ${zone.name}</span></h2>
      <div class="cards cards-wide">
        ${npcs.map((npc) => {
          const talked = game.state.world.talkedTo.includes(npc.id);
          const quests = game.questsByGiver(npc.id);
          return html`
            <div class="card">
              <div class="card-head"><strong>${npc.name}</strong><span class="tag">${npc.title}</span></div>
              ${talked ? html`<p class="quote">“${npc.greeting}”</p>` : html`<div class="row"><button class="btn btn-small" data-action="talk" data-id="${npc.id}">Talk</button></div>`}
              ${quests.map(({ quest, status }) => html`
                <div class="quest quest-${status}">
                  <div class="row"><strong>${quest.name}</strong><span class="tag">${status}</span></div>
                  <p class="muted small">${quest.description}</p>
                  ${status === 'locked' ? html`<div class="small">${requirementList(game, quest.prerequisites)}</div>` : ''}
                  ${status === 'available' ? html`<div class="small"><span class="muted">Reward:</span> ${rewardText(game, quest)}</div><div class="row top-gap"><button class="btn btn-small btn-primary" data-action="accept-quest" data-id="${quest.id}">Accept</button></div>` : ''}
                  ${status === 'active' ? (() => {
                    const can = game.canTurnIn(quest.id);
                    return html`
                      <ul class="objectives">${game.questObjectives(quest.id).map((o) => html`<li class="${o.done ? 'ok' : ''}">${o.done ? '✓' : '○'} ${o.text} <span class="muted small">${o.current}/${o.target}</span></li>`)}</ul>
                      <div class="row"><button class="btn btn-small btn-primary" data-action="turn-in" data-id="${quest.id}" ${attr(!can.ok, 'disabled')} title="${can.ok ? '' : can.reason}">Turn in</button>${can.ok ? '' : html`<span class="muted small">${can.reason}</span>`}</div>`;
                  })() : ''}
                  ${status === 'completed' ? html`<div class="ok small">Completed</div>` : ''}
                </div>`)}
            </div>`;
        })}
      </div>
    `;
  },
};
