/**
 * Pixel art as text: one character per pixel, '.' transparent, everything
 * else looked up in the palette. Pure data so it can be validated in tests;
 * sprites.ts turns it into canvases.
 */
export interface PixelArt {
  readonly rows: readonly string[];
  readonly palette: Readonly<Record<string, string>>;
}

export const OUTLINE = '#1b1520';

/** Rows must be equal in length and use only palette characters (or '.'). */
export function validateArt(name: string, art: PixelArt): string[] {
  const errors: string[] = [];
  const width = art.rows[0]?.length ?? 0;
  if (width === 0) errors.push(`${name}: empty`);
  art.rows.forEach((row, y) => {
    if (row.length !== width) errors.push(`${name}: row ${y} has ${row.length} pixels, expected ${width}`);
    for (const ch of row) if (ch !== '.' && !(ch in art.palette)) errors.push(`${name}: no colour for '${ch}' in row ${y}`);
  });
  return errors;
}

export function recolor(art: PixelArt, overrides: Readonly<Record<string, string>>): PixelArt {
  return { rows: art.rows, palette: { ...art.palette, ...overrides } };
}

// ---- people ------------------------------------------------------------------

export interface HumanColors {
  hair: string;
  skin: string;
  tunic: string;
  pants: string;
  boots: string;
  belt: string;
}

export const PLAYER_COLORS: HumanColors = { hair: '#5a3a1e', skin: '#f0c8a0', tunic: '#3f7fbf', pants: '#4a3b2a', boots: '#3a2a1a', belt: '#8a6a2a' };

const HUMAN_LEGS = {
  apart: ['...kpppkkpppk...', '...kbbbkkbbbk...'],
  together: ['...kppppppppk...', '....kbbbbbbk....'],
  sideApart: ['....kpppkppk....', '....kbbbkbbk....'],
  sideTogether: ['....kppppppk....', '....kbbbbbbk....'],
} as const;

const HUMAN_DOWN = [
  '................',
  '....kkkkkkkk....',
  '...khhhhhhhhk...',
  '...khhhhhhhhk...',
  '...khffffffhk...',
  '...kfeffffefk...',
  '...kffffffffk...',
  '....kffffffk....',
  '...kcccccccck...',
  '..kfccccccccfk..',
  '..kfccccccccfk..',
  '...kcccccccck...',
  '...kllllllllk...',
  '...kppppppppk...',
];

const HUMAN_UP = [
  '................',
  '....kkkkkkkk....',
  '...khhhhhhhhk...',
  '...khhhhhhhhk...',
  '...khhhhhhhhk...',
  '...khhhhhhhhk...',
  '...khhhhhhhhk...',
  '....kffffffk....',
  '...kcccccccck...',
  '..kfccccccccfk..',
  '..kfccccccccfk..',
  '...kcccccccck...',
  '...kllllllllk...',
  '...kppppppppk...',
];

const HUMAN_SIDE = [
  '................',
  '.....kkkkkk.....',
  '....khhhhhhk....',
  '....khhhhhhk....',
  '....kffhhhhk....',
  '....kefhhhhk....',
  '....kfffhhhk....',
  '.....kfffk......',
  '....kcccccck....',
  '....kfccccck....',
  '....kfccccck....',
  '....kcccccck....',
  '....kllllllk....',
  '....kppppppk....',
];

export type Facing = 'down' | 'up' | 'side';

/** A person: 16×16, two walk frames per facing (side faces left; flip for right). */
export function human(facing: Facing, frame: 0 | 1, colors: HumanColors, extraRows?: Readonly<Record<number, string>>): PixelArt {
  const body = facing === 'down' ? HUMAN_DOWN : facing === 'up' ? HUMAN_UP : HUMAN_SIDE;
  const legs = facing === 'side' ? (frame === 0 ? HUMAN_LEGS.sideApart : HUMAN_LEGS.sideTogether) : frame === 0 ? HUMAN_LEGS.apart : HUMAN_LEGS.together;
  const rows = [...body, ...legs];
  if (extraRows) for (const [index, row] of Object.entries(extraRows)) rows[Number(index)] = row;
  return {
    rows,
    palette: { k: OUTLINE, h: colors.hair, f: colors.skin, e: '#20202a', c: colors.tunic, l: colors.belt, p: colors.pants, b: colors.boots, m: '#8a2a2a' },
  };
}

