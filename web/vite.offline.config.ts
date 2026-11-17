import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { parseChangelog } from './scripts/parse-changelog.mjs';

const appVersion = (JSON.parse(readFileSync(new URL('../VERSION.json', import.meta.url), 'utf8')) as { appVersion: string }).appVersion;
const changelogEntries = parseChangelog(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'));

export default defineConfig({
  base: './',
  publicDir: false,
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __CHANGELOG__: JSON.stringify(changelogEntries),
  },
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
