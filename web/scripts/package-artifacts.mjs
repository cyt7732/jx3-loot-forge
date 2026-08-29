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

await mkdir(artDir, { recursive: true });

await cp(htmlSource, resolve(artDir, 'index.html'));
await cp(resolve(PROJECT_DIR, 'CHANGELOG.md'), resolve(artDir, 'CHANGELOG.md'));
await cp(resolve(PROJECT_DIR, 'README.md'), resolve(artDir, 'README.md'));
await cp(resolve(PROJECT_DIR, 'LICENSE'), resolve(artDir, 'LICENSE'));
await cp(VERSION_PATH, resolve(artDir, 'VERSION.json'));

const releaseNotes = `# 剑网3掉落工坊 v${ver}

### 更新亮点
- **【极速开始】快捷引导面板**：未选择副本范围时主区呈现居中拟态引导卡片，提供【一键全选前尘老本】与【聚焦当前赛季】两大高频入口，快速进入策略配置。
- **宽屏自适应水平居中与 100% 经典美学复原**：完美复原 v1.2.0 高质感毛玻璃悬浮卡片美学，确保在 1080P、2K 及超宽屏显示器下始终对称居中展示。
- **离线版 Logo Base64 自动化可靠内嵌**：升级离线打包管线，确保离线单文件在无网络本地环境中 100% 正常显示应用 Logo 与 Favicon。
- **字体非阻塞异步加载与优雅呈现**：采用异步加载与 font-display: swap，首屏 0 延迟秒开并平滑过渡至鸿蒙字体（HarmonyOS Sans SC）。
- **策略区标题自适应与排版语病修复**：消除范围为空时的前后矛盾用词，移除孤立折行冒号与生硬技术术语。
`;

await writeFile(resolve(artDir, 'RELEASE_NOTES.md'), releaseNotes, 'utf8');

try {
  await rm(zipPath, { force: true });
} catch {}

if (process.platform === 'win32') {
  execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${artDir}\\*' -DestinationPath '${zipPath}' -Force`]);
} else {
  execFileSync('zip', ['-r', zipPath, `剑网3掉落工坊-v${ver}`], { cwd: resolve(PROJECT_DIR, 'artifacts') });
}

console.log(`[SUCCESS] Generated local artifacts for v${ver} at ${artDir}`);
console.log(`[SUCCESS] Generated offline zip at ${zipPath}`);