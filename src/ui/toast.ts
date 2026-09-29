/** Small transient messages (command failures, level ups). */
export type ToastKind = 'info' | 'warn' | 'good';

export function toast(text: string, kind: ToastKind = 'info', durationMs = 3200): void {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = text;
  host.appendChild(el);
  while (host.children.length > 4) host.firstElementChild?.remove();
  setTimeout(() => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 300);
  }, durationMs);
}
