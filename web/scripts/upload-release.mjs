import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(SCRIPT_DIR, '../..');
const VERSION_PATH = resolve(PROJECT_DIR, 'VERSION.json');

let token = process.env.GITHUB_TOKEN;
if (!token) {
  try {
    token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  } catch {
    console.error('[ERROR] No GitHub token found.');
  }
}

const versionData = JSON.parse(await readFile(VERSION_PATH, 'utf8'));
const repo = process.env.GITHUB_REPOSITORY || 'cyt7732/jx3-loot-forge';
const tag = process.env.GITHUB_REF_NAME || versionData.tag || `v${versionData.appVersion}`;

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'JX3-Loot-Forge-Release-Script',
};

console.log('[INFO] Fetching release info for tag:', tag);
const releaseRes = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, { headers });
if (!releaseRes.ok) throw new Error(`Failed to fetch release: ${releaseRes.status} ${await releaseRes.text()}`);
const releaseData = await releaseRes.json();

const releaseNotesPath = resolve(PROJECT_DIR, `artifacts/剑网3掉落工坊-v${versionData.appVersion}/RELEASE_NOTES.md`);
try {
  const notesContent = await readFile(releaseNotesPath, 'utf8');
  console.log('[INFO] Updating release description from RELEASE_NOTES.md...');
  const patchRes = await fetch(`https://api.github.com/repos/${repo}/releases/${releaseData.id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: notesContent }),
  });
  if (patchRes.ok) {
    console.log('[SUCCESS] Release description updated successfully!');
  } else {
    console.error('[WARN] Failed to update release description:', patchRes.status, await patchRes.text());
  }
} catch (err) {
  console.warn('[WARN] Could not read RELEASE_NOTES.md:', err.message);
}

console.log(`[INFO] Found release id ${releaseData.id}. Cleaning all existing assets...`);
for (const asset of releaseData.assets) {
  console.log(`[INFO] Deleting asset ${asset.name} (id: ${asset.id})...`);
  await fetch(`https://api.github.com/repos/${repo}/releases/assets/${asset.id}`, { method: 'DELETE', headers });
}

// GitHub Releases requires ASCII asset names to prevent URL truncation / mangling
const filesToUpload = [
  { name: `jx3-loot-forge-${tag}-offline.zip`, path: resolve(PROJECT_DIR, `artifacts/jx3-loot-forge-${tag}-offline.zip`), type: 'application/zip' },
];

for (const file of filesToUpload) {
  try {
    console.log(`[INFO] Reading file ${file.path}...`);
    const buffer = await readFile(file.path);
    console.log(`[INFO] Uploading clean asset ${file.name} (${buffer.length} bytes)...`);
    const uploadUrl = `https://uploads.github.com/repos/${repo}/releases/${releaseData.id}/assets?name=${encodeURIComponent(file.name)}`;
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': file.type,
        'Content-Length': String(buffer.length),
      },
      body: buffer,
    });
    if (!uploadRes.ok) {
      console.error(`[ERROR] Failed to upload ${file.name}:`, uploadRes.status, await uploadRes.text());
    } else {
      console.log(`[SUCCESS] Uploaded ${file.name} successfully!`);
    }
  } catch (err) {
    console.error(`[WARN] Could not upload ${file.name}:`, err.message);
  }
}
