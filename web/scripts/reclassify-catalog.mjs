import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(SCRIPT_DIR, '..');
const SOURCE_PATH = resolve(PROJECT_DIR, 'src/catalog/catalog.std.json');
const PUBLIC_SNAPSHOT_PATH = resolve(PROJECT_DIR, 'public/data/catalog.std.json');
const PUBLIC_MANIFEST_PATH = resolve(PROJECT_DIR, 'public/data/manifest.json');
const TYPE_LABEL_RULES_PATH = resolve(PROJECT_DIR, 'src/catalog/type-label-rules.json');

const snapshot = JSON.parse(await readFile(SOURCE_PATH, 'utf8'));
const rules = JSON.parse(await readFile(TYPE_LABEL_RULES_PATH, 'utf8'));

function normalizeText(value) {
  return typeof value === 'string' ? value.normalize('NFC').trim() : '';
}

function hasExplicitSlot(item) {
  const unknownValues = new Set((rules.secondaryRules.unknownSlotValues ?? []).map((value) => String(value).toLocaleLowerCase()));
  return [item.slot, ...(item.slots ?? [])].some((value) => {
    const normalized = normalizeText(value).toLocaleLowerCase();
    return normalized.length > 0 && !unknownValues.has(normalized);
  });
}

function endsWithEquipmentPart(value) {
  const tokens = [...rules.secondaryRules.equipmentPartTokens]
    .sort((left, right) => right.length - left.length);
  return tokens.find((token) => value.endsWith(token));
}

function isSetAndSchoolName(name) {
  const parts = name.split('·');
  if (parts.length < 2) return false;
  const school = parts.at(-1);
  if (!school || !rules.secondaryRules.schools.includes(school)) return false;
  const setAndPart = parts.slice(0, -1).join('·');
  return setAndPart.length > 0 && endsWithEquipmentPart(setAndPart) !== undefined;
}

function hasEquipmentPartSegment(name) {
  return name.split('·').some((part) => endsWithEquipmentPart(part) !== undefined);
}

function classifyByRules(item, typeLabels) {
  const typeLabel = typeLabels.length === 1 ? typeLabels[0] : '';

  for (const [category, labels] of Object.entries(rules.primaryTypeLabels)) {
    if (typeLabel && labels?.includes(typeLabel)) {
      return { category, classification: 'type-label' };
    }
  }

  const isExactlyOther = typeLabels.length === 1 && typeLabel === rules.otherTypeLabel;
  const isMissingTypeLabel = typeLabels.length === 0;
  if (!isExactlyOther && !isMissingTypeLabel) return null;

  const secondary = rules.secondaryRules;
  const classification = isExactlyOther ? 'type-label-other-rule' : 'type-label-missing-fallback';
  // This order is part of the user-confirmed rule contract.
  // `pet` is the migrated representation of an equipment row with no usable
  // slot. Treat it as the same evidence on a second run so the migration is
  // idempotent after the first pass.
  if (secondary.petWhenEquipWithoutExplicitSlot && (item.category === 'equipment' || item.category === 'pet') && !hasExplicitSlot(item)) {
    return { category: 'pet', classification };
  }
  if (item.name.endsWith(secondary.nameSuffixes.bigIron)) {
    return { category: 'bigIron', classification };
  }
  if (item.name.endsWith(secondary.nameSuffixes.smallIron)) {
    return { category: 'smallIron', classification };
  }
  if (secondary.equipmentExchangePrefixes.some((prefix) => item.name.startsWith(prefix))) {
    return { category: 'equipmentExchange', classification };
  }
  if (isSetAndSchoolName(item.name) || hasEquipmentPartSegment(item.name)) {
    return { category: 'equipmentExchange', classification };
  }
  if (isExactlyOther) return { category: 'specialDrop', classification };
  return { category: 'unknown', classification };
}

function uniqueSorted(values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))].sort((left, right) => (
    left < right ? -1 : left > right ? 1 : 0
  ));
}

function reclassifyItem(item) {
  const typeLabels = uniqueSorted(Array.isArray(item.typeLabels) ? item.typeLabels : item.subtype ? [item.subtype] : []);
  const result = classifyByRules(item, typeLabels);

  const category = result?.category ?? item.category;
  const classification = result?.classification ?? 'unknown';

  return {
    ...item,
    category,
    typeLabels,
    classification,
  };
}

function validateSnapshot(value) {
  if (!value || value.schemaVersion !== 1 || value.client !== 'std') throw new Error('目录版本或客户端类型不受支持。');
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

validateSnapshot(snapshot);
snapshot.items = snapshot.items.map(reclassifyItem);
validateSnapshot(snapshot);

// Keep the existing generatedAt so repeated offline migrations are byte-stable.
// The catalog hash intentionally excludes generatedAt/catalogVersion/contentHash.
const stablePayload = JSON.stringify({ ...snapshot, catalogVersion: '', generatedAt: '', contentHash: '' });
const contentHash = createHash('sha256').update(stablePayload).digest('hex');
const generatedAt = typeof snapshot.generatedAt === 'string' && snapshot.generatedAt ? snapshot.generatedAt : '1970-01-01T00:00:00.000Z';
snapshot.generatedAt = generatedAt;
snapshot.contentHash = contentHash;
snapshot.catalogVersion = `${generatedAt.slice(0, 10).replaceAll('-', '')}-${contentHash.slice(0, 12)}`;

const serialized = `${JSON.stringify(snapshot)}\n`;
await writeFile(SOURCE_PATH, serialized, 'utf8');
await writeFile(PUBLIC_SNAPSHOT_PATH, serialized, 'utf8');

const manifest = {
  schemaVersion: 1,
  client: snapshot.client,
  catalogVersion: snapshot.catalogVersion,
  generatedAt: snapshot.generatedAt,
  contentHash: snapshot.contentHash,
  stats: snapshot.stats,
  completeness: snapshot.completeness,
  source: snapshot.source,
  hashAlgorithm: 'sha256-json-v1-excluding-generatedAt-catalogVersion-contentHash',
  snapshotUrl: './catalog.std.json',
};
await writeFile(PUBLIC_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const categoryCounts = Object.fromEntries(
  [...snapshot.items.reduce((counts, item) => counts.set(item.category, (counts.get(item.category) ?? 0) + 1), new Map())]
    .sort(([left], [right]) => left.localeCompare(right)),
);
process.stdout.write(`${JSON.stringify({ ...snapshot.stats, categoryCounts })} hash=${contentHash} catalogVersion=${snapshot.catalogVersion}\n`);
