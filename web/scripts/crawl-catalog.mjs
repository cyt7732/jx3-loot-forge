import { createHash } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(SCRIPT_DIR, '..');
const OUTPUT_PATH = resolve(PROJECT_DIR, 'src/catalog/catalog.std.json');
const TEMP_PATH = resolve(PROJECT_DIR, 'src/catalog/catalog.std.json.tmp');
const PUBLIC_SNAPSHOT_PATH = resolve(PROJECT_DIR, 'public/data/catalog.std.json');
const PUBLIC_MANIFEST_PATH = resolve(PROJECT_DIR, 'public/data/manifest.json');
const BASE_URL = 'https://node.jx3box.com';
const CONCURRENCY = 4;

const MATERIAL_GENRES = new Set([10, 13, 14, 15]);
const RECIPE_GENRES = new Set([7, 8, 12]);
const CONSUMABLE_GENRES = new Set([9]);
const OTHER_GENRES = new Set([-1, 5, 6, 16, 20, 21]);
const MATERIAL_LABELS = new Set(['材料', '物品强化', '帮会产物', '瑰石', '宝石', '五行石', '五彩石']);
const RECIPE_LABELS = new Set([
  '秘笈', '通用秘笈', '五毒秘笈', '唐门秘笈', '明教秘笈', '丐帮秘笈', '天策秘笈', '藏剑秘笈',
  '纯阳秘笈', '七秀秘笈', '少林秘笈', '万花秘笈', '苍云秘笈', '长歌秘笈', '霸刀秘笈',
  '蓬莱秘笈', '凌雪阁秘笈', '衍天宗秘笈', '北天药宗秘笈', '配方', '铸造配方', '缝纫配方',
  '烹饪配方', '医术配方', '杂集', '道学', '佛学',
]);
const CONSUMABLE_LABELS = new Set(['消耗品', '食物', '药品', '礼品', '草料', '兵鉴']);
const OTHER_LABELS = new Set([
  '任务物品', '景观', '家具', '收集', '建筑', '坐骑', '奇趣坐骑', '坐骑头饰', '坐骑胸饰',
  '坐骑足饰', '坐骑鞍饰', '坐骑幼崽', '背包', '宝箱', '钥匙', '垃圾', '其他',
]);

const SLOT_LABELS = new Map([
  ['上衣', 'chest'], ['帽子', 'head'], ['腰带', 'belt'], ['下装', 'legs'], ['鞋子', 'feet'], ['护腕', 'wrists'],
  ['项链', 'necklace'], ['戒指', 'ring'], ['腰坠', 'pendant'], ['腰部挂件', 'waist_ornament'],
  ['背部挂件', 'back_ornament'], ['披风', 'cloak'], ['投掷', 'ranged'], ['弓弦', 'ranged'], ['弹药', 'ranged'],
]);
const WEAPON_LABELS = new Set([
  '兵刃', '武器', '棍类', '长兵类', '短兵类', '双兵类', '笔类', '重兵类', '虫笛类', '千机匣',
  '弯刀', '棒', '盾刀', '琴', '傲霜刀', '伞', '链刃', '魂灯', '百草卷', '横刀', '弓箭', '扇',
]);

function normalizeLabel(value, fallback = '') {
  return typeof value === 'string' ? value.normalize('NFC').trim() : fallback;
}

function exactName(value) {
  if (typeof value !== 'string' || value.length === 0) throw new Error('Drop row has an empty ItemName.');
  return value.normalize('NFC');
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

async function fetchJson(path, attempt = 0) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: { accept: 'application/json', 'user-agent': 'JX3-Loot-Forge/0.1.1' },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (attempt < 4) {
      await sleep(500 * (2 ** attempt) + Math.random() * 250);
      return fetchJson(path, attempt + 1);
    }
    throw error;
  }
  if (!response.ok) {
    if ((response.status === 408 || response.status === 429 || response.status >= 500) && attempt < 4) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * (2 ** attempt) + Math.random() * 250;
      await sleep(delay);
      return fetchJson(path, attempt + 1);
    }
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  const value = await response.json();
  if (value && typeof value === 'object' && !Array.isArray(value) && value.code && value.msg) {
    throw new Error(`${path} returned business error ${value.code}: ${value.msg}`);
  }
  return value;
}

