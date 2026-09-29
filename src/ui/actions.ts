/**
 * The single delegated click handler. Buttons carry `data-action` and
 * `data-id`; this maps them to Game commands and shows failures as toasts.
 * Ids coming from the DOM are checked against content before use.
 */
import type { App } from './app';
import type { Result } from '@/types/result';
import type { LogKind } from '@/types/state';
import { EQUIP_SLOTS, type EquipSlot } from '@/types/ids';
import { toast } from './toast';

const LOG_FILTERS: readonly (LogKind | 'all')[] = ['all', 'info', 'loot', 'combat', 'quest', 'level', 'warn', 'trade'];

export function handleAction(app: App, action: string, data: DOMStringMap): void {
  const game = app.game;
  const content = game.content;
  const id = data.id ?? '';
  let result: Result | null = null;

  switch (action) {
    case 'panel': app.setPanel(id); return;
    case 'tab': app.setTab(id); return;
    case 'unlock': if (content.hasProgressNode(id)) result = game.unlockNode(id); break;
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
    case 'equip': if (content.hasItem(id)) result = game.equip(id); break;
    case 'unequip': if ((EQUIP_SLOTS as readonly string[]).includes(id)) result = game.unequip(id as EquipSlot); break;
    case 'use': if (content.hasItem(id)) result = game.consume(id); break;
    case 'travel': if (content.hasZone(id)) result = game.travel(id); break;
    case 'talk': if (content.hasNpc(id)) result = game.talk(id); break;
    case 'accept-quest': if (content.hasQuest(id)) result = game.acceptQuest(id); break;
    case 'turn-in': if (content.hasQuest(id)) result = game.turnInQuest(id); break;
    case 'open-shop': if (content.hasShop(id)) app.openShop(id); return;
    case 'buy': {
      const shopId = data.shop ?? '';
      if (content.hasShop(shopId) && content.hasItem(id)) result = game.buy(shopId, id, quantity(data.qty, () => Infinity));
      break;
    }
    case 'sell': {
      const shopId = data.shop ?? '';
      if (content.hasShop(shopId) && content.hasItem(id)) result = game.sell(shopId, id, quantity(data.qty, () => game.itemCount(id)));
      break;
    }
    case 'market-buy': if (content.hasItem(id)) result = game.marketBuy(id, quantity(data.qty, () => Infinity)); break;
    case 'market-sell': if (content.hasItem(id)) result = game.marketSell(id, quantity(data.qty, () => game.itemCount(id))); break;
    case 'barter': {
      const traderId = data.trader ?? '';
      const slot = Number(id);
      if (content.hasTrader(traderId) && Number.isInteger(slot)) result = game.barter(traderId, slot);
      break;
    }
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

/** data-qty is a number or 'all'; `all` resolves the amount for 'all'. */
function quantity(raw: string | undefined, all: () => number): number {
  if (raw === 'all') return all();
  const n = Number(raw ?? 1);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
