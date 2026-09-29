import type { Game } from '@/game';
import type { LogKind } from '@/types/state';
import type { Raw } from './html';

/** An open window: which panel, with what parameters, where. */
export interface WindowState {
  id: string;
  panel: string;
  params: Record<string, string>;
  x: number;
  y: number;
}

/** Per-session UI preferences. Not part of the save. */
export interface UiState {
  /** Open windows, bottom to top. */
  windows: WindowState[];
  logFilter: LogKind | 'all';
  exportText: string;
  /** Selected shop in the Shops window. */
  shopId: string | null;
  /** Selected node in the Progression tree. */
  selectedNode: string | null;
}

export interface ViewContext {
  game: Game;
  ui: UiState;
  /** Parameters of the window being rendered (e.g. the node or npc id, a category filter). */
  params: Record<string, string>;
  /** Id of the window being rendered; '' outside windows. */
  windowId: string;
}

export interface Panel {
  id: string;
  title: string | ((view: ViewContext) => string);
  /** Preferred window width in px; clamped to the stage. */
  width?: number;
  render(view: ViewContext): Raw;
  /** Small counter shown on the menu button, e.g. quests ready to turn in. */
  badge?(view: ViewContext): number;
  /** Why this panel is locked (shown inside), or null. */
  lock?(view: ViewContext): string | null;
}