async function mapPool(values, worker, concurrency = CONCURRENCY) {
  const output = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(values[index], index);
    }
  }));
  return output;
}

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} response is not an array.`);
  return value;
}

function variantKey(drop) {
  return drop.ItemExtID ? `${drop.ItemType}_${drop.ItemID}_${drop.ItemExtID}` : `${drop.ItemType}_${drop.ItemID}`;
}

function classify(meta) {
  if (!meta || typeof meta !== 'object') return 'unknown';
  if (meta.IsEquip === true) return 'equipment';
  if (meta.IsEquip !== false) return 'unknown';
  const genre = typeof meta.AucGenre === 'number' ? meta.AucGenre : null;
  if (MATERIAL_GENRES.has(genre)) return 'material';
  if (RECIPE_GENRES.has(genre)) return 'recipe';
  if (CONSUMABLE_GENRES.has(genre)) return 'consumable';
  if (OTHER_GENRES.has(genre)) return 'other';
  const label = normalizeLabel(meta.TypeLabel);
  if (MATERIAL_LABELS.has(label)) return 'material';
  if (RECIPE_LABELS.has(label) || /(?:秘笈|配方)$/u.test(label)) return 'recipe';
  if (CONSUMABLE_LABELS.has(label)) return 'consumable';
  if (OTHER_LABELS.has(label)) return 'other';
  return 'unknown';
}

function slotFor(meta) {
  if (!meta || meta.IsEquip !== true) return undefined;
  const genre = meta.AucGenre;
  const subtype = meta.AucSubType;
  if (genre === 1) return 'weapon';
  if (genre === 2) return 'ranged';
  if (genre === 3) return ({ 1: 'chest', 2: 'head', 3: 'belt', 4: 'legs', 5: 'feet', 6: 'wrists' })[subtype] ?? 'unknown';
  if (genre === 4) return ({ 1: 'necklace', 2: 'ring', 3: 'pendant', 4: 'waist_ornament', 5: 'back_ornament', 6: 'cloak' })[subtype] ?? 'unknown';
  const label = normalizeLabel(meta.TypeLabel);
  if (WEAPON_LABELS.has(label)) return 'weapon';
  return SLOT_LABELS.get(label) ?? 'unknown';
}

function metadataSignature(meta) {
  return JSON.stringify([meta.IsEquip, meta.AucGenre, meta.AucSubType, normalizeLabel(meta.TypeLabel), meta.Level, meta.Quality]);
}

async function fetchMetadata(drops) {
  const variants = new Map();
  for (const drop of drops) {
    const key = variantKey(drop);
    if (!variants.has(key)) variants.set(key, drop);
  }
  const keys = [...variants.keys()];
  const chunks = [];
  for (let index = 0; index < keys.length; index += 50) chunks.push(keys.slice(index, index + 50));
  let metadataChunksDone = 0;
  const responses = await mapPool(chunks, async (chunk) => {
    const value = await fetchJson(`/item_merged/id/${chunk.join(',')}?client=std&per=50`);
    if (!value || typeof value !== 'object' || !Array.isArray(value.list)) throw new Error('item_merged id response has invalid envelope.');
    metadataChunksDone += 1;
    if (metadataChunksDone % 25 === 0 || metadataChunksDone === chunks.length) process.stdout.write(`metadata ${metadataChunksDone}/${chunks.length}\n`);
    return value.list;
  });
  const byKey = new Map();
  for (const list of responses) {
    for (const meta of list) {
      // `id` is the public composite key (for example `6_22765`).
      // `idKey` is an unrelated internal numeric row id and must not be used.
      const key = String(meta.id ?? '');
      if (key) byKey.set(key, meta);
    }
  }

  const missingNames = new Map();
  let mismatches = 0;
  for (const [key, drop] of variants) {
    const meta = byKey.get(key);
    if (!meta || meta.Name !== drop.ItemName) {
      if (meta) mismatches += 1;
      missingNames.set(exactName(drop.ItemName), drop);
      byKey.delete(key);
    }
  }

  const fallbackByName = new Map();
  const missingEntries = [...missingNames.entries()];
  let fallbackDone = 0;
  await mapPool(missingEntries, async ([name]) => {
    const value = await fetchJson(`/item_merged/name/${encodeURIComponent(name)}?client=std&strict=1&per=50`);
    const list = value && typeof value === 'object' && Array.isArray(value.list) ? value.list.filter((meta) => meta.Name === name) : [];
    const signatures = new Set(list.map(metadataSignature));
    if (list.length > 0 && signatures.size === 1) fallbackByName.set(name, list[0]);
    fallbackDone += 1;
    if (fallbackDone % 25 === 0 || fallbackDone === missingEntries.length) process.stdout.write(`fallback ${fallbackDone}/${missingEntries.length}\n`);
  });

  return { byKey, fallbackByName, totalVariants: variants.size, mismatches };
}

async function main() {
  const rawInfo = assertArray(await fetchJson('/fb/info?client=std'), 'fb/info');
  // JX3BOX currently prefixes one documented empty sentinel row (MapID=0).
  // Accept only that exact shape; never silently drop other malformed rows.
  const sentinels = rawInfo.filter((row) => row?.MapID === 0);
  if (sentinels.length !== 1 || sentinels[0].OtherName !== null || sentinels[0].VersionName !== null || sentinels[0].Layer3Name !== null) {
    throw new Error('fb/info does not contain the expected single empty MapID=0 sentinel.');
  }
  const invalidMapIndex = rawInfo.findIndex((row) => !row || !Number.isSafeInteger(row.MapID) || row.MapID < 0);
  if (invalidMapIndex >= 0) throw new Error(`fb/info row ${invalidMapIndex} contains an invalid MapID.`);
  const info = rawInfo.filter((row) => row.MapID > 0).sort((left, right) => left.MapID - right.MapID);
  const mapIds = new Set(info.map((row) => row.MapID));
  if (mapIds.size !== info.length) throw new Error('fb/info contains duplicate MapID values.');

  const failures = [];
  let mapsDone = 0;
  const fetched = await mapPool(info, async (mapRow) => {
    try {
      const [bosses, drops] = await Promise.all([
        fetchJson(`/fb/boss?MapID=${mapRow.MapID}&client=std`),
        fetchJson(`/fb/drop/v2/${mapRow.MapID}?client=std`),
      ]);
      const result = { mapRow, bosses: assertArray(bosses, `boss ${mapRow.MapID}`), drops: assertArray(drops, `drop ${mapRow.MapID}`) };
      mapsDone += 1;
      if (mapsDone % 25 === 0 || mapsDone === info.length) process.stdout.write(`maps ${mapsDone}/${info.length}\n`);
      return result;
    } catch (error) {
      failures.push(`MapID ${mapRow.MapID}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  });
  if (failures.length > 0) throw new Error(`Catalog crawl incomplete:\n${failures.join('\n')}`);
  const rows = fetched.filter(Boolean);
  const allDrops = rows.flatMap((entry) => entry.drops);
  const metadata = await fetchMetadata(allDrops);

  const itemsById = new Map();
  const maps = [];
  let bossCount = 0;
  for (const entry of rows) {
    const mapRow = entry.mapRow;
    const expansion = normalizeLabel(mapRow.VersionName, '未知版本');
    const mapName = normalizeLabel(mapRow.OtherName, `Map ${mapRow.MapID}`);
    const difficulty = normalizeLabel(mapRow.Layer3Name, '未知难度');
    const bossNames = [...new Set(entry.bosses.map((boss) => normalizeLabel(boss.BOSS)).filter(Boolean))].sort(compareText);
    bossCount += bossNames.length;
    const itemIds = new Set();

    for (const drop of entry.drops) {
      if (drop.MapID !== mapRow.MapID) throw new Error(`Drop ${drop.id} has mismatched MapID.`);
      const name = exactName(drop.ItemName);
      const id = name;
      const key = variantKey(drop);
      const directMeta = metadata.byKey.get(key);
      const fallbackMeta = !directMeta ? metadata.fallbackByName.get(name) : undefined;
      const meta = directMeta ?? fallbackMeta;
      const category = classify(meta);
      const slot = slotFor(meta);
      const quality = Number.isFinite(drop.ItemQuality) ? drop.ItemQuality : Number.isFinite(meta?.Quality) ? meta.Quality : undefined;
      const level = category === 'equipment' && Number.isFinite(meta?.Level) ? meta.Level : undefined;
      const source = {
        mapId: mapRow.MapID,
        mapName,
        expansion,
        difficulty,
        bossName: normalizeLabel(drop.BossName, '未知 Boss'),
      };
      const current = itemsById.get(id) ?? {
        id, name, categories: new Set(), subtypes: new Set(), qualities: [], levels: [], slots: new Set(), classifications: new Set(), sources: new Map(),
      };
      current.categories.add(category);
      if (normalizeLabel(meta?.TypeLabel)) current.subtypes.add(normalizeLabel(meta.TypeLabel));
      if (quality !== undefined) current.qualities.push(quality);
      if (level !== undefined) current.levels.push(level);
      if (slot) current.slots.add(slot);
      current.classifications.add(directMeta ? 'metadata' : fallbackMeta ? 'name-fallback' : 'unknown');
      current.sources.set(`${source.mapId}\u0000${source.bossName}`, source);
      itemsById.set(id, current);
      itemIds.add(id);
    }

    maps.push({ mapId: mapRow.MapID, name: mapName, expansion, difficulty, bossNames, itemIds: [...itemIds].sort(compareText) });
  }

  const items = [...itemsById.values()].map((item) => {
    const categories = [...item.categories];
    const category = categories.length === 1 ? categories[0] : 'unknown';
    const qualities = item.qualities;
    const levels = item.levels;
    const slots = [...item.slots].sort(compareText);
    const sources = [...item.sources.values()].sort((left, right) => (
      left.mapId - right.mapId
      || compareText(left.bossName, right.bossName)
      || compareText(left.mapName, right.mapName)
      || compareText(left.difficulty, right.difficulty)
    ));
    return {
      id: item.id,
      name: item.name,
      category,
      ...(item.subtypes.size === 1 ? { subtype: [...item.subtypes][0] } : {}),
      ...(qualities.length ? { qualityMin: Math.min(...qualities), qualityMax: Math.max(...qualities) } : {}),
      ...(levels.length ? { itemLevelMin: Math.min(...levels), itemLevelMax: Math.max(...levels) } : {}),
      ...(slots.length ? { slots } : {}),
      classification: item.classifications.size === 1 ? [...item.classifications][0] : 'unknown',
      sources,
    };
  });
  maps.sort((a, b) => compareText(a.expansion, b.expansion) || compareText(a.name, b.name) || a.mapId - b.mapId);
  items.sort((a, b) => compareText(a.name, b.name));

  const generatedAt = new Date().toISOString();
  const snapshot = {
    schemaVersion: 1,
    client: 'std',
    catalogVersion: '',
    generatedAt,
    contentHash: '',
    source: `${BASE_URL}/fb/info?client=std`,
    stats: { maps: maps.length, bosses: bossCount, drops: allDrops.length, uniqueItems: items.length },
    completeness: {
      status: 'complete', expectedMapCount: info.length, fetchedMapCount: rows.length,
      metadataMissing: metadata.totalVariants - metadata.byKey.size - metadata.fallbackByName.size,
      metadataMismatch: metadata.mismatches, failures,
    },
    maps,
    items,
  };
  // The data hash deliberately excludes crawl time and display version so an
  // unchanged upstream catalog does not trigger a needless client update.
  const stablePayload = JSON.stringify({ ...snapshot, catalogVersion: '', generatedAt: '', contentHash: '' });
  const hash = createHash('sha256').update(stablePayload).digest('hex');
  snapshot.contentHash = hash;
  snapshot.catalogVersion = `${generatedAt.slice(0, 10).replaceAll('-', '')}-${hash.slice(0, 12)}`;

  const serialized = `${JSON.stringify(snapshot)}\n`;
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await mkdir(dirname(PUBLIC_SNAPSHOT_PATH), { recursive: true });
  await writeFile(TEMP_PATH, serialized, 'utf8');
  await unlink(OUTPUT_PATH).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  await rename(TEMP_PATH, OUTPUT_PATH);
  await writeFile(PUBLIC_SNAPSHOT_PATH, serialized, 'utf8');
  await writeFile(PUBLIC_MANIFEST_PATH, `${JSON.stringify({
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
  }, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(snapshot.stats)} hash=${hash}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
