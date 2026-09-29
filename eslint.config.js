// Layer boundaries (see ARCHITECTURE.md §2). Violations fail `npm run lint`.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const noUi = { group: ['**/ui/**', '@/ui/**'], message: 'Game logic must not import the UI layer.' };
const noSystems = { group: ['**/systems/**', '@/systems/**'], message: 'This layer must not import systems.' };
const noCore = { group: ['**/core/**', '@/core/**'], message: 'This layer must not import core.' };
const noContent = { group: ['**/content/**', '@/content/**'], message: 'This layer must not import content.' };
const noGame = { group: ['**/game', '@/game', '../game', './game'], message: 'Only the UI and main.ts may import the Game facade.' };

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Game rules: no DOM, no UI, no facade.
    files: ['src/systems/**', 'src/core/**', 'src/content/**', 'src/types/**'],
    rules: {
      'no-restricted-globals': ['error', 'document', 'window', 'localStorage', 'sessionStorage', 'requestAnimationFrame', 'alert'],
    },
  },
  {
    files: ['src/systems/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [noUi, noGame] }] },
  },
  {
    // Content is data: only types (and other content) allowed.
    files: ['src/content/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [noUi, noSystems, noCore, noGame] }] },
  },
  {
    // Core is generic plumbing: it may not know about rules or content.
    files: ['src/core/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [noUi, noSystems, noContent, noGame] }] },
  },
  {
    files: ['src/types/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [noUi, noSystems, noCore, noGame] }] },
  },
  {
    // The world model is pure geometry over map content: types only, no DOM.
    files: ['src/world/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [noUi, noSystems, noCore, noContent, noGame] }],
      'no-restricted-globals': ['error', 'document', 'window', 'localStorage', 'sessionStorage', 'requestAnimationFrame', 'alert'],
    },
  },
  {
    // The UI reads state and calls the facade; it never reaches into systems.
    files: ['src/ui/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [noSystems, noCore] }] },
  },
  {
    // core/storage.ts and core/loop.ts are the only browser-API adapters.
    files: ['src/core/storage.ts', 'src/core/loop.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
);
