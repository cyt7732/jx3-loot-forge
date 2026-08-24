import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 10_000,
    outDir: 'dist/offline-temp',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: resolve(import.meta.dirname, 'offline/index.html'),
    },
  },
});
