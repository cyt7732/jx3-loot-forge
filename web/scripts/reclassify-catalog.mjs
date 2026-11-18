import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClassifier } from '../src/catalog/classification-core.ts';
import { formatCatalogVersion } from '../src/catalog/levels.ts';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(SCRIPT_DIR, '..');
const TYPE_LABEL_RULES_PATH = resolve(PROJECT_DIR, 'src/catalog/type-label-rules.json');

const rules = JSON.parse(await readFile(TYPE_LABEL_RULES_PATH, 'utf8'));

// 与爬虫、前端共用同一份分类实现；规则从磁盘注入，避免 Node 对 JSON import 的限制。
const classifyItem = createClassifier(rules);

function normalizeText(value) {
  return typeof value === 'string' ? value.normalize('NFC').trim() : '';
}

function uniqueSorted(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))].sort((left, right) => (
    left < right ? -1 : left > right ? 1 : 0
  ));
}

/**
 * 纯离线重算一个物品的分类与展示类型。
 * 依赖快照中已持久化的原始信号（typeLabels / aucGenre / aucSubType / isEquip / slots），
 * 因此与爬虫的判定完全等价，不再需要「旧 category 是不是 equipment」这类间接证据。
 */
function reclassifyItem(item) {
  const typeLabels = uniqueSorted(Array.isArray(item.typeLabels) ? item.typeLabels : item.subtype ? [item.subtype] : []);
  const result = classifyItem({
    name: item.name,
    typeLabels,
    isEquip: item.isEquip,
    slot: item.slot,
    slots: item.slots,
    aucGenre: item.aucGenre,
    aucSubType: item.aucSubType,
  });

  const next = {
    ...item,
    category: result.category,
    typeLabels: result.typeLabels,
    classification: result.classification,
  };
  // 分类器给出的类型优先；否则保留既有类型（兑换牌的目标反查结果属于上游信息，离线无法重算），
  // 但「其他」哨兵一律清除。
  if (result.subtype) next.subtype = result.subtype;
  else if (next.subtype === rules.otherTypeLabel) delete next.subtype;
  return next;
}

function validateSnapshot(value, expectedClient) {
  if (!value || value.schemaVersion !== 1 || value.client !== expectedClient) throw new Error('目录版本或客户端类型不受支持。');
  if (!Array.isArray(value.maps) || !Array.isArray(value.items)) throw new Error('目录缺少 maps/items 数组。');
  const itemIds = new Set(value.items.map((item) => item.id));
  for (const map of value.maps) {
    for (const itemId of map.itemIds ?? []) {
      if (!itemIds.has(itemId)) throw new Error(`地图 ${map.mapId} 引用了不存在的物品：${itemId}`);
    }
  }
  if (value.stats?.maps !== value.maps.length || value.stats?.uniqueItems !== value.items.length) {
    throw new Error('目录统计与实际 maps/items 数量不一致。');
  }
}

async function reclassifyClient(client) {
  const sourcePath = resolve(PROJECT_DIR, `src/catalog/catalog.${client}.json`);
  const publicSnapshotPath = resolve(PROJECT_DIR, `public/data/catalog.${client}.json`);
  const publicManifestPath = resolve(PROJECT_DIR, `public/data/manifest.${client}.json`);

  const currentSnapshot = JSON.parse(await readFile(sourcePath, 'utf8'));
  validateSnapshot(currentSnapshot, client);
  currentSnapshot.items = currentSnapshot.items.map(reclassifyItem);
  validateSnapshot(currentSnapshot, client);

  const stablePayload = JSON.stringify({ ...currentSnapshot, catalogVersion: '', generatedAt: '', contentHash: '' });
  const contentHash = createHash('sha256').update(stablePayload).digest('hex');
  const generatedAt = typeof currentSnapshot.generatedAt === 'string' && currentSnapshot.generatedAt ? currentSnapshot.generatedAt : '1970-01-01T00:00:00.000Z';
  currentSnapshot.generatedAt = generatedAt;
  currentSnapshot.contentHash = contentHash;
  currentSnapshot.catalogVersion = formatCatalogVersion(
    typeof currentSnapshot.catalogVersion === 'string' ? currentSnapshot.catalogVersion : '',
    client,
  );

  const serialized = `${JSON.stringify(currentSnapshot)}\n`;
  await writeFile(sourcePath, serialized, 'utf8');
  await writeFile(publicSnapshotPath, serialized, 'utf8');

  const manifest = {
    schemaVersion: 1,
    client: currentSnapshot.client,
    catalogVersion: currentSnapshot.catalogVersion,
    generatedAt: currentSnapshot.generatedAt,
    contentHash: currentSnapshot.contentHash,
    stats: currentSnapshot.stats,
    completeness: currentSnapshot.completeness,
    source: currentSnapshot.source,
    hashAlgorithm: 'sha256-json-v1-excluding-generatedAt-catalogVersion-contentHash',
    snapshotUrl: `./catalog.${client}.json`,
  };
  const manifestSerialized = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(publicManifestPath, manifestSerialized, 'utf8');

  const categoryCounts = Object.fromEntries(
    [...currentSnapshot.items.reduce((counts, item) => counts.set(item.category, (counts.get(item.category) ?? 0) + 1), new Map())]
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  const withSubtype = currentSnapshot.items.filter((item) => item.subtype).length;
  process.stdout.write(`[${client}] ${JSON.stringify({ ...currentSnapshot.stats, withSubtype, categoryCounts })} hash=${contentHash} catalogVersion=${currentSnapshot.catalogVersion}\n`);
}

await reclassifyClient('std');
await reclassifyClient('origin');
