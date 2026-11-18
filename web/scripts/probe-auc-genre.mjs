/**
 * 只读探测：抽样核实上游 `item_merged` 的 AucGenre / AucSubType / TypeLabel 语义，
 * 用于决定分类规则能否用结构化字段替代名字启发式。
 *
 * 用法：node scripts/probe-auc-genre.mjs [--sample=400]
 * 输出：AucGenre × 当前分类 × TypeLabel 的交叉分布，以及关键假设的违规清单。
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(SCRIPT_DIR, '..');
const BASE_URL = 'https://node.jx3box.com';
const CONCURRENCY = 5;

const sampleArg = process.argv.find((a) => a.startsWith('--sample='));
const TARGET_SAMPLE = Number(sampleArg?.split('=')[1] ?? 400);

const snapshot = JSON.parse(readFileSync(resolve(PROJECT_DIR, 'src/catalog/catalog.std.json'), 'utf8'));
const items = snapshot.items;

/** 分层抽样：按分类配额，保证宠物/兑换牌/特效武器等小类有足够样本 */
const QUOTA = {
  equipment: 120, equipmentExchange: 140, pet: 80, specialWeapon: 40,
  specialDrop: 30, material: 20, recipe: 20, furniture: 20, currency: 10,
  smallIron: 8, bigIron: 8, smallEnchant: 8, bigEnchant: 8, unknown: 43,
  other: 0, consumable: 0, task: 0, companion: 0,
};

const byCategory = new Map();
for (const item of items) {
  if (!byCategory.has(item.category)) byCategory.set(item.category, []);
  byCategory.get(item.category).push(item);
}

const sample = [];
for (const [category, list] of byCategory) {
  const quota = QUOTA[category] ?? 10;
  // 等距抽样，避免只取到字母序靠前的一批
  const step = Math.max(1, Math.floor(list.length / Math.max(1, quota)));
  for (let i = 0; i < list.length && sample.filter((s) => s.category === category).length < quota; i += step) {
    sample.push(list[i]);
  }
}

process.stdout.write(`抽样 ${sample.length} 个物品（目标 ${TARGET_SAMPLE}），分类分布：${JSON.stringify(
  Object.fromEntries([...new Set(sample.map((s) => s.category))].map((c) => [c, sample.filter((s) => s.category === c).length])),
)}\n`);

async function fetchByName(name) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/item_merged/name/${encodeURIComponent(name)}?client=std&strict=1&per=5`, {
        headers: { accept: 'application/json', 'user-agent': 'JX3-Loot-Forge/probe' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const value = await response.json();
      if (!value || !Array.isArray(value.list)) return null;
      return value.list.find((meta) => meta.Name === name) ?? value.list[0] ?? null;
    } catch {
      await new Promise((r) => setTimeout(r, 400 * (2 ** attempt)));
    }
  }
  return null;
}

async function mapPool(list, worker, limit) {
  const results = new Array(list.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, list.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= list.length) return;
      results[index] = await worker(list[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

const probed = [];
let done = 0;
await mapPool(sample, async (item) => {
  const meta = await fetchByName(item.name);
  probed.push({
    name: item.name,
    category: item.category,
    subtype: item.subtype ?? null,
    typeLabels: item.typeLabels ?? [],
    aucGenre: Number.isFinite(meta?.AucGenre) ? meta.AucGenre : null,
    aucSubType: Number.isFinite(meta?.AucSubType) ? meta.AucSubType : null,
    isEquip: meta?.IsEquip === true,
    upstreamTypeLabel: meta?.TypeLabel ?? '',
    hasLink: Boolean(meta?.Desc && meta.Desc.includes('iteminfolink')),
  });
  done += 1;
  if (done % 50 === 0) process.stdout.write(`probed ${done}/${sample.length}\n`);
}, CONCURRENCY);

const missing = probed.filter((p) => p.aucGenre === null && p.upstreamTypeLabel === '' && !p.isEquip);

// 交叉表：AucGenre → 当前分类 / 上游 TypeLabel
const table = {};
for (const p of probed) {
  const key = p.aucGenre === null ? 'null' : String(p.aucGenre);
  table[key] ??= { count: 0, categories: {}, typeLabels: {}, aucSubTypes: {} };
  table[key].count += 1;
  table[key].categories[p.category] = (table[key].categories[p.category] ?? 0) + 1;
  const label = p.upstreamTypeLabel || '(空)';
  table[key].typeLabels[label] = (table[key].typeLabels[label] ?? 0) + 1;
  if (p.aucSubType !== null) table[key].aucSubTypes[p.aucSubType] = (table[key].aucSubTypes[p.aucSubType] ?? 0) + 1;
}

// 关键假设校验
const violations = {
  'pet 但 genre≠22': probed.filter((p) => p.category === 'pet' && p.aucGenre !== 22).map((p) => `${p.name} genre=${p.aucGenre}`),
  'genre=22 但非 pet': probed.filter((p) => p.aucGenre === 22 && p.category !== 'pet').map((p) => `${p.name} cat=${p.category}`),
  '兑换牌但 genre≠20': probed.filter((p) => p.category === 'equipmentExchange' && p.aucGenre !== 20).slice(0, 40).map((p) => `${p.name} genre=${p.aucGenre}`),
  'genre=20 但非兑换牌': probed.filter((p) => p.aucGenre === 20 && p.category !== 'equipmentExchange').map((p) => `${p.name} cat=${p.category}`),
};

const exchangeWithLink = probed.filter((p) => p.category === 'equipmentExchange' && p.hasLink).length;
const exchangeTotal = probed.filter((p) => p.category === 'equipmentExchange').length;

process.stdout.write(`\n=== AucGenre 交叉分布 ===\n${JSON.stringify(table, null, 2)}\n`);
process.stdout.write(`\n=== 关键假设违规 ===\n${JSON.stringify(violations, null, 2)}\n`);
process.stdout.write(`\n兑换牌样本 ${exchangeTotal} 个，其中 ${exchangeWithLink} 个 Desc 含 iteminfolink 链接\n`);
process.stdout.write(`无任何上游信号（genre/TypeLabel/IsEquip 全空）的样本：${missing.length} 个\n`);