// ---- creatures ---------------------------------------------------------------

export const RAT: PixelArt = {
  rows: [
    '................', '................', '................', '................', '................', '................', '................', '................',
    '....kk....kk....',
    '...kggk..kggk...',
    '...kgggkkgggk...',
    '..kggggggggggk..',
    '.kgeggggggggegk.',
    '.kggggnggggggk.t',
    '..kkggggggggkkt.',
    '....kk..kk...t..',
  ],
  palette: { k: OUTLINE, g: '#8a8590', e: '#20202a', n: '#e8a0a0', t: '#c48a8a' },
};

export const COW: PixelArt = {
  rows: [
    '................', '................', '................',
    '..oo........oo..',
    '..kokk....kkok..',
    '...kwwwkkwwwk...',
    '..kwwwwwwwwwwk..',
    '.kwsswwwwwwsswk.',
    '.kwsswewwewsswk.',
    '.kwwwwwwwwwwwwk.',
    '..kwwnnnnnnwwk..',
    '..kwnnnnnnnnwk..',
    '...knnnnnnnnk...',
    '....kkkkkkkk....',
    '....kwwk.kwwk...',
    '....kkkk.kkkk...',
  ],
  palette: { k: OUTLINE, o: '#d8c8a0', w: '#f2efe8', s: '#2a2622', e: '#20202a', n: '#e8b0b0' },
};

export const GOBLIN: PixelArt = {
  rows: [
    '................', '................', '................',
    '.....kkkkkk.....',
    '....kggggggggk..',
    '.kgkgeggggegkgk.',
    '....kggggggggk..',
    '.....kggggggk...',
    '....kddddddddk..',
    '...kgkddddddkgk.',
    '...kgkddddddkgk.',
    '....kddddddddk..',
    '....kllllllllk..',
    '....kggkkkggk...',
    '....kggk.kggk...',
    '....kkkk.kkkk...',
  ],
  palette: { k: OUTLINE, g: '#6f9a3a', e: '#e03030', d: '#5a4a34', l: '#8a6a2a' },
};

export const WOLF: PixelArt = {
  rows: [
    '................', '................', '................', '................', '................', '................',
    '....kk..........',
    '...kggk.........',
    '..kggggkkkkkkk..',
    '.kgeggggggggggk.',
    '.kggggggggggggk.',
    '..kkgggggggggkk.',
    '...kggggggggkk.t',
    '....kggkkkggkkt.',
    '....kgk..kgk.t..',
    '....kkk..kkk....',
  ],
  palette: { k: OUTLINE, g: '#7a7f88', e: '#f0d040', t: '#6a6f78' },
};

export const SPIDER: PixelArt = {
  rows: [
    '................', '................', '................', '................', '................',
    '......kkkk......',
    '.....kssssk.....',
    '..k..ksesesk..k.',
    '...k.kssssk.k...',
    '....ksssssssk...',
    '.kkkksssssssskkk',
    '....kssssssssk..',
    '...k.kssssssk.k.',
    '..k...kkkkkk..k.',
    '.k............k.',
    '................',
  ],
  palette: { k: OUTLINE, s: '#3a3540', e: '#ff3a3a' },
};

export const SKELETON: PixelArt = {
  rows: [
    '................',
    '.....kkkkkk.....',
    '....kwwwwwwk....',
    '....kwwwwwwk....',
    '....kweewweewk..',
    '....kwwwwwwwk...',
    '.....kwkwkwk....',
    '......kwwk......',
    '...kkwwwwwwkk...',
    '..kwkwkwwkwkwk..',
    '..kwkwwkkwwkwk..',
    '..kwkwkwwkwkwk..',
    '...kkwwwwwwkk...',
    '.....kwkkwk.....',
    '.....kwk.kwk....',
    '.....kkk.kkk....',
  ],
  palette: { k: OUTLINE, w: '#e8e2d0', e: '#20202a' },
};

