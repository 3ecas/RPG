/**
 * The page shell: header, nav, active panel, sidebar. Re-renders only the
 * regions whose HTML actually changed, so text panels stay cheap and inputs
 * in unchanged regions keep their contents.
 */
import { BALANCE } from '@/content/balance';
import type { Game, OfflineSummary } from '@/game';
import type { Result } from '@/types/result';
import type { LogKind } from '@/types/state';
import { fmtDuration, fmtNum } from '@/util/format';
import { handleAction } from './actions';
import { progressBar } from './components/progress-bar';
import { html, type Raw } from './html';
import type { Panel, UiState, ViewContext } from './panel';
import { PANELS } from './panels';
import { toast } from './toast';

export interface AppHooks {
  save(): void;
  exportSave(): string;
  importSave(text: string): Result;
  reset(): void;
}

const GROUPS: Panel['group'][] = ['Character', 'Work', 'World', 'System'];
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
    this.ui = { panel: 'skills', logFilter: 'all', exportText: '', ...loadPrefs() };
    if (!PANELS.some((p) => p.id === this.ui.panel)) this.ui.panel = 'skills';
  }

  get game(): Game {
    return this.current;
  }

  mount(): void {
    this.root.innerHTML =
      '<header class="topbar" id="ui-header"></header><nav class="sidenav" id="ui-nav"></nav><main class="content" id="ui-main"></main><aside class="sidebar" id="ui-aside"></aside>';
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
    savePrefs(this.ui);
    this.markDirty();
  }

  setLogFilter(filter: LogKind | 'all'): void {
    this.ui.logFilter = filter;
    savePrefs(this.ui);
    this.markDirty();
  }

  /** Called every frame by the loop. Cheap when nothing changed. */
  render(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const view: ViewContext = { game: this.current, ui: this.ui };
    const panel = PANELS.find((p) => p.id === this.ui.panel) ?? PANELS[0]!;
    this.patch('ui-header', this.renderHeader(view));
    this.patch('ui-nav', this.renderNav(view));
    this.patch('ui-main', html`${this.renderOffline()}${panel.render(view)}`);
    this.patch('ui-aside', this.renderSidebar(view));
  }

  private patch(id: string, content: Raw): void {
    if (this.rendered.get(id) === content.html) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = content.html;
    this.rendered.set(id, content.html);
  }

  private attach(game: Game): void {
    const content = game.content;
    this.unsubscribe = [
      game.ctx.events.on('state:changed', () => this.markDirty()),
      game.ctx.events.on('skill:levelup', (e) => toast(`${content.skill(e.skill).name} level ${e.level}!`, 'good')),
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
    const zone = game.content.zone(game.state.player.zoneId);
    const saved = this.lastSavedAt === null ? 'not saved yet' : `saved ${fmtDuration(Math.max(0, Date.now() - this.lastSavedAt))} ago`;
    return html`
      <div class="brand">Greenhollow <span class="muted small">idle rpg</span></div>
      <div class="status">
        <span>${game.state.player.name}</span><span class="sep">·</span>
        <span>${zone.name}</span><span class="sep">·</span>
        <span>Total level ${game.totalLevel()}</span><span class="sep">·</span>
        <span class="muted">${saved}</span>
      </div>`;
  }

  private renderNav(view: ViewContext): Raw {
    return html`${GROUPS.map((group) => html`
      <div class="nav-group">
        <div class="nav-title">${group}</div>
        ${PANELS.filter((p) => p.group === group).map((p) => {
          const badge = p.badge?.(view) ?? 0;
          return html`<button class="nav-item ${p.id === this.ui.panel ? 'active' : ''}" data-action="panel" data-id="${p.id}">${p.title}${badge > 0 ? html`<span class="badge">${badge}</span>` : ''}</button>`;
        })}
      </div>`)}`;
  }

  private renderSidebar({ game }: ViewContext): Raw {
    const state = game.state;
    const stats = game.stats();
    const activity = game.activityView();
    const weapon = state.player.equipment.weapon;
    const feed = state.log.slice(-8);
    return html`
      <section class="card side-now">
        <h3>Now</h3>
        ${activity
          ? html`<div><strong>${activity.label}</strong></div><div class="muted small">${activity.detail}</div>${progressBar(activity.progress, 'activity')}<div class="top-gap"><button class="btn btn-small" data-action="stop">Stop</button></div>`
          : html`<div class="muted">Idle.</div><div class="muted small">Pick a rock, a recipe or a fight.</div>`}
      </section>
      <section class="card">
        <h3>Vitals</h3>
        ${progressBar(state.player.hp / stats.maxHp, 'hp', `${state.player.hp} / ${stats.maxHp} hp`)}
        <div class="row"><span class="muted">Gold</span><span class="gold">${fmtNum(state.player.gold)}</span></div>
        <div class="row"><span class="muted">Weapon</span><span>${weapon ? game.content.item(weapon).name : 'Fists'}</span></div>
        <div class="row"><span class="muted">Inventory</span><span>${state.inventory.length}/${BALANCE.INVENTORY_SLOTS}</span></div>
      </section>
      <section class="card side-feed">
        <h3>Recent</h3>
        <ul class="feed">${feed.map((e) => html`<li class="log-${e.kind}">${e.text}</li>`)}</ul>
      </section>`;
  }

  private renderOffline(): Raw {
    const o = this.offline;
    if (!o) return html``;
    const content = this.current.content;
    const parts: string[] = [];
    for (const i of o.items) parts.push(`+${fmtNum(i.qty)} ${content.item(i.itemId).name}`);
    for (const x of o.xp) parts.push(`+${fmtNum(x.xp)} ${x.skill} xp`);
    const lastLevel = new Map<string, number>();
    for (const l of o.levelUps) lastLevel.set(l.skill, l.level);
    for (const [skill, level] of lastLevel) parts.push(`${skill} level ${level}`);
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
