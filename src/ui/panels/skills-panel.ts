import type { SkillGroup } from '@/types/content';
import { fmtNum } from '@/util/format';
import { progressBar } from '../components/progress-bar';
import { html } from '../html';
import type { Panel } from '../panel';

const GROUPS: { id: SkillGroup; title: string; hint: string }[] = [
  { id: 'gathering', title: 'Gathering', hint: 'Each tier unlocks the next material: copper, iron, steel, mithril, adamant, rune.' },
  { id: 'production', title: 'Production', hint: 'Each tier unlocks the recipes of that tier.' },
  { id: 'combat', title: 'Combat', hint: 'Weapon skills train with the weapon you hold. Armor and Shields train from attacks you take. Vitality trains from damage you deal.' },
];

export const skillsPanel: Panel = {
  id: 'skills',
  title: 'Skills',
  group: 'Character',
  render({ game }) {
    const skills = game.content.skillIds.map((id) => game.content.skill(id));
    return html`
      <h2>Skills <span class="muted">${game.totalTier()} of ${skills.length * 6} tiers</span></h2>
      <p class="muted small">Every skill has six tiers. Fill a tier's bar to unlock the next, and with it the next tier of nodes, recipes and gear.</p>
      ${GROUPS.map((group) => html`
        <section class="card">
          <h3>${group.title}</h3>
          <p class="muted small">${group.hint}</p>
          <table class="table">
            ${skills.filter((s) => s.group === group.id).map((skill) => {
              const v = game.skillView(skill.id);
              return html`<tr>
                <td class="name" title="${skill.description}">${v.name}</td>
                <td class="num level" title="${v.tierName}">T${v.tier}</td>
                <td class="muted small tier-name">${v.tierName}</td>
                <td class="bar-cell">${progressBar(v.progress, 'xp')}</td>
                <td class="num muted small">${v.tierSize === null ? 'max tier' : `${fmtNum(v.xpIntoTier)} / ${fmtNum(v.tierSize)} xp to T${v.tier + 1}`}</td>
              </tr>`;
            })}
          </table>
        </section>`)}
    `;
  },
};