export const SLIME: PixelArt = {
  rows: [
    '................', '................', '................', '................', '................', '................',
    '......kkkk......',
    '....kkssssskk...',
    '...kssssssssssk.',
    '..kssesssssesssk',
    '..kssssssssssssk',
    '.kssssssssssssk.',
    '.kssssssssssssk.',
    '.kssssssssssssk.',
    '..kkssssssssskk.',
    '....kkkkkkkkk...',
  ],
  palette: { k: OUTLINE, s: '#5a6a3a', e: '#e8e070' },
};

export const HARPY: PixelArt = {
  rows: [
    '................', '................', '................',
    '......kkkk......',
    '.....kffffk.....',
    '.....kfeefk.....',
    'kk...kffffk...kk',
    'kwwk..kffk..kwwk',
    '.kwwwkkffkkwwwk.',
    '..kwwwwffffwwwk.',
    '...kkwwffffwwkk.',
    '.....kkffffkk...',
    '......kffffk....',
    '......kfkkfk....',
    '......kck.kck...',
    '................',
  ],
  palette: { k: OUTLINE, f: '#d8b090', e: '#20202a', w: '#8a6a4a', c: '#e0c040' },
};

export const DRAGON: PixelArt = {
  rows: [
    '................', '................', '................',
    '......kk........',
    '.....kggk.......',
    '...kkgggggk.kk..',
    '..kgegggggkkggk.',
    '.kggggggggggggk.',
    '.kkkkgggggggggk.',
    '....kggggggggkk.',
    '....kggggggggkkt',
    '...kggggggggkt..',
    '...kggkkkggkkt..',
    '...kgk...kgk.t..',
    '...kkk...kkk....',
    '................',
  ],
  palette: { k: OUTLINE, g: '#4a8a4a', e: '#f0d040', t: '#3a6a3a' },
};

export const CULTIST: PixelArt = {
  rows: [
    '................',
    '....kkkkkkkk....',
    '...krrrrrrrrk...',
    '..krrrrrrrrrrk..',
    '..krkkkkkkkkrk..',
    '..krkekkkkekrk..',
    '..krkkkkkkkkrk..',
    '...krrrrrrrrk...',
    '...krrrrrrrrk...',
    '..krkrrrrrrkrk..',
    '..krkrrrrrrkrk..',
    '...krrrrrrrrk...',
    '...krrrrrrrrk...',
    '...krrrrrrrrk...',
    '...krrrrrrrrk...',
    '...kkkkkkkkkk...',
  ],
  palette: { k: OUTLINE, r: '#6a1e3a', e: '#ff7a30' },
};

// ---- gathering spots ---------------------------------------------------------

/** 16×24: canopy above the cell, trunk in it. */
export const TREE: PixelArt = {
  rows: [
    '.....kkkkkk.....',
    '...kkcccccckk...',
    '..kcccccccccck..',
    '.kccccdccccccck.',
    '.kcccccccdcccck.',
    'kccdccccccccdcck',
    'kcccccccdcccccck',
    'kcccdcccccccdcck',
    '.kcccccccccccck.',
    '.kccdcccccccdck.',
    '..kcccccccccck..',
    '...kkcccccckk...',
    '.....kkkttkk....',
    '.......kttk.....',
    '.......kttk.....',
    '.......kttk.....',
    '.......kttk.....',
    '.......kttk.....',
    '......kttttk....',
    '......kttttk....',
    '.....kkttttkk...',
    '.....kkkkkkkk...',
    '................',
    '................',
  ],
  palette: { k: OUTLINE, c: '#3d7a35', d: '#2c5c28', t: '#6a4a2a' },
};

export const ROCK: PixelArt = {
  rows: [
    '................', '................', '................', '................',
    '.....kkkkkk.....',
    '....kggggggk....',
    '...kggghgggggk..',
    '..kggogggggoggk.',
    '..kgggggggggggk.',
    '.kgggggoggggoggk',
    '.kggoggggggggggk',
    '.kgggggggogggggk',
    '.kdgggggggggggdk',
    '..kdddddddddddk.',
    '...kkkkkkkkkkk..',
    '................',
  ],
  palette: { k: OUTLINE, g: '#7a7f88', h: '#a8adb8', d: '#4f545c', o: '#d08a3a' },
};

