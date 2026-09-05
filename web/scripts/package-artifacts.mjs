import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(SCRIPT_DIR, '../..');
const VERSION_PATH = resolve(PROJECT_DIR, 'VERSION.json');

const versionData = JSON.parse(await readFile(VERSION_PATH, 'utf8'));
const ver = versionData.appVersion;

const artDir = resolve(PROJECT_DIR, `artifacts/剑网3掉落工坊-v${ver}`);
const zipPath = resolve(PROJECT_DIR, `artifacts/jx3-loot-forge-v${ver}-offline.zip`);
const htmlSource = resolve(PROJECT_DIR, '剑网3掉落工坊.html');

await rm(artDir, { recursive: true, force: true });
await mkdir(artDir, { recursive: true });

await cp(htmlSource, resolve(artDir, 'index.html'));
await cp(resolve(PROJECT_DIR, 'CHANGELOG.md'), resolve(artDir, 'CHANGELOG.md'));
await cp(resolve(PROJECT_DIR, 'README.md'), resolve(artDir, 'README.md'));
await cp(resolve(PROJECT_DIR, 'LICENSE'), resolve(artDir, 'LICENSE'));
await cp(VERSION_PATH, resolve(artDir, 'VERSION.json'));

const changelog = await readFile(resolve(PROJECT_DIR, 'CHANGELOG.md'), 'utf8');
const versionHeaderRegex = new RegExp(`## \\[${ver.replace(/\./g, '\\.')}\\][^\n]*\n([\\s\\S]*?)(?=\\n## \\[|$)`);
const match = changelog.match(versionHeaderRegex);

let releaseNotes = `# 剑网3掉落工坊 v${ver}\n\n`;
if (match && match[1]) {
  releaseNotes += match[1].trim() + '\n';
} else {
  releaseNotes += `剑网3掉落工坊 v${ver} 正式发布。\n`;
}

await writeFile(resolve(artDir, 'RELEASE_NOTES.md'), releaseNotes, 'utf8');

try {
  await rm(zipPath, { force: true });
} catch {}

if (process.platform === 'win32') {
  execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${artDir}' -DestinationPath '${zipPath}' -Force`]);
} else {
  execFileSync('zip', ['-r', zipPath, `剑网3掉落工坊-v${ver}`], { cwd: resolve(PROJECT_DIR, 'artifacts') });
}

console.log(`[SUCCESS] Generated local artifacts for v${ver} at ${artDir}`);
console.log(`[SUCCESS] Generated offline zip at ${zipPath}`);