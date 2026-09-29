import type { QuestId } from '@/types/ids';
import { html } from '../html';
import type { Panel } from '../panel';

export const journalPanel: Panel = {
  id: 'journal',
  title: 'Journal',
  badge({ game }) {
    return (Object.keys(game.state.quests.active) as QuestId[]).filter((id) => game.questObjectives(id).every((o) => o.done)).length;
  },
  render({ game }) {
    const active = Object.keys(game.state.quests.active) as QuestId[];
    const completed = game.state.quests.completed;
    return html`
      <div class="panel-head"><h2>Journal</h2><span class="muted small">quests come from people in the village</span></div>
      <div class="grid grid-2">
        <section class="card">
          <h3>Active</h3>
          ${active.length === 0 ? html`<p class="muted small">No active quests.</p>` : ''}
          ${active.map((id) => {
            const quest = game.content.quest(id);
            const giver = game.content.npc(quest.giverId);
            const objectives = game.questObjectives(id);
            const done = objectives.every((o) => o.done);
            return html`
              <div class="quest ${done ? 'quest-ready' : ''}">
                <div class="row"><strong>${quest.name}</strong><span class="muted small">${giver.name}, ${giver.title}</span></div>
                <div class="muted small">${quest.description}</div>
                <ul class="objectives">${objectives.map((o) => html`<li class="${o.done ? 'ok' : ''}">${o.done ? '✓' : '○'} ${o.text} <span class="muted small">${o.current}/${o.target}</span></li>`)}</ul>
                ${done ? html`<div class="ok small">Ready: return to ${giver.name}.</div>` : ''}
              </div>`;
          })}
        </section>
        <section class="card">
          <h3>Completed</h3>
          ${completed.length === 0 ? html`<p class="muted small">Nothing yet.</p>` : html`<ul>${completed.map((id) => html`<li>✓ ${game.content.quest(id).name}</li>`)}</ul>`}
        </section>
      </div>
    `;
  },
};
