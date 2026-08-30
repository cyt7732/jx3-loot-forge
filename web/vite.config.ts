import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: 'public',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 3000,
    outDir: 'dist/web',
    emptyOutDir: true,
    cssCodeSplit: true,
    rollupOptions: {
      input: resolve(import.meta.dirname, 'index.html'),
    },
  },
});
