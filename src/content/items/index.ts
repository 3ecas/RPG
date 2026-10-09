import { MATERIALS } from './materials';
import { WEAPONS } from './weapons';
import { ARMOR } from './armor';
import { FOOD } from './food';
import { TOOLS } from './tools';

export const ITEMS = { ...MATERIALS, ...WEAPONS, ...ARMOR, ...FOOD, ...TOOLS };
