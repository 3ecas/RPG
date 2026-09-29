import type { Game } from '@/game';
import type { LogKind } from '@/types/state';
import type { Raw } from './html';

/** Per-session UI preferences. Not part of the save. */
export interface UiState {
  /** Active panel id. Its tab is derived. */
  panel: string;
  /** Last panel opened in each tab, so switching tabs returns where you were. */
  lastPanelByTab: Record<string, string>;
  logFilter: LogKind | 'all';
  exportText: string;
  /** Selected shop in the Shops panel. */
  shopId: string | null;
}

export interface ViewContext {
  game: Game;
  ui: UiState;
}

export interface Panel {
  id: string;
  title: string;
  render(view: ViewContext): Raw;
  /** Small counter shown on the tab, e.g. quests ready to turn in. */
  badge?(view: ViewContext): number;
  /** Why this panel is locked (shown on its sub-tab and inside), or null. */
  lock?(view: ViewContext): string | null;
}
