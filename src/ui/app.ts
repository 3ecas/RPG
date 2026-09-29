/**
 * The page shell: a status bar, a menu bar of icons, an event ticker, and the
 * stage: the zone map with windows floating over it. Windows are the panels;
 * each is re-rendered only when its HTML changed, and can be dragged by its
 * title bar.
 */
import type { Game, OfflineSummary } from '@/game';
import type { Result } from '@/types/result';
import type { LogKind } from '@/types/state';
import { fmtDuration, fmtNum } from '@/util/format';
import { handleAction } from './actions';
import { progressBar } from './components/progress-bar';
import { html, type Raw } from './html';
import { mapProgress, renderMap } from './map';
import { MENUS } from './menubar';
import type { Panel, UiState, ViewContext, WindowState } from './panel';
import { PANELS } from './panels';
import { toast } from './toast';

export interface AppHooks {
  save(): void;
  exportSave(): string;
  importSave(text: string): Result;
  reset(): void;
}

const UI_PREFS_KEY = 'rpg.ui';
const MAX_WINDOWS = 4;
const DEFAULT_WIDTH = 640;

export class App {
  ui: UiState;
  offline: OfflineSummary | null = null;
  lastSavedAt: number | null = null;
  private current: Game;
  private dirty = true;
  private readonly rendered = new Map<string, string>();
  private unsubscribe: (() => void)[] = [];

  constructor(private readonly root: HTMLElement, game: Game, readonly hooks: AppHooks) {
    this.current = game;
    this.ui = { windows: [], logFilter: 'all', exportText: '', shopId: null, selectedNode: null, ...loadPrefs() };
    this.ui.windows = this.ui.windows.filter((w) => PANELS.some((p) => p.id === w.panel));
  }

  get game(): Game {
    return this.current;
  }

  mount(): void {
    this.root.innerHTML =
      '<header class="topbar" id="ui-header"></header><div class="ticker" id="ui-ticker"></div>' +
      '<main class="stage" id="ui-stage"><div class="map" id="ui-map"></div><div class="banner-slot" id="ui-banner"></div><div class="windows" id="ui-windows"></div></main>' +
      '<nav class="hotbar" id="ui-hotbar"></nav>';
    this.root.addEventListener('click', (event) => {
      const el = (event.target as Element | null)?.closest<HTMLElement>('[data-action]');
      if (!el || el.hasAttribute('disabled')) return;
      event.preventDefault();
      handleAction(this, el.dataset.action ?? '', el.dataset);
    });
    this.root.addEventListener('keydown', (event) => {
      const el = event.target as HTMLElement | null;
      if ((event.key === 'Enter' || event.key === ' ') && el?.matches('.poi')) {
        event.preventDefault();
        handleAction(this, 'poi', el.dataset);
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.ui.windows.length > 0 && !(event.target instanceof HTMLTextAreaElement)) this.closeTop();
    });
    this.installDragging();
    this.attach(this.current);
  }

  /** Swap in a new game (import, reset). */
  setGame(game: Game): void {
    this.detach();
    this.current = game;
    this.attach(game);
    this.rendered.clear();
    this.offline = null;
    this.markDirty();
  }

  markDirty(): void {
    this.dirty = true;
  }

  // ---- windows ---------------------------------------------------------------

  openWindow(panelId: string, params: Record<string, string> = {}): void {
    const panel = PANELS.find((p) => p.id === panelId);
    if (!panel) return;
    const id = params.id ? `${panelId}:${params.id}` : panelId;
    const existing = this.ui.windows.find((w) => w.id === id);
    if (existing) {
      existing.params = params;
      this.bringToFront(id);
    } else {
      const n = this.ui.windows.length;
      this.ui.windows.push({ id, panel: panelId, params, x: 60 + n * 32, y: 28 + n * 32 });
      while (this.ui.windows.length > MAX_WINDOWS) this.ui.windows.shift();
    }
    savePrefs(this.ui);
    this.markDirty();
  }

  closeWindow(id: string): void {
    this.ui.windows = this.ui.windows.filter((w) => w.id !== id);
    savePrefs(this.ui);
    this.markDirty();
  }

  closeTop(): void {
    const top = this.ui.windows.at(-1);
    if (top) this.closeWindow(top.id);
  }

