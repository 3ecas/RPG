import { npcCard } from '../components/npc-card';
import { html } from '../html';
import type { Panel } from '../panel';

/** One person, opened from their marker on the map. */
export const npcPanel: Panel = {
  id: 'npc',
  width: 460,
  title: ({ game, params }) => {
    const id = params.id ?? '';
    return game.content.hasNpc(id) ? `${game.content.npc(id).name}, ${game.content.npc(id).title}` : 'Person';
  },
  render({ game, params }) {
    const id = params.id ?? '';
    if (!game.content.hasNpc(id)) return html`<p class="muted">Nobody here by that name.</p>`;
    if (!game.npcsHere().some((n) => n.id === id)) return html`<p class="muted">${game.content.npc(id).name} is not in this zone.</p>`;
    return npcCard(game, game.content.npc(id), true);
  },
};