/** Drawn over water: ripples and a fish shadow. */
export const FISHING_SPOT: PixelArt = {
  rows: [
    '................',
    '................',
    '....wwww........',
    '...w....w.......',
    '................',
    '.........wwwww..',
    '................',
    '................',
    '..kffk..........',
    '.kffffk..w......',
    '..kffk..w..w....',
    '................',
    '.....wwwww......',
    '................',
    '..........www...',
    '................',
  ],
  palette: { k: '#183a5a', f: '#1f4f7a', w: '#bfe6ff' },
};

export const FIELD: PixelArt = {
  rows: [
    'ssssssssssssssss',
    'sccssccssccsscss',
    'soossoossoossoss',
    'ssssssssssssssss',
    'sddddddddddddddd',
    'sccssccssccsscss',
    'soossoossoossoss',
    'ssssssssssssssss',
    'sddddddddddddddd',
    'sccssccssccsscss',
    'soossoossoossoss',
    'ssssssssssssssss',
    'sddddddddddddddd',
    'sccssccssccsscss',
    'soossoossoossoss',
    'ssssssssssssssss',
  ],
  palette: { s: '#7c6244', d: '#5e4a30', c: '#d8b640', o: '#e8c850' },
};

export const PATCH: PixelArt = {
  rows: [
    '................', '................', '................', '................', '................',
    '.....kkkk.......',
    '...kkggggkk.....',
    '..kggfgggggk....',
    '.kgggggggfggk...',
    '.kgfggggggggk...',
    '..kgggggfgggk...',
    '...kkggggggkk...',
    '.....kkkkkk.....',
    '................', '................', '................',
  ],
  palette: { k: OUTLINE, g: '#4f8a3c', f: '#e8e8f0' },
};

// ---- stations ----------------------------------------------------------------

export const CAMPFIRE: readonly PixelArt[] = [
  {
    rows: [
      '................', '................', '................', '................',
      '.......yy.......',
      '......yooy......',
      '.....yooooy.....',
      '.....roooor.....',
      '....rrooorr.....',
      '....rrrrrrr.....',
      '..kttttkkttttk..',
      '.kttttttttttttk.',
      '..kkkkkkkkkkkk..',
      '................', '................', '................',
    ],
    palette: { k: OUTLINE, y: '#fff0a0', o: '#ffa030', r: '#d84a20', t: '#6a4a2a' },
  },
  {
    rows: [
      '................', '................', '................',
      '........y.......',
      '......yy........',
      '.....yoyyo......',
      '......ooooy.....',
      '.....roooor.....',
      '....rroooorr....',
      '....rrrrrrr.....',
      '..kttttkkttttk..',
      '.kttttttttttttk.',
      '..kkkkkkkkkkkk..',
      '................', '................', '................',
    ],
    palette: { k: OUTLINE, y: '#fff0a0', o: '#ffa030', r: '#d84a20', t: '#6a4a2a' },
  },
];

export const ANVIL: PixelArt = {
  rows: [
    '................', '................', '................', '................', '................', '................',
    '.kkkkkkkkkkkkkk.',
    '.kaaaaaaaaaaaak.',
    '..kaaaaaaaaaaak.',
    '...kkkkaaaakkk..',
    '.......kaaak....',
    '.......kaaak....',
    '.....kkaaaaakk..',
    '....kttttttttk..',
    '....kttttttttk..',
    '....kkkkkkkkkk..',
  ],
  palette: { k: OUTLINE, a: '#4a4f5a', t: '#6a4a2a' },
};

