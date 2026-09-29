import type { LogKind } from '@/types/state';
import { fmtDuration } from '@/util/format';
import { html } from '../html';
import type { Panel } from '../panel';

const FILTERS: { id: LogKind | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'combat', label: 'Combat' },
  { id: 'loot', label: 'Loot' },
  { id: 'level', label: 'Levels' },
  { id: 'quest', label: 'Quests' },
  { id: 'trade', label: 'Trade' },
  { id: 'info', label: 'Info' },
  { id: 'warn', label: 'Warnings' },
];

export const logPanel: Panel = {
  id: 'log',
  title: 'Log',
  width: 680,
  render({ game, ui }) {
    const entries = game.state.log.filter((e) => ui.logFilter === 'all' || e.kind === ui.logFilter).slice(-100).reverse();
    return html`
      <div class="panel-head"><span class="row wrap">${FILTERS.map((f) => html`<button class="btn btn-small ${ui.logFilter === f.id ? 'btn-active' : ''}" data-action="log-filter" data-id="${f.id}">${f.label}</button>`)}</span></div>
      <ul class="feed feed-full">
        ${entries.length === 0 ? html`<li class="muted">Nothing here yet.</li>` : ''}
        ${entries.map((e) => html`<li class="log-${e.kind}"><span class="muted small stamp">${fmtDuration(e.t)}</span> ${e.text}</li>`)}
      </ul>
    `;
  },
};
