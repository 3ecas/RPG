/**
 * Tagged template for building HTML strings. Interpolated values are escaped
 * unless they are the result of another `html` call (or `raw`). Arrays are
 * joined, null/false/undefined render as nothing.
 */
export class Raw {
  constructor(readonly html: string) {}
  toString(): string {
    return this.html;
  }
}

export function raw(markup: string): Raw {
  return new Raw(markup);
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

function render(value: unknown): string {
  if (value === null || value === undefined || value === false) return '';
  if (value instanceof Raw) return value.html;
  if (Array.isArray(value)) return value.map(render).join('');
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Raw {
  let out = '';
  strings.forEach((chunk, i) => {
    out += chunk;
    if (i < values.length) out += render(values[i]);
  });
  return new Raw(out);
}

/** `attr(cond, 'disabled')` renders the attribute only when cond is true. */
export function attr(condition: boolean, name: string, value?: string): Raw {
  if (!condition) return new Raw('');
  return new Raw(value === undefined ? name : `${name}="${escapeHtml(value)}"`);
}
