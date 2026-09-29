/**
 * The single delegated click handler. Buttons carry `data-action` and
 * `data-id`; this maps them to Game commands and shows failures as toasts.
 * Ids coming from the DOM are checked against content before use.
 */
import type { App } from './app';
import type { Result } from '@/types/result';
import type { CombatStyle, LogKind } from '@/types/state';
import { EQUIP_SLOTS, type EquipSlot } from '@/types/ids';
import { toast } from './toast';

const STYLES: readonly CombatStyle[] = ['attack', 'strength', 'defence'];
const LOG_FILTERS: readonly (LogKind | 'all')[] = ['all', 'info', 'loot', 'combat', 'quest', 'level', 'warn'];

export function handleAction(app: App, action: string, data: DOMStringMap): void {
  const game = app.game;
  const content = game.content;
  const id = data.id ?? '';
  let result: Result | null = null;

  switch (action) {
    case 'panel': app.setPanel(id); return;
    case 'log-filter': if ((LOG_FILTERS as readonly string[]).includes(id)) app.setLogFilter(id as LogKind | 'all'); return;
    case 'dismiss-offline': app.offline = null; app.markDirty(); return;
    case 'stop': result = game.stopActivity(); break;
    case 'gather': if (content.hasNode(id)) result = game.startGathering(id); break;
    case 'craft': {
      if (!content.hasRecipe(id)) break;
      const qty = data.qty === 'all' ? game.maxCraftable(id) : Number(data.qty ?? 1);
      result = game.startCrafting(id, Number.isFinite(qty) ? qty : 1);
      break;
    }
    case 'fight': if (content.hasMonster(id)) result = game.startCombat(id); break;
    case 'style': if ((STYLES as readonly string[]).includes(id)) result = game.setCombatStyle(id as CombatStyle); break;
    case 'equip': if (content.hasItem(id)) result = game.equip(id); break;
    case 'unequip': if ((EQUIP_SLOTS as readonly string[]).includes(id)) result = game.unequip(id as EquipSlot); break;
    case 'use': if (content.hasItem(id)) result = game.consume(id); break;
    case 'travel': if (content.hasZone(id)) result = game.travel(id); break;
    case 'talk': if (content.hasNpc(id)) result = game.talk(id); break;
    case 'accept-quest': if (content.hasQuest(id)) result = game.acceptQuest(id); break;
    case 'turn-in': if (content.hasQuest(id)) result = game.turnInQuest(id); break;
    case 'save': app.hooks.save(); toast('Saved.', 'good'); break;
    case 'export': app.ui.exportText = app.hooks.exportSave(); break;
    case 'import': {
      const text = (document.getElementById('import-text') as HTMLTextAreaElement | null)?.value ?? '';
      if (!text.trim()) { toast('Paste an exported save first.', 'warn'); return; }
      result = app.hooks.importSave(text);
      if (result.ok) toast('Save imported.', 'good');
      break;
    }
    case 'reset':
      if (window.confirm('Delete this character and start over? This cannot be undone.')) app.hooks.reset();
      return;
    default:
      console.warn(`Unknown action: ${action}`);
      return;
  }

  if (result && !result.ok) toast(result.reason, 'warn');
  app.markDirty();
}
