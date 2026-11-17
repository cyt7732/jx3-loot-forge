import type { CatalogSnapshot } from '../domain/types';

const DATABASE_NAME = 'jx3-loot-forge';
const STORE_NAME = 'catalog';
const LEGACY_OVERRIDE_KEY = 'std';
const OVERRIDE_KEY_PREFIX = 'catalog_override_';
const OFFICIAL_KEY_PREFIX = 'official_catalog_';
const MAX_DATA_PACK_BYTES = 25 * 1024 * 1024;

type CatalogClient = 'std' | 'origin';

export type CatalogSelection = {
  snapshot: CatalogSnapshot;
  usedOverride: boolean;
};

export async function loadOfficialCatalogCache(client: CatalogClient): Promise<CatalogSnapshot | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const database = await openDatabase();
    try {
      const key = `${OFFICIAL_KEY_PREFIX}${client}`;
      const value = await runRequest(database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key));
      if (!value || typeof value !== 'object') return null;
      const snapshot = value as CatalogSnapshot;
      if (
        snapshot.schemaVersion === 1
        && snapshot.client === client
        && Array.isArray(snapshot.maps)
        && Array.isArray(snapshot.items)
      ) {
        return snapshot;
      }
      return null;
    } finally {
      database.close();
    }
  } catch {
    return null;
  }
}

export async function saveOfficialCatalogCache(client: CatalogClient, snapshot: CatalogSnapshot): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const database = await openDatabase();
    try {
      const key = `${OFFICIAL_KEY_PREFIX}${client}`;
      await runRequest(database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(snapshot, key));
    } finally {
      database.close();
    }
  } catch {
    // 忽略缓存存储异常，不阻塞前台业务
  }
}

function parseGeneratedAt(value: string | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Select the catalog that should be active at startup.
 *
 * An override is user data and is still allowed to win when it is demonstrably
 * newer than the packaged catalog.  An older, equally dated, or untrusted
 * override is not allowed to hide the catalog shipped with the current app.
 * The old value remains in IndexedDB so that the user can still export or
 * replace it deliberately.
 */
export function selectCatalogSnapshot(
  embedded: CatalogSnapshot,
  override: CatalogSnapshot | null,
): CatalogSelection {
  if (!override) return { snapshot: embedded, usedOverride: false };
  if (override.client !== embedded.client) return { snapshot: embedded, usedOverride: false };
  if (override.contentHash === embedded.contentHash) return { snapshot: override, usedOverride: true };

  const embeddedGeneratedAt = parseGeneratedAt(embedded.generatedAt);
  const overrideGeneratedAt = parseGeneratedAt(override.generatedAt);
  if (
    embeddedGeneratedAt !== null
    && overrideGeneratedAt !== null
    && overrideGeneratedAt > embeddedGeneratedAt
  ) {
    return { snapshot: override, usedOverride: true };
  }

  return { snapshot: embedded, usedOverride: false };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolvePromise, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolvePromise(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开本地目录数据库。'));
  });
}

function runRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    request.onsuccess = () => resolvePromise(request.result);
    request.onerror = () => reject(request.error ?? new Error('本地目录数据库操作失败。'));
  });
}

export async function loadCatalogOverride(client: CatalogClient): Promise<CatalogSnapshot | null> {
  if (typeof indexedDB === 'undefined') return null;
  const database = await openDatabase();
  try {
    const store = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
    let value = await runRequest(store.get(`${OVERRIDE_KEY_PREFIX}${client}`));
    // 兼容 v1.6.3 及之前的单一槽位：旧键只可能存放旗舰端数据包
    if (!value && client === 'std') value = await runRequest(store.get(LEGACY_OVERRIDE_KEY));
    return value ? await validateCatalogSnapshot(value, client) : null;
  } finally {
    database.close();
  }
}

export async function saveCatalogOverride(client: CatalogClient, snapshot: CatalogSnapshot): Promise<void> {
  const validated = await validateCatalogSnapshot(snapshot, client);
  const database = await openDatabase();
  try {
    const store = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
    await runRequest(store.put(validated, `${OVERRIDE_KEY_PREFIX}${client}`));
    if (client === 'std') await runRequest(store.delete(LEGACY_OVERRIDE_KEY));
  } finally {
    database.close();
  }
}

