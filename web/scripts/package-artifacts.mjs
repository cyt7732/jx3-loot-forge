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

const releaseNotes = `# 剑网3掉落工坊 v${ver}

### 更新亮点
- **「炜历」与「鱼历」版本纪元重构**：
  - 正式引入纪元体系：将 70~130 级（风起稻香至丝路风语）划定为「炜历」（经典前尘纪元），将 50 级等级压缩及未来新资料片划定为「鱼历」（等级压缩新纪元）；
  - 预置鱼历 50 级首个版本称号「苍生铸世」（『苍生铸世』鱼历 Lv.50），并在侧边栏树形目录中预置展示。
- **安全时间线前尘老本判定引擎**：
  - 彻底废除基于 \`level < maxLevel\`（纯数字大小比较）的老本筛选逻辑，杜绝 50 级新版本因数值小于 130 级被误判为历史老本的架构隐患；
  - 动态精准适配“全选老本”、“聚焦当前赛季”与“旧版装备一键自动出售”。
- **侧边栏专属纪元徽章与视觉精细排版**：
  - 各等级节点配备专属纪元徽章（【炜历】典雅古金 / 【鱼历】灵动碧青），移入 Lv. 前方并优化层级排版；
  - 面包屑与聚焦顶栏完整展示版本与纪元信息。
- **全文档与全库版本号 100% 统一**：全链路统一升级至 v1.3.0，离线单文件与多端产物 100% 闭环。
`;

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