import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClassifier, slotFromAucGenre } from '../src/catalog/classification-core.ts';
import { extractExchangeTargets } from './exchange-targets.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(SCRIPT_DIR, '..');

const args = process.argv.slice(2);
const clientArg = args.find((a) => a.startsWith('--client='))?.split('=')[1] ?? (args.includes('origin') ? 'origin' : 'std');
const CLIENT = clientArg === 'origin' ? 'origin' : 'std';

const OUTPUT_PATH = resolve(PROJECT_DIR, `src/catalog/catalog.${CLIENT}.json`);
const TEMP_PATH = resolve(PROJECT_DIR, `src/catalog/catalog.${CLIENT}.json.tmp`);
const PUBLIC_SNAPSHOT_PATH = resolve(PROJECT_DIR, `public/data/catalog.${CLIENT}.json`);
const PUBLIC_MANIFEST_PATH = resolve(PROJECT_DIR, `public/data/manifest.${CLIENT}.json`);
const TYPE_LABEL_RULES_PATH = resolve(PROJECT_DIR, 'src/catalog/type-label-rules.json');
const VERSION_RULES_PATH = resolve(PROJECT_DIR, 'src/catalog/version-rules.json');
const BASE_URL = 'https://node.jx3box.com';
const CONCURRENCY = 4;

const TYPE_LABEL_RULES = JSON.parse(await readFile(TYPE_LABEL_RULES_PATH, 'utf8'));
const VERSION_RULES = JSON.parse(await readFile(VERSION_RULES_PATH, 'utf8'));

// 分类逻辑只有一份：与前端 / 重分类脚本共用 classification-core。
const classifyItem = createClassifier(TYPE_LABEL_RULES);

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

const WEAPON_TYPE_LABELS = new Set(TYPE_LABEL_RULES.weaponTypeLabels ?? []);
const TYPE_LABEL_SLOTS = new Map(Object.entries(TYPE_LABEL_RULES.typeLabelSlots ?? {}));

/** 结构化字段优先，TypeLabel 回退；非装备返回 undefined。 */
function slotFor(meta) {
  if (!meta || meta.IsEquip !== true) return undefined;
  const fromGenre = slotFromAucGenre(TYPE_LABEL_RULES, meta.AucGenre, meta.AucSubType);
  if (fromGenre) return fromGenre;
  const label = normalizeLabel(meta.TypeLabel);
  if (WEAPON_TYPE_LABELS.has(label)) return 'weapon';
  return TYPE_LABEL_SLOTS.get(label) ?? 'unknown';
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
    const value = await fetchJson(`/item_merged/id/${chunk.join(',')}?client=${CLIENT}&per=50`);
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
    const value = await fetchJson(`/item_merged/name/${encodeURIComponent(name)}?client=${CLIENT}&strict=1&per=50`);
    const list = value && typeof value === 'object' && Array.isArray(value.list) ? value.list.filter((meta) => meta.Name === name) : [];
    const signatures = new Set(list.map(metadataSignature));
    if (list.length > 0 && signatures.size === 1) fallbackByName.set(name, list[0]);
    fallbackDone += 1;
    if (fallbackDone % 25 === 0 || fallbackDone === missingEntries.length) process.stdout.write(`fallback ${fallbackDone}/${missingEntries.length}\n`);
  });

  return { byKey, fallbackByName, totalVariants: variants.size, mismatches };
}

