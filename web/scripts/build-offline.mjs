import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { build } from 'vite';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(SCRIPT_DIR, '..');
const TEMP_DIR = resolve(PROJECT_DIR, 'dist/offline-temp');
const FINAL_DIR = resolve(PROJECT_DIR, 'dist/offline');
const TEMP_HTML = resolve(TEMP_DIR, 'offline/index.html');
const FINAL_HTML = resolve(FINAL_DIR, 'index.html');
const CATALOG_PATH = resolve(PROJECT_DIR, 'src/catalog/catalog.std.json');

function localAssetPath(reference) {
  const normalized = reference.replace(/^\.\//u, '').replace(/^\//u, '');
  const targetPath = resolve(dirname(TEMP_HTML), normalized);
  const rel = relative(TEMP_DIR, targetPath);
  if (rel.startsWith('..') || resolve(TEMP_DIR, rel) !== targetPath) throw new Error(`Unsafe asset path: ${reference}`);
  return targetPath;
}

await build({ configFile: resolve(PROJECT_DIR, 'vite.offline.config.ts') });
let html = await readFile(TEMP_HTML, 'utf8');
const stylesheetMatch = html.match(/<link rel="stylesheet"[^>]*href="(?!(?:https?:)?\/\/)([^"]+)"[^>]*>/u);
if (!stylesheetMatch) throw new Error('Offline build did not produce a bundled stylesheet.');
const css = await readFile(localAssetPath(stylesheetMatch[1]), 'utf8');
html = html.replace(stylesheetMatch[0], () => `<style>${css.replace(/<\/style/giu, '<\\/style')}</style>`);
const scriptMatch = html.match(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/u);
if (!scriptMatch) throw new Error('Offline build did not produce one module script.');
const javascript = await readFile(localAssetPath(scriptMatch[1]), 'utf8');
const logoBuffer = await readFile(resolve(PROJECT_DIR, 'src/assets/logo.jpg'));
const logoBase64 = `data:image/jpeg;base64,${logoBuffer.toString('base64')}`;
const inlinedJs = javascript.replace(/(["'`])\.\/logo\.jpg\1/gu, JSON.stringify(logoBase64));
if (inlinedJs.includes('./logo.jpg')) throw new Error('Offline build failed to inline logo asset.');
html = html.replace(scriptMatch[0], () => `<script type="module">${inlinedJs.replace(/<\/script/giu, '<\\/script')}</script>`);
html = html.replace(/<link rel="icon"[^>]*>/u, `<link rel="icon" type="image/jpeg" href="${logoBase64}" />`);
if (/<(?:script|link)[^>]+(?:src|href)="(?!(?:https?:)?\/\/|data:)[^"]*assets\//u.test(html)) throw new Error('Offline HTML still references external build assets.');
const catalog = await readFile(CATALOG_PATH, 'utf8');
const catalogScript = `<script id="jx3-catalog-data" type="application/json">${catalog.replace(/</gu, '\\u003c')}</script>`;
html = html.replace('<div id="root"></div>', `${catalogScript}<div id="root"></div>`);
const inlineMarker = '<script type="module">';
const inlineStart = html.indexOf(inlineMarker);
const inlineEnd = html.indexOf('</script>', inlineStart);
if (inlineStart < 0 || inlineEnd <= inlineStart) throw new Error('Offline HTML does not contain one inline module script.');
const inlineJavaScript = html.slice(inlineStart + inlineMarker.length, inlineEnd);
new Script(inlineJavaScript, { filename: 'offline-inline.js' });
if (!html.includes('<div id="root"></div>')) throw new Error('Offline HTML is missing its root element.');

const ROOT_HTML = resolve(PROJECT_DIR, '../剑网3掉落工坊.html');

await rm(FINAL_DIR, { recursive: true, force: true });
await rename(TEMP_DIR, FINAL_DIR);
await writeFile(FINAL_HTML, html, 'utf8');
await writeFile(ROOT_HTML, html, 'utf8');
await rm(resolve(FINAL_DIR, 'assets'), { recursive: true, force: true });
await rm(resolve(FINAL_DIR, 'offline'), { recursive: true, force: true });
process.stdout.write(`${FINAL_HTML} (${Buffer.byteLength(html).toLocaleString('en-US')} bytes)\n`);
process.stdout.write(`${ROOT_HTML} (Root single-file offline copy synced)\n`);
