import type { QuestId } from '@/types/ids';
import { attr, html } from '../html';
import { icon } from '../icons';
import type { Panel } from '../panel';

/** The campaign: chapters of missions, plus the quests people have given you. */
export const missionsPanel: Panel = {
  id: 'missions',
  title: 'Missions',
  width: 860,
  badge({ game }) {
    const claimable = game.missionsInChapter(game.currentChapter()).filter((m) => game.canClaimMission(m.id).ok).length;
    const questsReady = (Object.keys(game.state.quests.active) as QuestId[]).filter((id) => game.questObjectives(id).every((o) => o.done)).length;
    return claimable + questsReady;
  },
  render({ game }) {
    const current = game.currentChapter();
    const chapters = game.chapters();
    const activeQuests = Object.keys(game.state.quests.active) as QuestId[];
    return html`
      <div class="panel-head"><span class="muted small">Chapter ${Math.min(current, chapters.length)} of ${chapters.length} · finish every mission of a chapter to open the next · missions pay gold, xp, items and progression points</span></div>
      <div class="grid grid-2">
        <section class="card">
          ${chapters.map((chapter) => {
            const status = game.chapterStatus(chapter.number);
            const missions = game.missionsInChapter(chapter.number);
            const claimed = missions.filter((m) => game.isMissionClaimed(m.id)).length;
            if (status === 'locked') return html`<div class="chapter chapter-locked"><div class="row"><strong>${icon('lock')} ${chapter.number}. ${chapter.name}</strong><span class="muted small">${missions.length} missions</span></div><div class="muted small">${chapter.blurb}</div></div>`;
            if (status === 'done') return html`<div class="chapter chapter-done"><div class="row"><strong>${icon('check', 'icon-ok')} ${chapter.number}. ${chapter.name}</strong><span class="muted small">${claimed}/${missions.length}</span></div></div>`;
            return html`
              <div class="chapter chapter-current">
                <div class="row"><strong>${chapter.number}. ${chapter.name}</strong><span class="muted small">${claimed}/${missions.length} claimed</span></div>
                <div class="muted small">${chapter.blurb}</div>
                ${missions.map((mission) => {
                  const done = game.isMissionClaimed(mission.id);
                  const objectives = game.missionObjectives(mission.id);
                  const can = game.canClaimMission(mission.id);
                  return html`
                    <div class="quest ${done ? 'quest-done' : can.ok ? 'quest-ready' : ''}">
                      <div class="row"><strong>${done ? html`${icon('check', 'icon-ok')} ` : ''}${mission.name}</strong>${done ? html`<span class="tag">claimed</span>` : html`<button class="btn btn-small ${can.ok ? 'btn-primary' : ''}" data-action="claim-mission" data-id="${mission.id}" ${attr(!can.ok, 'disabled')} title="${can.ok ? '' : can.reason}">Claim</button>`}</div>
                      ${done ? '' : html`
                        <div class="muted small">${mission.description}</div>
                        <ul class="objectives">${objectives.map((o) => html`<li class="${o.done ? 'ok' : ''}">${icon(o.done ? 'check' : 'circle', o.done ? 'icon-ok' : 'icon-muted')} ${o.text} <span class="muted small">${o.current}/${o.target}</span></li>`)}</ul>
                        <div class="small"><span class="muted">Reward:</span> ${mission.rewards.map((r) => (r.type === 'gold' ? `${r.amount} gold` : r.type === 'xp' ? `${r.amount} ${game.content.skill(r.skill).name} xp` : r.type === 'item' ? `${r.qty}× ${game.content.item(r.itemId).name}` : `${r.amount} progression point${r.amount === 1 ? '' : 's'}`)).join(', ')}</div>`}
                    </div>`;
                })}
              </div>`;
          })}
        </section>
        <section class="card">
          <h3>Quests from people</h3>
          ${activeQuests.length === 0 ? html`<p class="muted small">No active quests. Talk to people on the map.</p>` : ''}
          ${activeQuests.map((id) => {
            const quest = game.content.quest(id);
            const giver = game.content.npc(quest.giverId);
            const objectives = game.questObjectives(id);
            const done = objectives.every((o) => o.done);
            return html`
              <div class="quest ${done ? 'quest-ready' : ''}">
                <div class="row"><strong>${quest.name}</strong><span class="muted small">${giver.name}, ${giver.title}</span></div>
                <div class="muted small">${quest.description}</div>
                <ul class="objectives">${objectives.map((o) => html`<li class="${o.done ? 'ok' : ''}">${icon(o.done ? 'check' : 'circle', o.done ? 'icon-ok' : 'icon-muted')} ${o.text} <span class="muted small">${o.current}/${o.target}</span></li>`)}</ul>
                ${done ? html`<div class="ok small">Ready: return to ${giver.name}.</div>` : ''}
              </div>`;
          })}
          ${game.state.quests.completed.length ? html`<h3>Completed quests</h3><ul class="small">${game.state.quests.completed.map((id) => html`<li>${icon('check', 'icon-ok')} ${game.content.quest(id).name}</li>`)}</ul>` : ''}
        </section>
      </div>
    `;
  },
};
