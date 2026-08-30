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
- **导出空数据二次确认弹窗拦截机制**：
  - 当左侧未勾选任何副本、Boss 或自定义条目直接点击导出时，弹出友好的确认对话框，明确提示将生成空白规则文件；
  - 提供【返回勾选范围】与【仍要导出空白文件】清晰路径，杜绝玩家因误操作导出空文件；
  - 配备优雅的危险与警告卡片视觉，提升交互安全性与防御性。
- **左侧侧边栏【导出规则】常驻说明**：
  - 明确规范文案：“仅勾选（✓）的副本与物品会写入配置文件；未勾选内容即使已配置策略也不会导出”，消除玩家对单选聚焦与多选导出的理解歧义。
- **全文档与全库版本号 100% 统一**：全链路统一升级至 v${ver}，离线单文件与多端产物 100% 闭环。
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