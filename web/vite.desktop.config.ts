import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: 'public',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 10_000,
    outDir: 'dist/desktop',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'offline/index.html'),
    },
  },
});
