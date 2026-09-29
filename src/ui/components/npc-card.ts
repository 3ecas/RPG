import type { Game } from '@/game';
import type { Keyed, NpcDef, QuestDef } from '@/types/content';
import type { NpcId, QuestId } from '@/types/ids';
import { attr, html, type Raw } from '../html';
import { itemName, requirementList } from './items';

function rewardText(game: Game, quest: Keyed<QuestDef, QuestId>): Raw {
  return html`${quest.rewards.map((r, i) => {
    const sep = i > 0 ? ', ' : '';
    switch (r.type) {
      case 'gold': return html`${sep}${r.amount} gold`;
      case 'item': return html`${sep}${r.qty}× ${itemName(game, r.itemId)}`;
      case 'xp': return html`${sep}${r.amount} ${game.content.skill(r.skill).name} xp`;
      case 'points': return html`${sep}${r.amount} progression point${r.amount === 1 ? '' : 's'}`;
    }
  })}`;
}

/** One person: greeting, shop link, and their quests with accept / turn-in. */
export function npcCard(game: Game, npc: Keyed<NpcDef, NpcId>, standalone = false): Raw {
  const talked = game.state.world.talkedTo.includes(npc.id);
  const quests = game.questsByGiver(npc.id);
  return html`
    <div class="${standalone ? '' : 'card'}">
      ${standalone ? '' : html`<div class="card-head"><strong>${npc.name}</strong><span class="tag">${npc.title}</span></div>`}
      ${talked ? html`<p class="quote">“${npc.greeting}”</p>` : html`<div class="row"><button class="btn btn-small btn-primary" data-action="talk" data-id="${npc.id}">Talk</button></div>`}
      ${game.content.shopsKeptBy(npc.id).map((shop) => html`<div class="row"><button class="btn btn-small" data-action="open-shop" data-id="${shop.id}">Browse ${shop.name}</button></div>`)}
      ${quests.map(({ quest, status }) => html`
        <div class="quest quest-${status}">
          <div class="row"><strong>${quest.name}</strong><span class="tag">${status}</span></div>
          <div class="muted small">${quest.description}</div>
          ${status === 'locked' ? html`<div class="small">${requirementList(game, quest.prerequisites)}</div>` : ''}
          ${status === 'available' ? html`<div class="small"><span class="muted">Reward:</span> ${rewardText(game, quest)}</div><div class="row"><button class="btn btn-small btn-primary" data-action="accept-quest" data-id="${quest.id}">Accept</button></div>` : ''}
          ${status === 'active' ? (() => {
            const can = game.canTurnIn(quest.id);
            return html`
              <ul class="objectives">${game.questObjectives(quest.id).map((o) => html`<li class="${o.done ? 'ok' : ''}">${o.done ? '✓' : '○'} ${o.text} <span class="muted small">${o.current}/${o.target}</span></li>`)}</ul>
              <div class="row"><button class="btn btn-small btn-primary" data-action="turn-in" data-id="${quest.id}" ${attr(!can.ok, 'disabled')} title="${can.ok ? '' : can.reason}">Turn in</button>${can.ok ? '' : html`<span class="muted small">${can.reason}</span>`}</div>`;
          })() : ''}
          ${status === 'completed' ? html`<div class="ok small">Completed</div>` : ''}
        </div>`)}
    </div>`;
}
