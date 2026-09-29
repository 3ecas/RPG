import type { SkillGroup } from '@/types/content';
import { fmtNum } from '@/util/format';
import { progressBar } from '../components/progress-bar';
import { html } from '../html';
import type { Panel } from '../panel';

const GROUPS: { id: SkillGroup; title: string }[] = [
  { id: 'gathering', title: 'Gathering' },
  { id: 'production', title: 'Production' },
  { id: 'combat', title: 'Combat' },
];

export const skillsPanel: Panel = {
  id: 'skills',
  title: 'Skills',
  group: 'Character',
  render({ game }) {
    const skills = game.content.skillIds.map((id) => game.content.skill(id));
    return html`
      <h2>Skills <span class="muted">total level ${game.totalLevel()}</span></h2>
      ${GROUPS.map((group) => html`
        <section class="card">
          <h3>${group.title}</h3>
          <table class="table">
            ${skills.filter((s) => s.group === group.id).map((skill) => {
              const v = game.skillView(skill.id);
              return html`<tr>
                <td class="name" title="${skill.description}">${v.name}</td>
                <td class="num level">${v.level}</td>
                <td class="bar-cell">${progressBar(v.progress, 'xp')}</td>
                <td class="num muted small">${v.xpForNext === null ? 'max' : `${fmtNum(v.xpForNext - v.xp)} xp to ${v.level + 1}`}</td>
              </tr>`;
            })}
          </table>
        </section>`)}
    `;
  },
};
