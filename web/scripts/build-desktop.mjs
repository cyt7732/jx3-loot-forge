import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(__dirname, '..');
const DESKTOP_DIR = resolve(PROJECT_DIR, 'dist/desktop');

console.log('[INFO] Building desktop frontend bundle...');
await rm(DESKTOP_DIR, { recursive: true, force: true });
await mkdir(DESKTOP_DIR, { recursive: true });

await build({ configFile: resolve(PROJECT_DIR, 'vite.desktop.config.ts') });

const tempHtml = resolve(DESKTOP_DIR, 'offline/index.html');
const rootHtml = resolve(DESKTOP_DIR, 'index.html');
try {
  let content = await readFile(tempHtml, 'utf8');
  content = content.replace(/(?:\.\.\/)+assets\//g, './assets/');
  await writeFile(rootHtml, content, 'utf8');
  await rm(resolve(DESKTOP_DIR, 'offline'), { recursive: true, force: true });
} catch {
  // index.html already at root
}

console.log('[SUCCESS] Desktop frontend bundle successfully built in web/dist/desktop');
