import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // The production build is one self-contained dist/index.html: it works when
  // double-clicked from disk (no server needed) and when hosted anywhere.
  plugins: [viteSingleFile()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