async function main() {
  const rawInfo = assertArray(await fetchJson(`/fb/info?client=${CLIENT}`), 'fb/info');
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
        fetchJson(`/fb/boss?MapID=${mapRow.MapID}&client=${CLIENT}`),
        fetchJson(`/fb/drop/v2/${mapRow.MapID}?client=${CLIENT}`),
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
      const slot = slotFor(meta);
      const classificationResult = classifyItem({
        name,
        typeLabels: meta?.TypeLabel ? [normalizeLabel(meta.TypeLabel)] : [],
        isEquip: meta?.IsEquip === true,
        slot,
        slots: slot ? [slot] : [],
        aucGenre: Number.isFinite(meta?.AucGenre) ? meta.AucGenre : undefined,
        aucSubType: Number.isFinite(meta?.AucSubType) ? meta.AucSubType : undefined,
      });
      const category = classificationResult.category;
      const quality = Number.isFinite(drop.ItemQuality) ? drop.ItemQuality : Number.isFinite(meta?.Quality) ? meta.Quality : undefined;
      const level = (category === 'equipment' || category === 'specialWeapon') && Number.isFinite(meta?.Level) ? meta.Level : undefined;
      const source = {
        mapId: mapRow.MapID,
        mapName,
        expansion,
        difficulty,
        bossName: normalizeLabel(drop.BossName, '未知 Boss'),
      };
      const current = itemsById.get(id) ?? {
        id, name, categories: new Set(), subtypes: new Set(), typeLabels: new Set(), qualities: [], levels: [], slots: new Set(),
        classifications: new Set(), aucGenres: new Set(), aucSubTypes: new Set(), isEquips: new Set(),
        exchangeTargets: [], descHasLinks: false, sources: new Map(),
      };
      current.categories.add(category);
      for (const typeLabel of classificationResult.typeLabels) {
        current.typeLabels.add(typeLabel);
      }
      if (classificationResult.subtype) current.subtypes.add(classificationResult.subtype);
      if (quality !== undefined) current.qualities.push(quality);
      if (level !== undefined) current.levels.push(level);
      if (slot) current.slots.add(slot);
      current.classifications.add(classificationResult.classification);
      if (Number.isFinite(meta?.AucGenre)) current.aucGenres.add(meta.AucGenre);
      if (Number.isFinite(meta?.AucSubType)) current.aucSubTypes.add(meta.AucSubType);
      if (typeof meta?.IsEquip === 'boolean') current.isEquips.add(meta.IsEquip);
      // 兑换牌反查素材：Desc 中的可兑换目标装备名（后续统一批量解析类型）
      const targets = extractExchangeTargets(meta?.Desc);
      if (targets.length > 0) {
        current.descHasLinks = true;
        for (const target of targets) if (!current.exchangeTargets.includes(target)) current.exchangeTargets.push(target);
      }
      current.sources.set(`${source.mapId}\u0000${source.bossName}`, source);
      itemsById.set(id, current);
      itemIds.add(id);
    }

    maps.push({ mapId: mapRow.MapID, name: mapName, expansion, difficulty, bossNames, itemIds: [...itemIds].sort(compareText) });
  }

  // ---- 兑换牌类型反查：用 Desc 里的目标装备 TypeLabel 推导真实部位 ----
  const exchangeItems = [...itemsById.values()].filter((item) => item.categories.size === 1 && item.categories.has('equipmentExchange'));
  const targetNames = [...new Set(exchangeItems.flatMap((item) => item.exchangeTargets))];
  process.stdout.write(`兑换牌 ${exchangeItems.length} 个，待反查目标装备 ${targetNames.length} 个\n`);

  const targetTypeByName = new Map();
  let resolvedTargets = 0;
  await mapPool(targetNames, async (targetName) => {
    try {
      const value = await fetchJson(`/item_merged/name/${encodeURIComponent(targetName)}?client=${CLIENT}&strict=1&per=5`);
      const list = value && Array.isArray(value.list) ? value.list.filter((meta) => meta.Name === targetName) : [];
      if (list.length === 0) return;
      const signatures = new Set(list.map((meta) => normalizeLabel(meta.TypeLabel)));
      if (signatures.size !== 1) return; // 同名目标类型不一致，放弃
      const label = normalizeLabel(list[0].TypeLabel);
      if (!label || label === TYPE_LABEL_RULES.otherTypeLabel) return;
      targetTypeByName.set(targetName, label);
      resolvedTargets += 1;
    } catch {
      // 单个目标解析失败不影响整体抓取
    }
  }, CONCURRENCY);
  process.stdout.write(`兑换牌目标反查成功 ${resolvedTargets}/${targetNames.length}\n`);

  const items = [...itemsById.values()].map((item) => {
    const categories = [...item.categories];
    const category = categories.length === 1 ? categories[0] : 'unknown';
    const qualities = item.qualities;
    const levels = item.levels;
    const slots = [...item.slots].sort(compareText);
    const typeLabels = [...item.typeLabels].sort(compareText);
    const sources = [...item.sources.values()].sort((left, right) => (
      left.mapId - right.mapId
      || compareText(left.bossName, right.bossName)
      || compareText(left.mapName, right.mapName)
      || compareText(left.difficulty, right.difficulty)
    ));

    // 兑换牌类型：优先目标装备的权威 TypeLabel；多个目标解析出不同部位时视为不一致，不写
    let subtypeValue = item.subtypes.size === 1 ? [...item.subtypes][0] : undefined;
    if (category === 'equipmentExchange' && item.exchangeTargets.length > 0) {
      const targetTypes = new Set(item.exchangeTargets.map((target) => targetTypeByName.get(target)).filter(Boolean));
      if (targetTypes.size === 1) subtypeValue = [...targetTypes][0];
    }

    return {
      id: item.id,
      name: item.name,
      category,
      typeLabels,
      ...(subtypeValue ? { subtype: subtypeValue } : {}),
      ...(qualities.length ? { qualityMin: Math.min(...qualities), qualityMax: Math.max(...qualities) } : {}),
      ...(levels.length ? { itemLevelMin: Math.min(...levels), itemLevelMax: Math.max(...levels) } : {}),
      ...(slots.length ? { slots } : {}),
      ...(item.aucGenres.size === 1 ? { aucGenre: [...item.aucGenres][0] } : {}),
      ...(item.aucSubTypes.size === 1 ? { aucSubType: [...item.aucSubTypes][0] } : {}),
      ...(item.isEquips.size === 1 ? { isEquip: [...item.isEquips][0] } : {}),
      classification: item.classifications.size === 1 ? [...item.classifications][0] : 'unknown',
      sources,
    };
  });
  maps.sort((a, b) => compareText(a.expansion, b.expansion) || compareText(a.name, b.name) || a.mapId - b.mapId);
  items.sort((a, b) => compareText(a.name, b.name));

  function resolveCatalogVersionTag(client, mapList, date = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: '2-digit', month: '2-digit', day: '2-digit',
    }).formatToParts(date).map((part) => [part.type, part.value]));
    const yymmdd = `${parts.year}${parts.month}${parts.day}`;
    const rule = VERSION_RULES[client];
    if (client === 'origin') {
      // 大版本探测：v3=风骨霸刀(风雷刀谷/夕颜阁), v2=弈血上阳(上阳宫/归墟), v1=剑胆琴心(永王行宫/仙侣庭园)
      const hasFenggu = mapList.some((m) => m.name.includes('风雷刀谷') || m.name.includes('夕颜阁'));
      const hasYixue = mapList.some((m) => m.name.includes('上阳宫') || m.name.includes('归墟'));
      const season = hasFenggu ? 'v3' : hasYixue ? 'v2' : 'v1';
      return `data.${rule.client}_${rule.expansion}_${season}_${yymmdd}`;
    }
    const hasCangsheng = mapList.some((m) => m.expansion?.includes('苍生铸世') || m.name?.includes('洛阳之战'));
    if (hasCangsheng) {
      return `data.${rule.client}_苍生铸世_v1_${yymmdd}`;
    }
    return `data.${rule.client}_${rule.expansion}_${rule.season}_${yymmdd}`;
  }

  const generatedAt = new Date().toISOString();
  const snapshot = {
    schemaVersion: 1,
    client: CLIENT,
    catalogVersion: '',
    generatedAt,
    contentHash: '',
    source: `${BASE_URL}/fb/info?client=${CLIENT}`,
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
  snapshot.catalogVersion = resolveCatalogVersionTag(CLIENT, maps, new Date(generatedAt));

  const serialized = `${JSON.stringify(snapshot)}\n`;
  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await mkdir(dirname(PUBLIC_SNAPSHOT_PATH), { recursive: true });
  await writeFile(TEMP_PATH, serialized, 'utf8');
  await unlink(OUTPUT_PATH).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  await rename(TEMP_PATH, OUTPUT_PATH);
  await writeFile(PUBLIC_SNAPSHOT_PATH, serialized, 'utf8');

  const manifestContent = `${JSON.stringify({
    schemaVersion: 1,
    client: snapshot.client,
    catalogVersion: snapshot.catalogVersion,
    generatedAt: snapshot.generatedAt,
    contentHash: snapshot.contentHash,
    stats: snapshot.stats,
    completeness: snapshot.completeness,
    source: snapshot.source,
    hashAlgorithm: 'sha256-json-v1-excluding-generatedAt-catalogVersion-contentHash',
    snapshotUrl: `./catalog.${CLIENT}.json`,
  }, null, 2)}\n`;

  await writeFile(PUBLIC_MANIFEST_PATH, manifestContent, 'utf8');
  process.stdout.write(`${JSON.stringify(snapshot.stats)} hash=${hash}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
