import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

let token = process.env.GITHUB_TOKEN;
if (!token) {
  try {
    token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  } catch {
    console.error('[ERROR] No GitHub token found.');
  }
}

const repo = process.env.GITHUB_REPOSITORY || 'cyt7732/jx3-loot-forge';
const tag = process.env.GITHUB_REF_NAME || 'v1.0.5';

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'JX3-Loot-Forge-Release-Script',
};

console.log('[INFO] Fetching release info for tag:', tag);
const releaseRes = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, { headers });
if (!releaseRes.ok) throw new Error(`Failed to fetch release: ${releaseRes.status} ${await releaseRes.text()}`);
const releaseData = await releaseRes.json();

console.log(`[INFO] Found release id ${releaseData.id}. Cleaning existing assets...`);
for (const asset of releaseData.assets) {
  console.log(`[INFO] Deleting asset ${asset.name} (id: ${asset.id})...`);
  await fetch(`https://api.github.com/repos/${repo}/releases/assets/${asset.id}`, { method: 'DELETE', headers });
}

const filesToUpload = [
  { name: `剑网3掉落工坊-${tag}.exe`, path: resolve(`剑网3掉落工坊-${tag}.exe`), type: 'application/x-msdownload' },
  { name: `JX3-Loot-Forge-${tag}.exe`, path: resolve(`剑网3掉落工坊-${tag}.exe`), type: 'application/x-msdownload' },
  { name: '剑网3掉落工坊.html', path: resolve('剑网3掉落工坊.html'), type: 'text/html; charset=utf-8' },
];

for (const file of filesToUpload) {
  try {
    console.log(`[INFO] Reading file ${file.path}...`);
    const buffer = await readFile(file.path);
    console.log(`[INFO] Uploading ${file.name} (${buffer.length} bytes)...`);
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