export async function clearCatalogOverride(client: CatalogClient): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const database = await openDatabase();
  try {
    const store = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME);
    await runRequest(store.delete(`${OVERRIDE_KEY_PREFIX}${client}`));
    if (client === 'std') await runRequest(store.delete(LEGACY_OVERRIDE_KEY));
  } finally {
    database.close();
  }
}

export async function parseCatalogDataPack(text: string, client: CatalogClient): Promise<CatalogSnapshot> {
  if (new TextEncoder().encode(text).byteLength > MAX_DATA_PACK_BYTES) throw new Error('数据包超过 25 MiB 限制。');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('数据包不是有效的 JSON 文件。');
  }
  const declared = (parsed as Partial<CatalogSnapshot> | null)?.client;
  if (declared === 'std' || declared === 'origin') {
    if (declared !== client) {
      throw new Error(`该数据包属于「${declared === 'std' ? '旗舰正式服' : '缘起怀旧服'}」，请先切换到对应客户端再导入。`);
    }
  }
  return validateCatalogSnapshot(parsed, client);
}

export async function validateCatalogSnapshot(value: unknown, client: CatalogClient = 'std'): Promise<CatalogSnapshot> {
  if (!value || typeof value !== 'object') throw new Error('数据包结构无效。');
  const snapshot = value as CatalogSnapshot;
  if (snapshot.schemaVersion !== 1 || snapshot.client !== client || !Array.isArray(snapshot.maps) || !Array.isArray(snapshot.items)) throw new Error('不支持的数据包版本。');
  if (
    snapshot.completeness?.status !== 'complete'
    || snapshot.completeness.expectedMapCount !== snapshot.maps.length
    || snapshot.completeness.fetchedMapCount !== snapshot.maps.length
    || snapshot.completeness.failures.length !== 0
  ) throw new Error('数据包没有通过完整性检查。');
  if (snapshot.stats.maps !== snapshot.maps.length || snapshot.stats.uniqueItems !== snapshot.items.length) throw new Error('数据包统计与内容不一致。');
  if (!Number.isSafeInteger(snapshot.stats.bosses) || !Number.isSafeInteger(snapshot.stats.drops) || snapshot.stats.drops < snapshot.items.length) throw new Error('数据包统计字段无效。');
  if (!/^[a-f0-9]{64}$/u.test(snapshot.contentHash)) throw new Error('数据包内容哈希格式无效。');
  const ids = new Set<string>();
  const mapIds = new Set<number>();
  let bossCount = 0;
  for (const map of snapshot.maps) {
    if (!Number.isSafeInteger(map.mapId) || mapIds.has(map.mapId) || !Array.isArray(map.bossNames) || !Array.isArray(map.itemIds)) throw new Error('数据包包含无效或重复 MapID。');
    mapIds.add(map.mapId);
    bossCount += map.bossNames.length;
  }
  for (const item of snapshot.items) {
    if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || ids.has(item.id) || !Array.isArray(item.sources)) throw new Error('数据包包含无效或重复物品。');
    ids.add(item.id);
  }
  if (bossCount !== snapshot.stats.bosses) throw new Error('数据包 Boss 统计与内容不一致。');
  for (const map of snapshot.maps) {
    if (map.itemIds.some((id) => !ids.has(id))) throw new Error(`MapID ${map.mapId} 引用了不存在的物品。`);
  }
  for (const item of snapshot.items) {
    if (item.sources.some((source) => !source || !mapIds.has(source.mapId))) throw new Error(`物品“${item.name}”包含不存在的来源 MapID。`);
  }
  const hashInput = JSON.stringify({ ...snapshot, catalogVersion: '', generatedAt: '', contentHash: '' });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashInput));
  const actualHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (actualHash !== snapshot.contentHash) throw new Error('数据包内容哈希校验失败。');
  return snapshot;
}
