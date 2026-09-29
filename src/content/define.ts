/**
 * Builds a content table from `{ id: definition }` literals, stamping each key
 * onto its entry as `id`. The keys become the id union used everywhere else.
 */
export function tableDefiner<TDef extends { readonly id: string }>() {
  return <K extends string>(defs: Record<K, Omit<TDef, 'id'>>): { readonly [P in K]: TDef & { readonly id: P } } => {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(defs) as K[]) out[key] = { ...defs[key], id: key };
    return out as { readonly [P in K]: TDef & { readonly id: P } };
  };
}
