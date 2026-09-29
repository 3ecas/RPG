import { npcCard } from '../components/npc-card';
import { html } from '../html';
import type { Panel } from '../panel';

export const peoplePanel: Panel = {
  id: 'people',
  title: 'People',
  width: 760,
  badge({ game }) {
    return game.npcsHere().flatMap((npc) => game.questsByGiver(npc.id)).filter((q) => q.status === 'available' || (q.status === 'active' && game.canTurnIn(q.quest.id).ok)).length;
  },
  render({ game }) {
    const zone = game.content.zone(game.state.player.zoneId);
    const npcs = game.npcsHere();
    if (npcs.length === 0) return html`<p class="muted">Nobody lives in ${zone.name}. The village is where the quests are.</p>`;
    return html`<div class="grid grid-2">${npcs.map((npc) => npcCard(game, npc))}</div>`;
  },
};