  bringToFront(id: string): void {
    const index = this.ui.windows.findIndex((w) => w.id === id);
    if (index < 0 || index === this.ui.windows.length - 1) return;
    const [win] = this.ui.windows.splice(index, 1);
    this.ui.windows.push(win!);
    this.markDirty();
  }

  /** Updates a parameter of an open window (category filters). */
  setWindowParam(windowId: string, key: string, value: string): void {
    const win = this.ui.windows.find((w) => w.id === windowId);
    if (!win) return;
    win.params = { ...win.params, [key]: value };
    savePrefs(this.ui);
    this.markDirty();
  }

  /** Same panel with a different `id` param replaces the old window (one shop window, one node window, …). */
  openExclusive(panelId: string, params: Record<string, string>): void {
    this.ui.windows = this.ui.windows.filter((w) => w.panel !== panelId);
    this.openWindow(panelId, params);
  }

  setLogFilter(filter: LogKind | 'all'): void {
    this.ui.logFilter = filter;
    savePrefs(this.ui);
    this.markDirty();
  }

  openShop(shopId: string): void {
    this.ui.shopId = shopId;
    this.openWindow('shops', { shop: shopId });
  }

  // ---- rendering --------------------------------------------------------------

  /** Called every frame by the loop. Cheap when nothing changed. */
  render(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const view: ViewContext = { game: this.current, ui: this.ui, params: {}, windowId: '' };
    this.patch('ui-header', this.renderHeader(view));
    this.patch('ui-hotbar', this.renderHotbar(view));
    this.patch('ui-ticker', this.renderTicker(view));
    this.patch('ui-map', renderMap(view));
    this.fillMapProgress(view);
    this.patch('ui-banner', this.renderOffline());
    this.renderWindows();
  }

  /** Progress bars on the map are updated in place so the SVG is not rebuilt ten times a second. */
  private fillMapProgress(view: ViewContext): void {
    const fractions = mapProgress(view);
    for (const el of document.querySelectorAll<SVGRectElement>('#ui-map .poi-fill')) {
      const fraction = fractions[el.dataset.poi ?? ''] ?? 0;
      el.setAttribute('width', (52 * Math.min(1, Math.max(0, fraction))).toFixed(1));
    }
  }

  private patch(id: string, content: Raw): void {
    if (this.rendered.get(id) === content.html) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = content.html;
    el.classList.toggle('empty', content.html.trim() === '');
    this.rendered.set(id, content.html);
  }

  private renderWindows(): void {
    const host = document.getElementById('ui-windows');
    const stage = document.getElementById('ui-stage');
    if (!host || !stage) return;
    const open = new Set(this.ui.windows.map((w) => w.id));
    for (const el of [...host.children] as HTMLElement[]) {
      if (!open.has(el.dataset.window ?? '')) {
        el.remove();
        this.rendered.delete(`win:${el.dataset.window}`);
      }
    }
    const bounds = stage.getBoundingClientRect();
    this.ui.windows.forEach((win, index) => {
      const panel = PANELS.find((p) => p.id === win.panel) as Panel;
      const view: ViewContext = { game: this.current, ui: this.ui, params: win.params, windowId: win.id };
      let el = host.querySelector<HTMLElement>(`[data-window="${CSS.escape(win.id)}"]`);
      if (!el) {
        el = document.createElement('section');
        el.className = `window window-${win.panel}`;
        el.dataset.window = win.id;
        el.innerHTML = '<header class="window-head"><span class="window-title"></span><button class="window-close" data-action="close-window" title="Close (Esc)">×</button></header><div class="window-body"></div>';
        host.appendChild(el);
      }
      const width = Math.min(panel.width ?? DEFAULT_WIDTH, Math.max(280, bounds.width - 16));
      win.x = Math.max(0, Math.min(win.x, bounds.width - Math.min(width, 200)));
      win.y = Math.max(0, Math.min(win.y, Math.max(0, bounds.height - 60)));
      el.style.left = `${win.x}px`;
      el.style.top = `${win.y}px`;
      el.style.width = `${width}px`;
      el.style.zIndex = String(10 + index);
      el.classList.toggle('window-top', index === this.ui.windows.length - 1);
      el.querySelector<HTMLElement>('.window-close')!.dataset.id = win.id;
      const title = typeof panel.title === 'function' ? panel.title(view) : panel.title;
      const titleEl = el.querySelector<HTMLElement>('.window-title')!;
      if (titleEl.textContent !== title) titleEl.textContent = title;
      const body = panel.render(view).html;
      const key = `win:${win.id}`;
      if (this.rendered.get(key) !== body) {
        el.querySelector<HTMLElement>('.window-body')!.innerHTML = body;
        this.rendered.set(key, body);
      }
      if (host.lastElementChild !== el && index === this.ui.windows.length - 1) host.appendChild(el);
    });
  }

