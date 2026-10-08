// Layer boundaries (see ARCHITECTURE.md §2). Violations fail `npm run lint`.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const noUi = { group: ['**/ui/**', '@/ui/**'], message: 'Only the page entry imports the UI layer.' };
const noServer = { group: ['**/server/**', '@/server/**'], message: 'Only the server imports server code.' };
const noClient = { group: ['**/client/**', '@/client/**'], message: 'Only the UI imports the client layer.' };
const noCore = { group: ['**/core/**', '@/core/**'], message: 'This layer must not import core.' };
const noContent = { group: ['**/content/**', '@/content/**'], message: 'This layer must not import content.' };
const noNet = { group: ['**/net/**', '@/net/**'], message: 'This layer must not import the protocol.' };
const noWorld = { group: ['**/world/**', '@/world/**'], message: 'This layer must not import the world model.' };
const browserGlobals = ['document', 'window', 'localStorage', 'sessionStorage', 'requestAnimationFrame', 'alert'];

export default tseslint.config(
  { ignores: ['dist/**', 'dist-server/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Shared types: nothing below them, except type-only imports of the content tables to derive the id unions.
    files: ['src/types/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [noUi, noServer, noClient, noCore, noNet, noWorld] }],
      'no-restricted-globals': ['error', ...browserGlobals],
    },
  },
  {
    // Content is data: only types (and other content) allowed.
    files: ['src/content/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [noUi, noServer, noClient, noCore, noNet, noWorld] }],
      'no-restricted-globals': ['error', ...browserGlobals],
    },
  },
  {
    // Core is generic plumbing (the content registry, the seeded RNG): types only.
    files: ['src/core/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [noUi, noServer, noClient, noContent, noNet, noWorld] }],
      'no-restricted-globals': ['error', ...browserGlobals],
    },
  },
  {
    // The world model is pure geometry over map content: types only, no DOM.
    files: ['src/world/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [noUi, noServer, noClient, noCore, noContent, noNet] }],
      'no-restricted-globals': ['error', ...browserGlobals],
    },
  },
  {
    // The wire protocol is shared by browser and server: types and world geometry only, no DOM.
    files: ['src/net/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [noUi, noServer, noClient, noCore, noContent] }],
      'no-restricted-globals': ['error', ...browserGlobals],
    },
  },
  {
    // The client replica and socket feed the UI but are not DOM code themselves.
    files: ['src/client/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [noUi, noServer, noCore, noContent] }],
      'no-restricted-globals': ['error', ...browserGlobals],
    },
  },
  {
    // The server runs the rules and moves messages; it never touches the browser.
    files: ['src/server/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [noUi, noClient] }],
      'no-restricted-globals': ['error', ...browserGlobals],
    },
  },
  {
    // The server's entry point is where its log lines are written.
    files: ['src/server/main.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // The UI draws the replica and sends intents; content reaches it through an injected interface.
    files: ['src/ui/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [noServer, noCore, noContent] }] },
  },
);
