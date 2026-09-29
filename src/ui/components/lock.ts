import { html, type Raw } from '../html';

/** A compact notice for locked panels, with a jump to the tree. */
export function lockNotice(reason: string): Raw {
  return html`<div class="lock-notice"><span>🔒 ${reason}</span><button class="btn btn-small" data-action="panel" data-id="tree">Open Progression</button></div>`;
}