export const FURNACE: readonly PixelArt[] = [
  {
    rows: [
      '................', '................',
      '...kkkkkkkkkk...',
      '..kssssssssssk..',
      '..kssssssssssk..',
      '.kssssssssssssk.',
      '.kssskkkkkkssssk',
      '.ksskooooookssk.',
      '.ksskoyyyyokssk.',
      '.ksskooooookssk.',
      '.kssskkkkkkssssk',
      '.kssssssssssssk.',
      '.kssssssssssssk.',
      '.kkkkkkkkkkkkkk.',
      '................', '................',
    ],
    palette: { k: OUTLINE, s: '#6b6f78', o: '#ff8a20', y: '#ffe080' },
  },
  {
    rows: [
      '................', '................',
      '...kkkkkkkkkk...',
      '..kssssssssssk..',
      '..kssssssssssk..',
      '.kssssssssssssk.',
      '.kssskkkkkkssssk',
      '.ksskoyooyokssk.',
      '.ksskoooooookssk',
      '.ksskyooooykssk.',
      '.kssskkkkkkssssk',
      '.kssssssssssssk.',
      '.kssssssssssssk.',
      '.kkkkkkkkkkkkkk.',
      '................', '................',
    ],
    palette: { k: OUTLINE, s: '#6b6f78', o: '#ff8a20', y: '#ffe080' },
  },
];

export const SAWBENCH: PixelArt = {
  rows: [
    '................', '................', '................', '................',
    '.....kzzzzk.....',
    '....kssssssk....',
    '..kkkkkkkkkkkk..',
    '.kttttttttttttk.',
    '.kttmmmmmmmmttk.',
    '.kttttttttttttk.',
    '..kkkkkkkkkkkk..',
    '...kk......kk...',
    '...kk......kk...',
    '...kk......kk...',
    '................', '................',
  ],
  palette: { k: OUTLINE, z: '#5a3a1a', s: '#b8bcc8', t: '#8a6a3a', m: '#6a4a2a' },
};

export const TANNERY: PixelArt = {
  rows: [
    '................', '................', '................',
    '..kk........kk..',
    '..kkkkkkkkkkkk..',
    '..kkhhhhhhhhkk..',
    '..kkhhhhhhhhkk..',
    '..kkhhhhhhhhkk..',
    '..kkhhhhhhhhkk..',
    '..kkhhhhhhhhkk..',
    '..kkkkkkkkkkkk..',
    '..kk........kk..',
    '..kk........kk..',
    '..kk........kk..',
    '................', '................',
  ],
  palette: { k: OUTLINE, h: '#c89a5a' },
};

// ---- places ------------------------------------------------------------------

export const CART: PixelArt = {
  rows: [
    '................', '................', '................', '................', '................',
    '....kkkkkkkk....',
    '...kbbbbbbbbk...',
    '..kbbbbbbbbbbk..',
    '.kttttttttttttk.',
    '.kttttttttttttk.',
    '.kkkkkkkkkkkkkk.',
    '..kwwk....kwwk..',
    '..kwwk....kwwk..',
    '...kk......kk...',
    '................', '................',
  ],
  palette: { k: OUTLINE, b: '#b8884a', t: '#8a6a3a', w: '#5a4a3a' },
};

export const SIGNPOST: PixelArt = {
  rows: [
    '................', '................', '................',
    '....kkkkkkkk....',
    '...kwwwwwwwwk...',
    '...kwwwwwwwwwk..',
    '....kkkkkkkk....',
    '.......kk.......',
    '......kwwwwwwk..',
    '.....kwwwwwwwwk.',
    '......kkkkkkkk..',
    '.......kppk.....',
    '.......kppk.....',
    '.......kppk.....',
    '......kkppkk....',
    '......kkkkkk....',
  ],
  palette: { k: OUTLINE, w: '#b8884a', p: '#6a4a2a' },
};

/** 32×32 house: a roof, a wall, a door and a sign. */
export function house(roof: string, wall = '#c9b48a'): PixelArt {
  const rows: string[] = [];
  for (let i = 0; i < 12; i++) {
    const inner = 2 + i * 2;
    const pad = (32 - inner - 2) / 2;
    rows.push('.'.repeat(pad) + 'k' + 'r'.repeat(inner) + 'k' + '.'.repeat(pad));
  }
  rows.push('k'.repeat(32));
  rows.push('k' + 'r'.repeat(30) + 'k');
  rows.push('k'.repeat(32));
  for (let i = 0; i < 16; i++) {
    let row = 'k' + 'w'.repeat(30) + 'k';
    if (i >= 3 && i <= 7) row = row.slice(0, 5) + 'kggggk' + row.slice(11, 21) + 'kggggk' + row.slice(27);
    if (i >= 8 && i <= 14) row = row.slice(0, 13) + 'kddddk' + row.slice(19);
    if (i === 15) row = 'k'.repeat(32);
    rows.push(row);
  }
  rows.push('.'.repeat(32));
  return { rows, palette: { k: OUTLINE, r: roof, w: wall, g: '#9fd0f0', d: '#5a3a1a' } };
}

