import { describe, expect, it } from 'vitest';
import { loadOfficialCatalogCache, saveOfficialCatalogCache } from '../src/storage/catalog';
import type { CatalogSnapshot } from '../src/domain/types';

function createMockSnapshot(client: 'std' | 'origin' = 'std', version = 'test-v1'): CatalogSnapshot {
  return {
    schemaVersion: 1,
    client,
    catalogVersion: version,
    generatedAt: '2026-11-02T00:00:00.000Z',
    contentHash: 'mock-hash',
    source: 'mock',
    stats: { maps: 1, bosses: 1, drops: 1, uniqueItems: 1 },
    maps: [{ mapId: 1, name: '测试副本', expansion: '测试版本', difficulty: '25人普通', bossNames: ['首领'], itemIds: ['物品1'] }],
    items: [{ id: '物品1', name: '物品1', category: 'equipment', sources: [{ mapId: 1, mapName: '测试副本', expansion: '测试版本', difficulty: '25人普通', bossName: '首领' }] }],
  };
}

describe('official catalog IndexedDB caching', () => {
  it('returns null gracefully when indexedDB is undefined in node environment', async () => {
    const cached = await loadOfficialCatalogCache('std');
    expect(cached).toBeNull();
  });

  it('completes write operation without throwing when indexedDB is undefined', async () => {
    const snapshot = createMockSnapshot('std');
    await expect(saveOfficialCatalogCache('std', snapshot)).resolves.toBeUndefined();
  });

  it('correctly saves and retrieves catalog snapshots using mock IndexedDB', async () => {
    const memoryStore = new Map<string, unknown>();

    const mockDb = {
      transaction: () => ({
        objectStore: () => ({
          get: (key: string) => {
            const req: { result: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null } = {
              result: memoryStore.get(key),
              onsuccess: null,
              onerror: null,
            };
            queueMicrotask(() => req.onsuccess?.());
            return req;
          },
          put: (val: unknown, key: string) => {
            memoryStore.set(key, val);
            const req: { result: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null } = {
              result: key,
              onsuccess: null,
              onerror: null,
            };
            queueMicrotask(() => req.onsuccess?.());
            return req;
          },
        }),
      }),
      close: () => undefined,
    };

    const mockIndexedDB = {
      open: () => {
        const req: { result: typeof mockDb; onsuccess: (() => void) | null; onerror: (() => void) | null; onupgradeneeded: (() => void) | null } = {
          result: mockDb,
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
        };
        queueMicrotask(() => req.onsuccess?.());
        return req;
      },
    };

    // @ts-expect-error mock environment assignment
    globalThis.indexedDB = mockIndexedDB;

    try {
      const stdSnapshot = createMockSnapshot('std', 'data.旗舰_测试_v1_261102');
      const originSnapshot = createMockSnapshot('origin', 'data.缘起_测试_v1_261102');

      await saveOfficialCatalogCache('std', stdSnapshot);
      await saveOfficialCatalogCache('origin', originSnapshot);

      const retrievedStd = await loadOfficialCatalogCache('std');
      const retrievedOrigin = await loadOfficialCatalogCache('origin');

      expect(retrievedStd).toEqual(stdSnapshot);
      expect(retrievedOrigin).toEqual(originSnapshot);

      // 验证损坏/不兼容数据结构能够被安全过滤
      memoryStore.set('official_catalog_std', { invalid: true });
      const corrupted = await loadOfficialCatalogCache('std');
      expect(corrupted).toBeNull();
    } finally {
      // @ts-expect-error clean up mock
      delete globalThis.indexedDB;
    }
  });
});
