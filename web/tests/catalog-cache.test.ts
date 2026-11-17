import { describe, expect, it } from 'vitest';
import {
  clearCatalogOverride,
  loadCatalogOverride,
  loadOfficialCatalogCache,
  saveCatalogOverride,
  saveOfficialCatalogCache,
} from '../src/storage/catalog';
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

type MockRequest = { result: unknown; onsuccess: (() => void) | null; onerror: (() => void) | null };

function installMockIndexedDB(memoryStore: Map<string, unknown>): () => void {
  const mockDb = {
    transaction: () => ({
      objectStore: () => ({
        get: (key: string) => {
          const req: MockRequest = { result: memoryStore.get(key), onsuccess: null, onerror: null };
          queueMicrotask(() => req.onsuccess?.());
          return req;
        },
        put: (val: unknown, key: string) => {
          memoryStore.set(key, val);
          const req: MockRequest = { result: key, onsuccess: null, onerror: null };
          queueMicrotask(() => req.onsuccess?.());
          return req;
        },
        delete: (key: string) => {
          memoryStore.delete(key);
          const req: MockRequest = { result: undefined, onsuccess: null, onerror: null };
          queueMicrotask(() => req.onsuccess?.());
          return req;
        },
      }),
    }),
    close: () => undefined,
  };

  const mockIndexedDB = {
    open: () => {
      const req: MockRequest & { onupgradeneeded: (() => void) | null } = { result: mockDb, onsuccess: null, onerror: null, onupgradeneeded: null };
      queueMicrotask(() => req.onsuccess?.());
      return req;
    },
  };

  // @ts-expect-error mock environment assignment
  globalThis.indexedDB = mockIndexedDB;
  return () => {
    // @ts-expect-error clean up mock
    delete globalThis.indexedDB;
  };
}

async function hashedSnapshot(client: 'std' | 'origin', generatedAt: string): Promise<CatalogSnapshot> {
  const snapshot: CatalogSnapshot = {
    schemaVersion: 1,
    client,
    catalogVersion: `data.${client === 'std' ? '旗舰' : '缘起'}_测试_v1_261105`,
    generatedAt,
    contentHash: '',
    source: 'mock',
    stats: { maps: 1, bosses: 1, drops: 1, uniqueItems: 1 },
    completeness: { status: 'complete', expectedMapCount: 1, fetchedMapCount: 1, metadataMissing: 0, metadataMismatch: 0, failures: [] },
    maps: [{ mapId: 1, name: '测试副本', expansion: '测试版本', difficulty: '25人普通', bossNames: ['首领'], itemIds: ['物品1'] }],
    items: [{ id: '物品1', name: '物品1', category: 'equipment', sources: [{ mapId: 1, mapName: '测试副本', expansion: '测试版本', difficulty: '25人普通', bossName: '首领' }] }],
  };
  const hashInput = JSON.stringify({ ...snapshot, catalogVersion: '', generatedAt: '', contentHash: '' });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(hashInput));
  snapshot.contentHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return snapshot;
}

describe('per-client catalog override slots', () => {
  it('stores overrides in per-client slots and never leaks across clients', async () => {
    const cleanup = installMockIndexedDB(new Map());
    try {
      const stdSnapshot = await hashedSnapshot('std', '2026-11-05T00:00:00.000Z');
      const originSnapshot = await hashedSnapshot('origin', '2026-11-05T00:00:00.000Z');
      await saveCatalogOverride('std', stdSnapshot);
      await saveCatalogOverride('origin', originSnapshot);

      await expect(loadCatalogOverride('std')).resolves.toEqual(stdSnapshot);
      await expect(loadCatalogOverride('origin')).resolves.toEqual(originSnapshot);

      await clearCatalogOverride('std');
      await expect(loadCatalogOverride('std')).resolves.toBeNull();
      await expect(loadCatalogOverride('origin')).resolves.toEqual(originSnapshot);
    } finally {
      cleanup();
    }
  });

  it('rejects saving an override whose client does not match the slot', async () => {
    const cleanup = installMockIndexedDB(new Map());
    try {
      const stdSnapshot = await hashedSnapshot('std', '2026-11-05T00:00:00.000Z');
      await expect(saveCatalogOverride('origin', stdSnapshot)).rejects.toThrow('不支持的数据包版本');
      await expect(loadCatalogOverride('origin')).resolves.toBeNull();
    } finally {
      cleanup();
    }
  });

  it('reads a legacy single-slot std override without exposing it to the origin client', async () => {
    const memoryStore = new Map<string, unknown>();
    const cleanup = installMockIndexedDB(memoryStore);
    try {
      const legacy = await hashedSnapshot('std', '2026-11-04T00:00:00.000Z');
      memoryStore.set('std', legacy);

      await expect(loadCatalogOverride('std')).resolves.toEqual(legacy);
      await expect(loadCatalogOverride('origin')).resolves.toBeNull();

      await clearCatalogOverride('std');
      await expect(loadCatalogOverride('std')).resolves.toBeNull();
    } finally {
      cleanup();
    }
  });

  it('removes the legacy slot when saving a new std override', async () => {
    const memoryStore = new Map<string, unknown>();
    const cleanup = installMockIndexedDB(memoryStore);
    try {
      const legacy = await hashedSnapshot('std', '2026-11-04T00:00:00.000Z');
      memoryStore.set('std', legacy);

      const fresh = await hashedSnapshot('std', '2026-11-05T00:00:00.000Z');
      await saveCatalogOverride('std', fresh);

      expect(memoryStore.has('std')).toBe(false);
      await expect(loadCatalogOverride('std')).resolves.toEqual(fresh);
    } finally {
      cleanup();
    }
  });
});