/** 32×32 market stall: a striped awning over a counter of goods. */
export function stall(stripe: string): PixelArt {
  const rows: string[] = [];
  rows.push('.'.repeat(32));
  rows.push('.'.repeat(3) + 'k'.repeat(26) + '.'.repeat(3));
  for (let i = 0; i < 6; i++) rows.push('..k' + ('sw'.repeat(13)).slice(0, 26) + 'k..');
  rows.push('..k' + 'k'.repeat(26) + 'k..');
  for (let i = 0; i < 4; i++) rows.push('..kk' + '.'.repeat(24) + 'kk..');
  rows.push('..kk' + 'k'.repeat(24) + 'kk..');
  rows.push('..kk' + 'bbbbbbbbbbbbbbbbbbbbbbbb' + 'kk..');
  rows.push('..kk' + 'baaabbbcccbbbaaabbbcccbb' + 'kk..');
  rows.push('..kk' + 'baaabbbcccbbbaaabbbcccbb' + 'kk..');
  rows.push('..kk' + 'k'.repeat(24) + 'kk..');
  for (let i = 0; i < 9; i++) rows.push('..kk' + 'tttttttttttttttttttttttt' + 'kk..');
  rows.push('..k' + 'k'.repeat(26) + 'k..');
  while (rows.length < 32) rows.push('.'.repeat(32));
  return { rows, palette: { k: OUTLINE, s: stripe, w: '#f0ead8', b: '#8a6a3a', a: '#d84a20', c: '#e8c850', t: '#a07a48' } };
}

// ---- ground tiles ------------------------------------------------------------

