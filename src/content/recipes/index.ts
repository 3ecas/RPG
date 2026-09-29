import { SMELTING } from './smelting';
import { SMITHING } from './smithing';
import { COOKING } from './cooking';
import { CRAFTING } from './crafting';

export const RECIPES = { ...SMELTING, ...SMITHING, ...COOKING, ...CRAFTING };
