import { html, type Raw } from '../html';

export type BarKind = 'xp' | 'hp' | 'activity' | 'monster';

export function progressBar(fraction: number, kind: BarKind, label = ''): Raw {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 1000) / 10;
  return html`<div class="bar bar-${kind}" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><div class="bar-fill" style="width:${pct}%"></div>${label ? html`<span class="bar-label">${label}</span>` : ''}</div>`;
}
