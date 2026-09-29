import type { SkillGroup } from '@/types/content';
import { fmtNum } from '@/util/format';
import { progressBar } from '../components/progress-bar';
import { html } from '../html';
import type { Panel } from '../panel';

const GROUPS: { id: SkillGroup; title: string; hint: string }[] = [
  { id: 'gathering', title: 'Gathering', hint: 'Each tier unlocks the next material.' },
  { id: 'production', title: 'Production', hint: 'Each tier unlocks that tier of recipes.' },
  { id: 'combat', title: 'Combat', hint: 'Weapons train by use; Armor and Shields by attacks taken; Vitality by damage dealt.' },
];

export const skillsPanel: Panel = {
  id: 'skills',
  title: 'Skills',
  render({ game }) {
    const skills = game.content.skillIds.map((id) => game.content.skill(id));
    return html`
      <div class="panel-head"><h2>Skills</h2><span class="muted small">${game.totalTier()} of ${skills.length * 6} tiers · fill a bar to unlock the next tier</span></div>
      <div class="grid grid-3">
        ${GROUPS.map((group) => html`
          <section class="card">
            <h3>${group.title} <span class="muted">${group.hint}</span></h3>
            ${skills.filter((s) => s.group === group.id).map((skill) => {
              const lock = game.skillLockReason(skill.id);
              const v = game.skillView(skill.id);
              return lock
                ? html`<div class="skill-row locked" title="${lock}"><span class="name">${v.name}</span><span class="muted small">🔒 locked</span><span class="muted small lock-hint">${lock.replace(`${v.name} is locked. `, '')}</span></div>`
                : html`<div class="skill-row" title="${skill.description}">
                    <span class="name">${v.name}</span>
                    <span class="tier" title="${v.tierName}">T${v.tier}</span>
                    ${progressBar(v.progress, 'xp')}
                    <span class="muted small num">${v.tierSize === null ? 'max' : `${fmtNum(v.xpIntoTier)}/${fmtNum(v.tierSize)}`}</span>
                  </div>`;
            })}
          </section>`)}
      </div>
    `;
  },
};
