import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_DIR = resolve(__dirname, '..');
const SVG_ICON = resolve(PROJECT_DIR, 'public/favicon.svg');
const ICONS_OUT = resolve(PROJECT_DIR, 'src-tauri/icons');

console.log('[INFO] Generating Tauri multi-resolution application icons...');
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
execFileSync(npxCmd, ['--yes', '@tauri-apps/cli', 'icon', SVG_ICON, '-o', ICONS_OUT], {
  cwd: PROJECT_DIR,
  stdio: 'inherit'
});
console.log('[SUCCESS] All Tauri icons generated in web/src-tauri/icons');
