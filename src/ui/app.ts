/**
 * The page shell: a status bar, tabs, sub-tabs, a two-line event ticker and
 * the active panel. Each region is re-rendered only when its HTML changed.
 */
import type { Game, OfflineSummary } from '@/game';
import type { Result } from '@/types/result';
import type { LogKind } from '@/types/state';
import { fmtDuration, fmtNum } from '@/util/format';
import { handleAction } from './actions';
import { progressBar } from './components/progress-bar';
import { html, type Raw } from './html';
import type { Panel, UiState, ViewContext } from './panel';
import { PANELS } from './panels';
import { TABS, tabOf } from './tabs';
import { toast } from './toast';

export interface AppHooks {
  save(): void;
  exportSave(): string;
  importSave(text: string): Result;
  reset(): void;
}

const UI_PREFS_KEY = 'rpg.ui';

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
    this.ui = { panel: 'skills', lastPanelByTab: {}, logFilter: 'all', exportText: '', shopId: null, ...loadPrefs() };
    if (!PANELS.some((p) => p.id === this.ui.panel)) this.ui.panel = 'skills';
  }

  get game(): Game {
    return this.current;
  }

  mount(): void {
    this.root.innerHTML =
      '<header class="topbar" id="ui-header"></header><nav class="tabs" id="ui-tabs"></nav><nav class="subtabs" id="ui-subtabs"></nav><div class="ticker" id="ui-ticker"></div><main class="content" id="ui-main"></main>';
    this.root.addEventListener('click', (event) => {
      const el = (event.target as Element | null)?.closest<HTMLElement>('[data-action]');
      if (!el || el.hasAttribute('disabled')) return;
      event.preventDefault();
      handleAction(this, el.dataset.action ?? '', el.dataset);
    });
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

  setPanel(id: string): void {
    if (!PANELS.some((p) => p.id === id)) return;
    this.ui.panel = id;
    this.ui.lastPanelByTab[tabOf(id).id] = id;
    savePrefs(this.ui);
    this.markDirty();
  }

  setTab(id: string): void {
    const tab = TABS.find((t) => t.id === id);
    if (!tab) return;
    const remembered = this.ui.lastPanelByTab[id];
    this.setPanel(remembered && tab.panels.includes(remembered) ? remembered : tab.panels[0]!);
  }

  setLogFilter(filter: LogKind | 'all'): void {
    this.ui.logFilter = filter;
    savePrefs(this.ui);
    this.markDirty();
  }

  openShop(shopId: string): void {
    this.ui.shopId = shopId;
    this.setPanel('shops');
  }

  /** Called every frame by the loop. Cheap when nothing changed. */
  render(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const view: ViewContext = { game: this.current, ui: this.ui };
    const panel = PANELS.find((p) => p.id === this.ui.panel) ?? PANELS[0]!;
    this.patch('ui-header', this.renderHeader(view));
    this.patch('ui-tabs', this.renderTabs(view));
    this.patch('ui-subtabs', this.renderSubtabs(view));
    this.patch('ui-ticker', this.renderTicker(view));
    this.patch('ui-main', html`${this.renderOffline()}${panel.render(view)}`);
  }

  private patch(id: string, content: Raw): void {
    if (this.rendered.get(id) === content.html) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = content.html;
    el.classList.toggle('empty', content.html.trim() === '');
    this.rendered.set(id, content.html);
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

  private renderTabs(view: ViewContext): Raw {
    const active = tabOf(this.ui.panel).id;
    return html`${TABS.map((tab) => {
      const badge = tab.panels.reduce((sum, id) => sum + (PANELS.find((p) => p.id === id)?.badge?.(view) ?? 0), 0);
      return html`<button class="tab ${tab.id === active ? 'active' : ''}" data-action="tab" data-id="${tab.id}">${tab.title}${badge > 0 ? html`<span class="badge">${badge}</span>` : ''}</button>`;
    })}`;
  }

  private renderSubtabs(view: ViewContext): Raw {
    const tab = tabOf(this.ui.panel);
    if (tab.panels.length < 2) return html``;
    return html`${tab.panels.map((id) => {
      const panel = PANELS.find((p) => p.id === id) as Panel;
      const locked = panel.lock?.(view) ?? null;
      const badge = panel.badge?.(view) ?? 0;
      return html`<button class="subtab ${id === this.ui.panel ? 'active' : ''} ${locked ? 'locked' : ''}" data-action="panel" data-id="${id}" title="${locked ?? ''}">${locked ? '🔒 ' : ''}${panel.title}${badge > 0 ? html`<span class="badge">${badge}</span>` : ''}</button>`;
    })}`;
  }

  private renderTicker({ game }: ViewContext): Raw {
    const recent = game.state.log.slice(-2);
    return html`${recent.map((e) => html`<span class="tick log-${e.kind}" data-action="panel" data-id="log">${e.text}</span>`)}`;
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
    if (typeof prefs.panel === 'string') out.panel = prefs.panel;
    if (typeof prefs.logFilter === 'string') out.logFilter = prefs.logFilter as LogKind | 'all';
    return out;
  } catch {
    return {};
  }
}

function savePrefs(ui: UiState): void {
  try {
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify({ panel: ui.panel, logFilter: ui.logFilter }));
  } catch {
    /* preferences are a convenience */
  }
}
