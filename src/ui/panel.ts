import type { Game } from '@/game';
import type { LogKind } from '@/types/state';
import type { Raw } from './html';

/** Per-session UI preferences. Not part of the save. */
export interface UiState {
  panel: string;
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
  group: 'Character' | 'Work' | 'World' | 'System';
  render(view: ViewContext): Raw;
  /** Small counter shown in the nav, e.g. quests ready to turn in. */
  badge?(view: ViewContext): number;
}
