import type { RecipeDef } from '@/types/content';
import { tableDefiner } from '../define';

const defineRecipes = tableDefiner<RecipeDef>();

/** Station: anvil. Bars in, gear out. Xp scales with bars used. */
export const SMITHING = defineRecipes({
  smith_bronze_dagger: { station: 'anvil', skill: 'smithing', level: 1, durationMs: 3000, xp: 12, inputs: [{ itemId: 'bronze_bar', qty: 1 }], outputs: [{ itemId: 'bronze_dagger', qty: 1 }] },
  smith_bronze_helmet: { station: 'anvil', skill: 'smithing', level: 3, durationMs: 3000, xp: 12, inputs: [{ itemId: 'bronze_bar', qty: 1 }], outputs: [{ itemId: 'bronze_helmet', qty: 1 }] },
  smith_bronze_sword: { station: 'anvil', skill: 'smithing', level: 4, durationMs: 3000, xp: 12, inputs: [{ itemId: 'bronze_bar', qty: 1 }], outputs: [{ itemId: 'bronze_sword', qty: 1 }] },
  smith_bronze_shield: { station: 'anvil', skill: 'smithing', level: 6, durationMs: 4000, xp: 24, inputs: [{ itemId: 'bronze_bar', qty: 2 }], outputs: [{ itemId: 'bronze_shield', qty: 1 }] },
  smith_bronze_platelegs: { station: 'anvil', skill: 'smithing', level: 8, durationMs: 4000, xp: 24, inputs: [{ itemId: 'bronze_bar', qty: 2 }], outputs: [{ itemId: 'bronze_platelegs', qty: 1 }] },
  smith_bronze_platebody: { station: 'anvil', skill: 'smithing', level: 12, durationMs: 5000, xp: 36, inputs: [{ itemId: 'bronze_bar', qty: 3 }], outputs: [{ itemId: 'bronze_platebody', qty: 1 }] },
  smith_iron_dagger: { station: 'anvil', skill: 'smithing', level: 15, durationMs: 3000, xp: 25, inputs: [{ itemId: 'iron_bar', qty: 1 }], outputs: [{ itemId: 'iron_dagger', qty: 1 }] },
  smith_iron_helmet: { station: 'anvil', skill: 'smithing', level: 18, durationMs: 3000, xp: 25, inputs: [{ itemId: 'iron_bar', qty: 1 }], outputs: [{ itemId: 'iron_helmet', qty: 1 }] },
  smith_iron_sword: { station: 'anvil', skill: 'smithing', level: 19, durationMs: 3000, xp: 25, inputs: [{ itemId: 'iron_bar', qty: 1 }], outputs: [{ itemId: 'iron_sword', qty: 1 }] },
  smith_iron_shield: { station: 'anvil', skill: 'smithing', level: 22, durationMs: 4000, xp: 50, inputs: [{ itemId: 'iron_bar', qty: 2 }], outputs: [{ itemId: 'iron_shield', qty: 1 }] },
  smith_iron_platelegs: { station: 'anvil', skill: 'smithing', level: 26, durationMs: 4000, xp: 50, inputs: [{ itemId: 'iron_bar', qty: 2 }], outputs: [{ itemId: 'iron_platelegs', qty: 1 }] },
  smith_iron_platebody: { station: 'anvil', skill: 'smithing', level: 29, durationMs: 5000, xp: 75, inputs: [{ itemId: 'iron_bar', qty: 3 }], outputs: [{ itemId: 'iron_platebody', qty: 1 }] },
  smith_steel_helmet: { station: 'anvil', skill: 'smithing', level: 33, durationMs: 3000, xp: 37, inputs: [{ itemId: 'steel_bar', qty: 1 }], outputs: [{ itemId: 'steel_helmet', qty: 1 }] },
  smith_steel_sword: { station: 'anvil', skill: 'smithing', level: 34, durationMs: 3000, xp: 37, inputs: [{ itemId: 'steel_bar', qty: 1 }], outputs: [{ itemId: 'steel_sword', qty: 1 }] },
  smith_steel_platebody: { station: 'anvil', skill: 'smithing', level: 45, durationMs: 5000, xp: 111, inputs: [{ itemId: 'steel_bar', qty: 3 }], outputs: [{ itemId: 'steel_platebody', qty: 1 }] },
});
