import type { CatalogItem, CatalogSnapshot } from '../domain/types';

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
  const url = new URL(`./data/catalog.${client}.json`, window.location.href);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`数据目录请求失败（HTTP ${response.status}）。`);
  const parsed = parseCatalogPayload(await response.text());
  SNAPSHOT_CACHE.set(client, parsed);
  return parsed;
}

export function buildCatalogItems(snapshot: CatalogSnapshot = catalogSnapshot): CatalogItem[] {
  return snapshot.items;
}
