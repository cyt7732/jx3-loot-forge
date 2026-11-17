import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const appVersion = (JSON.parse(readFileSync(new URL('../VERSION.json', import.meta.url), 'utf8')) as { appVersion: string }).appVersion;

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 20_000,
  },
});
