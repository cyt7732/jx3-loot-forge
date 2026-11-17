import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { parseChangelog } from './scripts/parse-changelog.mjs';

const appVersion = (JSON.parse(readFileSync(new URL('../VERSION.json', import.meta.url), 'utf8')) as { appVersion: string }).appVersion;
const changelogEntries = parseChangelog(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __CHANGELOG__: JSON.stringify(changelogEntries),
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
