import { copyFile, mkdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(SCRIPT_DIR, '..');
const SOURCE_DIR = resolve(PROJECT_DIR, 'src/catalog');
const TARGET_DIR = resolve(PROJECT_DIR, 'public/data');

// src/catalog/catalog.*.json 是唯一入库的目录数据源（离线版构建也从这里内联）。
// public/data/ 下的同名副本仅供在线版运行时按需拉取，已加入 .gitignore，
// 由本脚本在开发与构建前同步生成，避免同一份 19MB 数据在仓库里存两份。
const CLIENTS = ['std', 'origin'];

let copied = 0;
for (const client of CLIENTS) {
  const source = resolve(SOURCE_DIR, `catalog.${client}.json`);
  const exists = await stat(source).then(() => true, (error) => (error.code === 'ENOENT' ? false : Promise.reject(error)));
  if (!exists) {
    process.stderr.write(`Note: src/catalog/catalog.${client}.json 不存在，跳过同步。\n`);
    continue;
  }
  await mkdir(TARGET_DIR, { recursive: true });
  await copyFile(source, resolve(TARGET_DIR, `catalog.${client}.json`));
  copied += 1;
}

if (copied === 0) throw new Error('src/catalog 下没有任何目录数据文件，请先运行 crawl:catalog。');
process.stdout.write(`[sync-public-data] 已同步 ${copied} 个目录数据文件到 public/data/。\n`);
