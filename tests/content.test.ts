import { describe, expect, it } from 'vitest';
import { CONTENT } from '@/content';
import { Registry } from '@/core/registry';
import type { ContentTables } from '@/types/content';

describe('content', () => {
  it('has no dangling references, orphans or cycles', () => {
    expect(new Registry(CONTENT).validate()).toEqual([]);
  });

  it('validation catches a recipe that references a missing item', () => {
    const broken: ContentTables = {
      ...CONTENT,
      recipes: {
        ...CONTENT.recipes,
        bad: { id: 'bad', station: 'furnace', skill: 'blacksmithing', tier: 1, durationMs: 1000, xp: 1, inputs: [{ itemId: 'unobtainium' as never, qty: 1 }], outputs: [{ itemId: 'bronze_bar', qty: 1 }] },
      },
    };
    const errors = new Registry(broken).validate();
    expect(errors).toContain("recipe bad: unknown item 'unobtainium'");
  });

  it('validation catches a quest prerequisite cycle', () => {
    const broken: ContentTables = {
      ...CONTENT,
      quests: {
        ...CONTENT.quests,
        rat_problem: { ...CONTENT.quests.rat_problem, prerequisites: [{ type: 'quest', questId: 'goblin_menace' }] },
      },
    };
    const errors = new Registry(broken).validate();
    expect(errors.some((e) => e.startsWith('quest prerequisite cycle'))).toBe(true);
  });

  it('every tier of every material family is reachable through nodes, recipes and gear', () => {
    const registry = new Registry(CONTENT);
    const nodes = Object.values(CONTENT.nodes);
    const recipes = Object.values(CONTENT.recipes);
    for (const tier of [1, 2, 3, 4, 5, 6] as const) {
      for (const skill of ['mining', 'woodcutting', 'fishing', 'farming', 'harvesting'] as const) {
        expect(nodes.some((n) => n.skill === skill && n.tier === tier), `${skill} has a tier ${tier} node`).toBe(true);
      }
      for (const skill of ['blacksmithing', 'woodworking', 'leatherworking', 'cooking'] as const) {
        expect(recipes.some((r) => r.skill === skill && r.tier === tier), `${skill} has a tier ${tier} recipe`).toBe(true);
      }
      for (const skill of ['swords', 'axes', 'daggers', 'shields', 'armor'] as const) {
        const gear = registry.itemIds.map((id) => registry.item(id)).filter((i) => i.equip?.requirements?.some((r) => r.skill === skill && r.tier === tier));
        expect(gear.length, `${skill} has tier ${tier} gear`).toBeGreaterThan(0);
      }
      expect(Object.values(CONTENT.monsters).some((m) => m.tier === tier), `a tier ${tier} monster exists`).toBe(true);
    }
  });

  it('every recipe output is either equipment, food, or a material used somewhere', () => {
    const registry = new Registry(CONTENT);
    const usedAsInput = new Set(Object.values(CONTENT.recipes).flatMap((r) => r.inputs.map((i) => i.itemId)));
    for (const recipe of Object.values(CONTENT.recipes)) {
      for (const out of recipe.outputs) {
        const item = registry.item(out.itemId);
        const useful = !!item.equip || !!item.consume || usedAsInput.has(out.itemId);
        expect(useful, `${out.itemId} is crafted but has no use`).toBe(true);
      }
    }
  });
});
