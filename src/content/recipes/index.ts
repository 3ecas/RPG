import { SMELTING } from './smelting';
import { FORGING } from './forging';
import { WOODWORKING } from './woodworking';
import { LEATHERWORKING } from './leatherworking';
import { COOKING } from './cooking';

export const RECIPES = { ...SMELTING, ...FORGING, ...WOODWORKING, ...LEATHERWORKING, ...COOKING };
