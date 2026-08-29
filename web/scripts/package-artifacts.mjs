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
- **【聚焦当前赛季】搜索联动与体验修复**：修复在搜索过滤状态下点击“聚焦当前赛季”无响应的问题，现在无论处于何种搜索词下均能精准直达 130 级（丝路风语）并自动重置搜索视野。
- **Boss 精细化双击/右键勾选控制**：全面支持在侧栏 Boss 节点上双击或右键快速切换单个 Boss 的导出勾选状态，并在聚焦详情顶栏提供一键勾选/取消勾选，实现文案提示与功能完全闭环。
- **跨平台离线包发布结构 100% 统一**：统一 Windows 与 Linux/CI 本地打包管线，生成的离线 ZIP 压缩包均规范包含 \`剑网3掉落工坊-v${ver}/\` 独立顶层目录，打包前自动执行产物清理，杜绝历史文件夹带。
- **全文档与版本规范闭环**：对齐 README 徽章、更新日志与交接文档，确保发布资产唯一性与可复现性。
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