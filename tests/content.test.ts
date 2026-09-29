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
        bad: { id: 'bad', station: 'furnace', skill: 'smithing', level: 1, durationMs: 1000, xp: 1, inputs: [{ itemId: 'unobtainium' as never, qty: 1 }], outputs: [{ itemId: 'bronze_bar', qty: 1 }] },
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
