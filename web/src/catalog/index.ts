import rawSnapshot from './catalog.std.json';
import { DEFAULT_PROTECTED_ITEMS } from '../domain/constants';
import { normalizeItemName } from '../domain/state';
import type { CatalogItem, CatalogSnapshot } from '../domain/types';

export const catalogSnapshot = rawSnapshot as CatalogSnapshot;

export function buildCatalogItems(snapshot: CatalogSnapshot = catalogSnapshot): CatalogItem[] {
  const byId = new Map(snapshot.items.map((item) => [item.id, item]));
  for (const name of DEFAULT_PROTECTED_ITEMS) {
    const id = normalizeItemName(name);
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name,
        category: 'unknown',
        subtype: '系统保护基线',
        sources: [],
      });
    }
  }
  return [...byId.values()];
}
