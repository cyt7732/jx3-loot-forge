import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { parseChangelog } from './scripts/parse-changelog.mjs';

const appVersion = (JSON.parse(readFileSync(new URL('../VERSION.json', import.meta.url), 'utf8')) as { appVersion: string }).appVersion;
const changelogEntries = parseChangelog(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'));

export default defineConfig({
  base: './',
  publicDir: 'public',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __CHANGELOG__: JSON.stringify(changelogEntries),
  },
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
