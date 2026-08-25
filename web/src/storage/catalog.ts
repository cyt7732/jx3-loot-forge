import type { CatalogSnapshot } from '../domain/types';

const DATABASE_NAME = 'jx3-loot-forge';
const STORE_NAME = 'catalog';
const KEY = 'std';
const MAX_DATA_PACK_BYTES = 25 * 1024 * 1024;

export type CatalogSelection = {
  snapshot: CatalogSnapshot;
  usedOverride: boolean;
};

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

export async function loadCatalogOverride(): Promise<CatalogSnapshot | null> {
  if (typeof indexedDB === 'undefined') return null;
  const database = await openDatabase();
  try {
    const value = await runRequest(database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(KEY));
    return value ? await validateCatalogSnapshot(value) : null;
  } finally {
    database.close();
  }
}

export async function saveCatalogOverride(snapshot: CatalogSnapshot): Promise<void> {
  const validated = await validateCatalogSnapshot(snapshot);
  const database = await openDatabase();
  try {
    await runRequest(database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(validated, KEY));
  } finally {
    database.close();
  }
}

export async function clearCatalogOverride(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const database = await openDatabase();
  try {
    await runRequest(database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(KEY));
  } finally {
    database.close();
  }
}

export async function parseCatalogDataPack(text: string): Promise<CatalogSnapshot> {
  if (new TextEncoder().encode(text).byteLength > MAX_DATA_PACK_BYTES) throw new Error('数据包超过 25 MiB 限制。');
  return validateCatalogSnapshot(JSON.parse(text));
}

export async function validateCatalogSnapshot(value: unknown): Promise<CatalogSnapshot> {
  if (!value || typeof value !== 'object') throw new Error('数据包结构无效。');
  const snapshot = value as CatalogSnapshot;
  if (snapshot.schemaVersion !== 1 || snapshot.client !== 'std' || !Array.isArray(snapshot.maps) || !Array.isArray(snapshot.items)) throw new Error('不支持的数据包版本。');
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
