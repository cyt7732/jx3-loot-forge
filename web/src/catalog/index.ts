import type { CatalogItem, CatalogSnapshot } from '../domain/types';
import { loadOfficialCatalogCache, saveOfficialCatalogCache } from '../storage/catalog';

export * from './levels';

/**
 * A deliberately tiny placeholder keeps the application shell renderable
 * while the full catalog is fetched after hydration. The actual embedded
 * catalog is loaded by loadCatalogSnapshot().
 */
export const catalogSnapshot: CatalogSnapshot = {
  schemaVersion: 1,
  client: 'std',
  catalogVersion: 'loading',
  generatedAt: '',
  contentHash: '',
  source: '',
  stats: { maps: 0, bosses: 0, drops: 0, uniqueItems: 0 },
  maps: [],
  items: [],
};

const CATALOG_SCRIPT_ID = 'jx3-catalog-data';
const SNAPSHOT_CACHE = new Map<string, CatalogSnapshot>();
const BACKGROUND_CHECKED = new Set<string>();

function parseCatalogPayload(payload: string): CatalogSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new Error('数据目录 JSON 解析失败。');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('数据目录结构无效。');
  const snapshot = parsed as Partial<CatalogSnapshot>;
  if (
    snapshot.schemaVersion !== 1
    || (snapshot.client !== 'std' && snapshot.client !== 'origin')
    || !Array.isArray(snapshot.maps)
    || !Array.isArray(snapshot.items)
  ) {
    throw new Error('数据目录版本或结构不受支持。');
  }
  return snapshot as CatalogSnapshot;
}

function scheduleCatalogBackgroundCheck(client: 'std' | 'origin', currentSnapshot: CatalogSnapshot): void {
  if (BACKGROUND_CHECKED.has(client) || typeof window === 'undefined') return;
  BACKGROUND_CHECKED.add(client);

  const runCheck = async () => {
    try {
      const manifestUrl = new URL(`./data/manifest.${client}.json?t=${Date.now()}`, window.location.href);
      const manifestRes = await fetch(manifestUrl);
      if (!manifestRes.ok) return;
      const manifest = (await manifestRes.json()) as { contentHash?: string; catalogVersion?: string };

      if (
        (manifest.contentHash && manifest.contentHash === currentSnapshot.contentHash)
        || (manifest.catalogVersion && manifest.catalogVersion === currentSnapshot.catalogVersion)
      ) {
        return;
      }

      const catalogUrl = new URL(`./data/catalog.${client}.json`, window.location.href);
      const catalogRes = await fetch(catalogUrl);
      if (!catalogRes.ok) return;
      const newSnapshot = parseCatalogPayload(await catalogRes.text());
      SNAPSHOT_CACHE.set(client, newSnapshot);
      await saveOfficialCatalogCache(client, newSnapshot);

      window.dispatchEvent(
        new CustomEvent('jx3-catalog-updated', {
          detail: { client, catalogVersion: newSnapshot.catalogVersion, snapshot: newSnapshot },
        }),
      );
    } catch {
      // 忽略后台静默校验网络错误
    }
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => void runCheck(), { timeout: 3000 });
  } else {
    setTimeout(() => void runCheck(), 1000);
  }
}

/**
 * Loads the catalog outside the initial JavaScript module graph. Offline
 * builds provide the same payload in an application/json script node; the
 * hosted app reads the public data file instead.
 */
export async function loadCatalogSnapshot(client: 'std' | 'origin' = 'std'): Promise<CatalogSnapshot> {
  const cached = SNAPSHOT_CACHE.get(client);
  if (cached) return cached;

  if (typeof document !== 'undefined') {
    const embedded = document.getElementById(`${CATALOG_SCRIPT_ID}-${client}`)
      ?? (client === 'std' ? document.getElementById(CATALOG_SCRIPT_ID) : null);
    if (embedded?.textContent) {
      const parsed = parseCatalogPayload(embedded.textContent);
      SNAPSHOT_CACHE.set(client, parsed);
      return parsed;
    }
  }

  if (typeof window === 'undefined') throw new Error('只能在浏览器中加载数据目录。');

  // 1. 优先尝试从本地 IndexedDB 缓存读取，实现 0 延迟秒开
  const localCached = await loadOfficialCatalogCache(client).catch(() => null);
  if (localCached) {
    SNAPSHOT_CACHE.set(client, localCached);
    scheduleCatalogBackgroundCheck(client, localCached);
    return localCached;
  }

  // 2. 首次打开或本地无缓存时走网络请求，成功后异步写入本地 IndexedDB
  const url = new URL(`./data/catalog.${client}.json`, window.location.href);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`数据目录请求失败（HTTP ${response.status}）。`);
  const parsed = parseCatalogPayload(await response.text());
  SNAPSHOT_CACHE.set(client, parsed);
  void saveOfficialCatalogCache(client, parsed);
  return parsed;
}

export function buildCatalogItems(snapshot: CatalogSnapshot = catalogSnapshot): CatalogItem[] {
  return snapshot.items;
}