/** Tile rows use generic letters; the biome supplies the colours. */
export const TILE_ROWS: Readonly<Record<string, readonly string[]>> = {
  grass: [
    'aaaaaaaaaaaaaaaa', 'aaaabaaaaaaaaaaa', 'aaaaaaaaaaabaaaa', 'aaaaaaaaaaaaaaaa', 'abaaaaaaaaaaaaaa', 'aaaaaaaabaaaaaaa', 'aaaaaaaaaaaaaaba', 'aaaaaaaaaaaaaaaa',
    'aaaaabaaaaaaaaaa', 'aaaaaaaaaaaaaaaa', 'aaaaaaaaaaabaaaa', 'aabaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa', 'aaaaaaaabaaaaaaa', 'aaaaaaaaaaaaaaba', 'aaaaaaaaaaaaaaaa',
  ],
  grass2: [
    'aaaaaaaaaaaaaaaa', 'aaaaaaaaaabaaaaa', 'aabaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa', 'aaaaaaabaaaaaaaa', 'aaaaaaaaaaaaaaba', 'aaaaaaaaaaaaaaaa', 'aaabaaaaaaaaaaaa',
    'aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaabaaa', 'aaaaaabaaaaaaaaa', 'aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa', 'abaaaaaaaabaaaaa', 'aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa',
  ],
  path: [
    'pppppppppppppppp', 'ppppppqppppppppp', 'pppppppppppppqpp', 'pppppppppppppppp', 'ppqppppppppppppp', 'pppppppppppppppp', 'ppppppppppqppppp', 'pppppppppppppppp',
    'pppppppppppppppp', 'pppqpppppppppppp', 'pppppppppppppppp', 'ppppppppppppqppp', 'pppppppqpppppppp', 'pppppppppppppppp', 'pppppppppppppppp', 'ppppppppppppppqp',
  ],
  tallgrass: [
    'aaaaaaaaaaaaaaaa', 'aacaaaaacaaaaaca', 'aacaaaaacaaaaaca', 'accaaaaccaaaaacc', 'aaaaaaaaaaaaaaaa', 'aaaaacaaaaacaaaa', 'aaaaacaaaaacaaaa', 'aaaaccaaaaccaaaa',
    'aaaaaaaaaaaaaaaa', 'acaaaaaacaaaaaca', 'acaaaaaacaaaaaca', 'ccaaaaaccaaaaacc', 'aaaaaaaaaaaaaaaa', 'aaaacaaaaaacaaaa', 'aaaacaaaaaacaaaa', 'aaaccaaaaaccaaaa',
  ],
  flowers: [
    'aaaaaaaaaaaaaaaa', 'aaafaaaaaaaawaaa', 'aafffaaaaaawwwaa', 'aaafaaaaaaaawaaa', 'aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa', 'aaaaaaaaafaaaaaa', 'aaaaaaaafffaaaaa',
    'aaaaaaaaafaaaaaa', 'aaaaaaaaaaaaaaaa', 'aawaaaaaaaaaaaaa', 'awwwaaaaaaaaafaa', 'aawaaaaaaaaafffa', 'aaaaaaaaaaaaafaa', 'aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa',
  ],
  dirt: [
    'dddddddddddddddd', 'ddddeddddddddddd', 'dddddddddddedddd', 'dddddddddddddddd', 'ddedddddddddddde', 'ddddddddddeddddd', 'dddddddddddddddd', 'dddddeddddddddde',
    'dddddddddddddddd', 'ddddddddddddeddd', 'dedddddddddddddd', 'dddddddddedddddd', 'dddddddddddddddd', 'ddddddedddddddde', 'dddddddddddddddd', 'ddddddddddddddde',
  ],
  floor: [
    'llllllllllllllll', 'looooooolooooooo', 'looooooolooooooo', 'looooooolooooooo', 'looooooolooooooo', 'looooooolooooooo', 'looooooolooooooo', 'looooooolooooooo',
    'llllllllllllllll', 'oooloooooooolooo', 'oooloooooooolooo', 'oooloooooooolooo', 'oooloooooooolooo', 'oooloooooooolooo', 'oooloooooooolooo', 'oooloooooooolooo',
  ],
  bridge: [
    'mnnnnnnnmnnnnnnn', 'mnnnnnnnmnnnnnnn', 'mmmmmmmmmmmmmmmm', 'nnnmnnnnnnnmnnnn', 'nnnmnnnnnnnmnnnn', 'mmmmmmmmmmmmmmmm', 'mnnnnnnnmnnnnnnn', 'mnnnnnnnmnnnnnnn',
    'mmmmmmmmmmmmmmmm', 'nnnmnnnnnnnmnnnn', 'nnnmnnnnnnnmnnnn', 'mmmmmmmmmmmmmmmm', 'mnnnnnnnmnnnnnnn', 'mnnnnnnnmnnnnnnn', 'mmmmmmmmmmmmmmmm', 'nnnmnnnnnnnmnnnn',
  ],
  water: [
    'wwwwwwwwwwwwwwww', 'wwvvwwwwwwwwwwww', 'wwwwwwwwwwvvvwww', 'wwwwwwwwwwwwwwww', 'wwwwwwwvvwwwwwww', 'wwwwwwwwwwwwwwww', 'vvwwwwwwwwwwwwvv', 'wwwwwwwwwwwwwwww',
    'wwwwwvvvwwwwwwww', 'wwwwwwwwwwwwwwww', 'wwwwwwwwwwwwvvww', 'wwvwwwwwwwwwwwww', 'wwwwwwwwwwwwwwww', 'wwwwwwwwvvwwwwww', 'wwwwwwwwwwwwwwww', 'wwwvvwwwwwwwwwww',
  ],
  water2: [
    'wwwwwwwwwwwwwwww', 'wwwvvwwwwwwwwwww', 'wwwwwwwwwwwvvvww', 'wwwwwwwwwwwwwwww', 'wwwwwwwwvvwwwwww', 'wwwwwwwwwwwwwwww', 'wvvwwwwwwwwwwwwv', 'wwwwwwwwwwwwwwww',
    'wwwwwwvvvwwwwwww', 'wwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwvvw', 'wwwvwwwwwwwwwwww', 'wwwwwwwwwwwwwwww', 'wwwwwwwwwvvwwwww', 'wwwwwwwwwwwwwwww', 'wwwwvvwwwwwwwwww',
  ],
  rock: [
    'ssssssssssssssss', 'srrrrrrrsrrrrrrs', 'srrrrrrrsrrrrrrs', 'srrrrrrrsrrrrrrs', 'srrrrrrrsrrrrrrs', 'stttttttsttttttt', 'ssssssssssssssss', 'rrrrsrrrrrrrsrrr',
    'rrrrsrrrrrrrsrrr', 'rrrrsrrrrrrrsrrr', 'ttttsttttttttttt', 'ssssssssssssssss', 'srrrrrrrsrrrrrrs', 'srrrrrrrsrrrrrrs', 'stttttttsttttttt', 'ssssssssssssssss',
  ],
  trees: [
    'gggghgggggghgggg', 'ggghhhggggghhhgg', 'gggghgggggghgggg', 'gggggggkgggggggg', 'ghggggggggggghgg', 'hhhgggghggggghhh', 'ghgggghhhgggghgg', 'gggggggkgggggggg',
    'gggkggggggghgggg', 'gggggggggghhhggg', 'ggghggggggghgggg', 'gghhhggggggggggg', 'gggkggggghgggggg', 'ggggggggghhhgkgg', 'gggghgggggghgggg', 'gggggggggggggggg',
  ],
  fence: [
    'aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa', 'nnnnnnnnnnnnnnnn', 'mmmmmmmmmmmmmmmm', 'aannaaaaaaaannaa', 'aannaaaaaaaannaa',
    'nnnnnnnnnnnnnnnn', 'mmmmmmmmmmmmmmmm', 'aannaaaaaaaannaa', 'aannaaaaaaaannaa', 'aammaaaaaaaammaa', 'aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa', 'aaaaaaaaaaaaaaaa',
  ],
  void: ['zzzzzzzzzzzzzzzz', 'zzzzzzzzzzzzzzzz', 'zzzzzzzzzzzzzzzz', 'zzzzzzzzzzzzzzzz', 'zzzzzzzzzzzzzzzz', 'zzzzzzzzzzzzzzzz', 'zzzzzzzzzzzzzzzz', 'zzzzzzzzzzzzzzzz',
    'zzzzzzzzzzzzzzzz', 'zzzzzzzzzzzzzzzz', 'zzzzzzzzzzzzzzzz', 'zzzzzzzzzzzzzzzz', 'zzzzzzzzzzzzzzzz', 'zzzzzzzzzzzzzzzz', 'zzzzzzzzzzzzzzzz', 'zzzzzzzzzzzzzzzz'],
};

