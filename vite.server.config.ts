import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// Bundles the zone server into dist-server/main.js for `npm start`. Node built-ins and ws stay external.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    ssr: 'src/server/main.ts',
    outDir: 'dist-server',
    emptyOutDir: true,
    target: 'node22',
    rollupOptions: { output: { entryFileNames: 'main.js' } },
  },
});