  private installDragging(): void {
    let drag: { id: string; el: HTMLElement; dx: number; dy: number } | null = null;
    this.root.addEventListener('pointerdown', (event) => {
      const target = event.target as HTMLElement | null;
      const win = target?.closest<HTMLElement>('.window');
      if (!win) return;
      const id = win.dataset.window ?? '';
      this.bringToFront(id);
      this.renderWindows();
      const head = target?.closest<HTMLElement>('.window-head');
      if (!head || target?.closest('button')) return;
      const state = this.ui.windows.find((w) => w.id === id);
      if (!state) return;
      drag = { id, el: win, dx: event.clientX - state.x, dy: event.clientY - state.y };
      head.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    this.root.addEventListener('pointermove', (event) => {
      if (!drag) return;
      const state = this.ui.windows.find((w) => w.id === drag!.id);
      if (!state) return;
      state.x = Math.max(0, event.clientX - drag.dx);
      state.y = Math.max(0, event.clientY - drag.dy);
      drag.el.style.left = `${state.x}px`;
      drag.el.style.top = `${state.y}px`;
    });
    const end = () => {
      if (!drag) return;
      drag = null;
      savePrefs(this.ui);
    };
    this.root.addEventListener('pointerup', end);
    this.root.addEventListener('pointercancel', end);
  }

  private attach(game: Game): void {
    const content = game.content;
    this.unsubscribe = [
      game.ctx.events.on('state:changed', () => this.markDirty()),
      game.ctx.events.on('skill:tierup', (e) => toast(`${content.skill(e.skill).name} reached tier ${e.tier}!`, 'good')),
      game.ctx.events.on('progress:points', () => toast('Progression point earned.', 'good')),
      game.ctx.events.on('zone:unlocked', (e) => {
        if (content.zone(e.zoneId).unlock.length > 0) toast(`New area reachable: ${content.zone(e.zoneId).name}`, 'good');
      }),
      game.ctx.events.on('quest:completed', (e) => toast(`Quest complete: ${content.quest(e.questId).name}`, 'good')),
      game.ctx.events.on('mission:claimed', (e) => toast(`Mission complete: ${content.mission(e.missionId).name}`, 'good')),
      game.ctx.events.on('chapter:opened', (e) => { const c = content.chapters[e.chapter - 1]; if (c) toast(`Chapter ${c.number} opened: ${c.name}`, 'good', 5000); }),
      game.ctx.events.on('player:died', () => toast('You died. Back to the village.', 'warn')),
    ];
  }

  private detach(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
  }

  private renderHeader({ game }: ViewContext): Raw {
    const state = game.state;
    const stats = game.stats();
    const activity = game.activityView();
    const zone = game.content.zone(state.player.zoneId);
    const saved = this.lastSavedAt === null ? 'not saved' : `saved ${fmtDuration(Math.max(0, Date.now() - this.lastSavedAt))} ago`;
    return html`
      <div class="brand">Greenhollow</div>
      <div class="chips">
        <span class="chip" title="Current zone">${zone.name}</span>
        <span class="chip" title="Skill tiers reached">T ${game.totalTier()}/${game.content.skillIds.length * 6}</span>
        <span class="chip gold" title="Gold">${fmtNum(state.player.gold)} g</span>
        <span class="chip" title="Inventory slots">Bag ${state.inventory.length}/${game.inventoryCapacity()}</span>
        <span class="chip hp-chip" title="Hit points">${progressBar(state.player.hp / stats.maxHp, 'hp', `${state.player.hp}/${stats.maxHp}`)}</span>
      </div>
      <div class="now ${activity ? '' : 'idle'}">
        ${activity
          ? html`<span class="now-label" title="${activity.detail}">${activity.label}</span>${progressBar(activity.progress, 'activity')}<button class="btn btn-small" data-action="stop">Stop</button>`
          : html`<span class="muted">Idle</span>`}
      </div>
      <div class="saved muted small">${saved}</div>`;
  }

  private renderHotbar(view: ViewContext): Raw {
    const open = new Set(this.ui.windows.map((w) => w.panel));
    const button = (menu: (typeof MENUS)[number]) => {
      const panel = PANELS.find((p) => p.id === menu.panel);
      const badge = panel?.badge?.(view) ?? 0;
      return html`<button class="menu-btn ${open.has(menu.panel) ? 'active' : ''}" data-action="toggle-window" data-id="${menu.panel}" title="${menu.title}"><span class="menu-icon">${menu.icon}</span><span class="menu-title">${menu.title}</span>${badge > 0 ? html`<span class="badge">${badge}</span>` : ''}</button>`;
    };
    return html`
      <div class="hotbar-group">${MENUS.filter((m) => m.side === 'left').map(button)}</div>
      <div class="hotbar-group hotbar-right">
        ${this.ui.windows.length ? html`<button class="menu-btn menu-close" data-action="close-all" title="Close all windows (Esc closes one)">✕ Close all</button>` : ''}
        ${MENUS.filter((m) => m.side === 'right').map(button)}
      </div>`;
  }

  /** Hotbar buttons toggle: open if closed, close if it is the top window, else bring to front. */
  toggleWindow(panelId: string): void {
    const win = this.ui.windows.find((w) => w.panel === panelId);
    if (!win) { this.openWindow(panelId); return; }
    if (this.ui.windows.at(-1)?.id === win.id) this.closeWindow(win.id);
    else this.bringToFront(win.id);
  }

  private renderTicker({ game }: ViewContext): Raw {
    const recent = game.state.log.slice(-2);
    return html`${recent.map((e) => html`<span class="tick log-${e.kind}" data-action="window" data-id="log">${e.text}</span>`)}`;
  }

  private renderOffline(): Raw {
    const o = this.offline;
    if (!o) return html``;
    const content = this.current.content;
    const parts: string[] = [];
    for (const i of o.items) parts.push(`+${fmtNum(i.qty)} ${content.item(i.itemId).name}`);
    for (const x of o.xp) parts.push(`+${fmtNum(x.xp)} ${x.skill} xp`);
    const lastTier = new Map<string, number>();
    for (const t of o.tierUps) lastTier.set(t.skill, t.tier);
    for (const [skill, tier] of lastTier) parts.push(`${skill} tier ${tier}`);
    if (o.kills) parts.push(`${o.kills} kills`);
    if (o.deaths) parts.push(`${o.deaths} deaths`);
    if (o.stoppedReason) parts.push(`stopped: ${o.stoppedReason}`);
    return html`
      <div class="banner">
        <div><strong>While you were away (${fmtDuration(o.elapsedMs)})</strong><div class="small">${parts.length ? parts.join(' · ') : 'Nothing happened. You were idle.'}</div></div>
        <button class="btn btn-small" data-action="dismiss-offline">Dismiss</button>
      </div>`;
  }
}

function loadPrefs(): Partial<UiState> {
  try {
    const raw = localStorage.getItem(UI_PREFS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    const prefs = parsed as Record<string, unknown>;
    const out: Partial<UiState> = {};
    if (typeof prefs.logFilter === 'string') out.logFilter = prefs.logFilter as LogKind | 'all';
    if (Array.isArray(prefs.windows)) {
      out.windows = prefs.windows.flatMap((w: unknown): WindowState[] => {
        if (typeof w !== 'object' || w === null) return [];
        const r = w as Record<string, unknown>;
        if (typeof r.id !== 'string' || typeof r.panel !== 'string') return [];
        const params = typeof r.params === 'object' && r.params !== null ? Object.fromEntries(Object.entries(r.params as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string> : {};
        return [{ id: r.id, panel: r.panel, params, x: typeof r.x === 'number' ? r.x : 40, y: typeof r.y === 'number' ? r.y : 40 }];
      });
    }
    return out;
  } catch {
    return {};
  }
}

function savePrefs(ui: UiState): void {
  try {
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify({ logFilter: ui.logFilter, windows: ui.windows }));
  } catch {
    /* preferences are a convenience */
  }
}