/** Every colour a biome needs, keyed by the letters TILE_ROWS use. */
export type BiomePalette = {
  a: string; b: string; c: string; f: string; w: string; v: string; p: string; q: string; d: string; e: string; o: string; l: string;
  n: string; m: string; r: string; s: string; t: string; g: string; h: string; k: string; z: string;
};

export const ALL_ART: Readonly<Record<string, PixelArt>> = {
  rat: RAT, cow: COW, goblin: GOBLIN, wolf: WOLF, spider: SPIDER, skeleton: SKELETON, slime: SLIME, harpy: HARPY, dragon: DRAGON, cultist: CULTIST,
  tree: TREE, rock: ROCK, fishing: FISHING_SPOT, field: FIELD, patch: PATCH,
  campfire0: CAMPFIRE[0]!, campfire1: CAMPFIRE[1]!, anvil: ANVIL, furnace0: FURNACE[0]!, furnace1: FURNACE[1]!, sawbench: SAWBENCH, tannery: TANNERY,
  cart: CART, signpost: SIGNPOST, house: house('#a04030'), stall: stall('#d84a20'),
  playerDown0: human('down', 0, PLAYER_COLORS), playerDown1: human('down', 1, PLAYER_COLORS),
  playerUp0: human('up', 0, PLAYER_COLORS), playerUp1: human('up', 1, PLAYER_COLORS),
  playerSide0: human('side', 0, PLAYER_COLORS), playerSide1: human('side', 1, PLAYER_COLORS),
};
