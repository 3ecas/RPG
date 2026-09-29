import { BALANCE } from '@/content/balance';
import { fmtDate, fmtDuration } from '@/util/format';
import { html } from '../html';
import type { Panel } from '../panel';

export const settingsPanel: Panel = {
  id: 'settings',
  title: 'Settings',
  group: 'System',
  render({ game, ui }) {
    return html`
      <h2>Settings</h2>
      <section class="card">
        <h3>Character</h3>
        <table class="table">
          <tr><td class="muted">Name</td><td>${game.state.player.name}</td></tr>
          <tr><td class="muted">Created</td><td>${fmtDate(game.state.meta.createdAt)}</td></tr>
          <tr><td class="muted">Time played</td><td>${fmtDuration(game.state.time.nowMs)}</td></tr>
          <tr><td class="muted">Seed</td><td>${game.state.meta.seed}</td></tr>
        </table>
      </section>
      <section class="card">
        <h3>Save</h3>
        <p class="muted small">The game autosaves every ${fmtDuration(BALANCE.AUTOSAVE_MS)} and when you leave the tab. Progress while away is simulated for up to ${fmtDuration(BALANCE.OFFLINE_CAP_MS)}.</p>
        <div class="row wrap">
          <button class="btn" data-action="save">Save now</button>
          <button class="btn" data-action="export">Export save</button>
        </div>
        ${ui.exportText ? html`<textarea class="save-text" readonly rows="4">${ui.exportText}</textarea><p class="muted small">Copy this text somewhere safe.</p>` : ''}
        <h3>Import</h3>
        <textarea id="import-text" class="save-text" rows="4" placeholder="Paste an exported save here"></textarea>
        <div class="row"><button class="btn" data-action="import">Import save</button></div>
      </section>
      <section class="card card-danger">
        <h3>Danger</h3>
        <div class="row"><button class="btn btn-danger" data-action="reset">Delete character and start over</button></div>
      </section>
    `;
  },
};
