import { html, type Raw } from '../html';
import { icon } from '../icons';

/** A compact notice for locked panels, with a jump to the tree. */
export function lockNotice(reason: string): Raw {
  return html`<div class="lock-notice"><span>${icon('lock')} ${reason}</span><button class="btn btn-small" data-action="window" data-id="tree">Open Progression</button></div>`;
}
