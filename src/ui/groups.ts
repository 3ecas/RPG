/** Catalogue grouping for lists: ordered, with a label per group and finer splits for gear. */
import type { Game } from '@/game';
import type { ItemDef, ItemGroup } from '@/types/content';
import type { ItemId } from '@/types/ids';

export const GROUP_ORDER: readonly ItemGroup[] = ['weapon', 'shield', 'armor', 'trinket', 'food', 'ore', 'bar', 'log', 'fish', 'crop', 'herb', 'hide', 'misc'];

const LABELS: Record<ItemGroup, string> = {
  weapon: 'Weapons', shield: 'Shields', armor: 'Armor', trinket: 'Trinkets', food: 'Food',
  ore: 'Ore', bar: 'Bars', log: 'Logs', fish: 'Fish', crop: 'Crops', herb: 'Herbs', hide: 'Hides', misc: 'Other',
};

/** Weapons split by type and armor by piece, so a forge lists Swords, Axes, Helmets, … */
export function catalogueKey(item: ItemDef): string {
  if (item.group === 'weapon' && item.equip?.weaponType) return `weapon:${item.equip.weaponType}`;
  if (item.group === 'armor' && item.equip) return `armor:${item.equip.kind}`;
  return item.group;
}

export function catalogueLabel(key: string): string {
  const [group, sub] = key.split(':') as [ItemGroup, string | undefined];
  if (group === 'weapon' && sub) return { sword: 'Swords', axe: 'Axes', dagger: 'Daggers' }[sub] ?? 'Weapons';
  if (group === 'armor' && sub) return { head: 'Helmets', body: 'Body armor', legs: 'Leg armor', hands: 'Gloves', feet: 'Boots' }[sub] ?? 'Armor';
  return LABELS[group] ?? key;
}

export function catalogueOrder(key: string): number {
  const [group, sub] = key.split(':') as [ItemGroup, string | undefined];
  const base = GROUP_ORDER.indexOf(group) * 10;
  const subOrder = sub ? ['sword', 'axe', 'dagger', 'head', 'body', 'legs', 'hands', 'feet'].indexOf(sub) + 1 : 0;
  return base + subOrder;
}

export interface Category {
  key: string;
  label: string;
  count: number;
}

/** Distinct categories among items, ordered. */
export function categoriesOf(game: Game, itemIds: readonly ItemId[]): Category[] {
  const counts = new Map<string, number>();
  for (const id of itemIds) {
    const key = catalogueKey(game.content.item(id));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([key, count]) => ({ key, label: catalogueLabel(key), count })).sort((a, b) => catalogueOrder(a.key) - catalogueOrder(b.key));
}
