/**
 * Builds a content table from `{ id: definition }` literals, stamping each key
 * onto its entry as `id`. The keys become the id union used everywhere else.
 */
import type { Tier } from '@/types/content';

export function tableDefiner<TDef extends { readonly id: string }>() {
  return <K extends string>(defs: Record<K, Omit<TDef, 'id'>>): { readonly [P in K]: TDef & { readonly id: P } } => {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(defs) as K[]) out[key] = { ...defs[key], id: key };
    return out as { readonly [P in K]: TDef & { readonly id: P } };
  };
}

/**
 * Builds one entry per material in a tier list: `tieredDefiner<ItemDef>()(METALS, '', '_bar', make)`
 * yields `bronze_bar`, `iron_bar`, … with the tier taken from the material's position.
 * The ids stay literal types, so they are still checked everywhere.
 */
export function tieredDefiner<TDef extends { readonly id: string }>() {
  return <const M extends readonly string[], const P extends string, const S extends string>(
    materials: M,
    prefix: P,
    suffix: S,
    make: (material: M[number], tier: Tier) => Omit<TDef, 'id'>,
  ): { readonly [Mat in M[number] as `${P}${Mat}${S}`]: TDef & { readonly id: `${P}${Mat}${S}` } } => {
    const out: Record<string, unknown> = {};
    materials.forEach((material, index) => {
      const id = `${prefix}${material}${suffix}`;
      out[id] = { ...make(material, tierOf(index)), id };
    });
    return out as never;
  };
}

export function tierOf(index: number): Tier {
  return Math.min(6, Math.max(1, index + 1)) as Tier;
}
