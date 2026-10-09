/**
 * Floating windows over the world: each has a title bar to drag it by, a
 * close button, a native resize grip, and remembers where it was and
 * whether it was open, per browser. Also lends its dragging to the menu bar.
 * Layout only; what goes in a window is the shell's business.
 */

export interface WindowSpec {
  id: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  open: boolean;
  /** Fixed size windows (none today) would say false. */
  resizable?: boolean;
}

interface Saved {
  x: number;
  y: number;
  w: number;
  h: number;
  open: boolean;
}

interface Managed {
  spec: WindowSpec;
  el: HTMLElement;
  body: HTMLElement;
}

const MIN_W = 160;
const MIN_H = 90;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Drags `el` around `stage` by `handle`, keeping it inside and above the stage's bottom inset. Buttons and inputs on the handle still work. */
export function makeDraggable(handle: HTMLElement, el: HTMLElement, stage: HTMLElement, onEnd?: () => void, bottomInset = 0): void {
  handle.addEventListener('pointerdown', (event) => {
    if ((event.target as HTMLElement).closest('button, input, select, a')) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const left = el.offsetLeft;
    const top = el.offsetTop;
    handle.setPointerCapture(event.pointerId);
    const move = (ev: PointerEvent) => {
      el.style.left = `${clamp(left + ev.clientX - startX, 0, Math.max(0, stage.clientWidth - el.offsetWidth))}px`;
      el.style.top = `${clamp(top + ev.clientY - startY, 0, Math.max(0, stage.clientHeight - bottomInset - el.offsetHeight))}px`;
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      onEnd?.();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
}

export class Windows {
  /** Called when a window opens or closes, by the user or by code. */
  onToggle: ((id: string, open: boolean) => void) | null = null;
  private readonly wins = new Map<string, Managed>();
  private readonly bars = new Map<string, HTMLElement>();
  private saved: Record<string, Partial<Saved>> = {};
  private z = 20;
  private saveQueued = false;

  /** `bottom` is the height of what sits along the stage's bottom edge (the menu bar), which windows stay above. */
  constructor(private readonly stage: HTMLElement, private readonly storageKey: string, private readonly inset: { bottom: number } = { bottom: 0 }) {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) this.saved = parsed as Record<string, Partial<Saved>>;
    } catch {
      this.saved = {};
    }
    new ResizeObserver(() => this.keepInside()).observe(stage);
  }

  /** Adds a window and returns its body. It is placed where it was last left, else at the spec's default. */
  add(spec: WindowSpec): HTMLElement {
    const el = document.createElement('div');
    el.className = 'win';
    el.dataset.win = spec.id;
    el.innerHTML = '<div class="win-head"><span class="win-title"></span><button class="win-x" type="button" title="Close">&times;</button></div><div class="win-body"></div>';
    const head = el.querySelector<HTMLElement>('.win-head')!;
    head.querySelector('.win-title')!.textContent = spec.title;
    const body = el.querySelector<HTMLElement>('.win-body')!;
    if (spec.resizable === false) el.classList.add('win-fixed');
    this.stage.appendChild(el);
    const managed: Managed = { spec, el, body };
    this.wins.set(spec.id, managed);
    this.place(managed, this.saved[spec.id]);
    makeDraggable(head, el, this.stage, () => this.remember(spec.id), this.inset.bottom);
    head.querySelector('.win-x')!.addEventListener('click', () => this.close(spec.id));
    el.addEventListener('pointerdown', () => this.front(el));
    new ResizeObserver(() => this.remember(spec.id)).observe(el);
    return body;
  }

  /** A bar (the menu bar) that is dragged whole and remembered like a window, without a frame. */
  addBar(id: string, el: HTMLElement, handle: HTMLElement, x: number, y: number): void {
    this.bars.set(id, el);
    const saved = this.saved[id];
    el.style.left = `${typeof saved?.x === 'number' ? saved.x : x}px`;
    el.style.top = `${typeof saved?.y === 'number' ? saved.y : y}px`;
    makeDraggable(handle, el, this.stage, () => this.remember(id));
    this.keepInside();
  }

  body(id: string): HTMLElement | null {
    return this.wins.get(id)?.body ?? null;
  }

  isOpen(id: string): boolean {
    const w = this.wins.get(id);
    return !!w && !w.el.hidden;
  }

  open(id: string): void {
    const w = this.wins.get(id);
    if (!w) return;
    const was = !w.el.hidden;
    w.el.hidden = false;
    this.front(w.el);
    this.keepInside();
    this.remember(id);
    if (!was) this.onToggle?.(id, true);
  }

  close(id: string): void {
    const w = this.wins.get(id);
    if (!w || w.el.hidden) return;
    w.el.hidden = true;
    this.remember(id);
    this.onToggle?.(id, false);
  }

  toggle(id: string): void {
    if (this.isOpen(id)) this.close(id);
    else this.open(id);
  }

  /** Every window back to its default place, size and state. */
  reset(): void {
    this.saved = {};
    for (const w of this.wins.values()) {
      this.place(w, undefined);
      this.onToggle?.(w.spec.id, w.spec.open);
    }
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      /* fine */
    }
  }

  private place(w: Managed, saved: Partial<Saved> | undefined): void {
    const { spec, el } = w;
    const width = typeof saved?.w === 'number' ? saved.w : spec.w;
    const height = typeof saved?.h === 'number' ? saved.h : spec.h;
    el.style.width = `${Math.max(MIN_W, width)}px`;
    el.style.height = `${Math.max(MIN_H, height)}px`;
    el.style.left = `${typeof saved?.x === 'number' ? saved.x : spec.x}px`;
    el.style.top = `${typeof saved?.y === 'number' ? saved.y : spec.y}px`;
    el.hidden = !(typeof saved?.open === 'boolean' ? saved.open : spec.open);
    this.front(el);
    this.keepInside();
  }

  private front(el: HTMLElement): void {
    this.raise(el);
  }

  /** Nothing is left off the stage when it shrinks or when the stage first shows. */
  layout(): void {
    this.keepInside();
  }

  setTitle(id: string, title: string): void {
    const win = this.wins.get(id);
    if (win) win.el.querySelector('.win-title')!.textContent = title;
  }

  /** To the front. Windows stay below the menus, the balloon and the dialogs (z 900 and up): when the counter nears them, every window is renumbered in its present order. */
  private raise(el: HTMLElement): void {
    if (this.z >= 800) {
      const inOrder = [...this.wins.values()].map((w) => w.el).sort((a, b) => Number(a.style.zIndex || 0) - Number(b.style.zIndex || 0));
      this.z = 20;
      for (const w of inOrder) w.style.zIndex = String(++this.z);
    }
    el.style.zIndex = String(++this.z);
  }

  private keepInside(): void {
    const sw = this.stage.clientWidth;
    const sh = this.stage.clientHeight - this.inset.bottom;
    if (sw === 0 || sh <= 0) return;
    const all = [...[...this.wins.values()].map((w) => w.el), ...this.bars.values()];
    for (const el of all) {
      // Not rendered (closed, or the stage is shut): its offsets read as zero and mean nothing.
      if (el.offsetParent === null) continue;
      if (el.offsetWidth > sw) el.style.width = `${Math.max(MIN_W, sw - 8)}px`;
      if (el.offsetHeight > sh && el.classList.contains('win')) el.style.height = `${Math.max(MIN_H, sh - 8)}px`;
      el.style.left = `${clamp(el.offsetLeft, 0, Math.max(0, sw - el.offsetWidth))}px`;
      el.style.top = `${clamp(el.offsetTop, 0, Math.max(0, sh - el.offsetHeight))}px`;
    }
  }

  private remember(id: string): void {
    const w = this.wins.get(id);
    const bar = this.bars.get(id);
    const previous = this.saved[id] ?? {};
    // Geometry is read only while rendered; a closed window keeps the place it last had.
    if (w) this.saved[id] = { ...previous, open: !w.el.hidden, ...(w.el.offsetParent !== null ? { x: w.el.offsetLeft, y: w.el.offsetTop, w: w.el.offsetWidth, h: w.el.offsetHeight } : {}) };
    else if (bar && bar.offsetParent !== null) this.saved[id] = { ...previous, x: bar.offsetLeft, y: bar.offsetTop };
    else return;
    if (this.saveQueued) return;
    this.saveQueued = true;
    requestAnimationFrame(() => {
      this.saveQueued = false;
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.saved));
      } catch {
        /* storage may be unavailable; the layout just does not persist */
      }
    });
  }
}
